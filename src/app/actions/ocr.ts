'use server'

import prisma from '@/lib/prisma'
import { getSession } from './auth'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator, normalizeLocale } from '@/lib/i18n'
import { hasPublicLedgerAccess } from '@/lib/access'
import { getAISettings } from './settings'
import {
  fillOcrUserPrompt,
  formatOcrAttachmentMemo,
  formatOcrKeywordsForNote,
  normalizeOcrResult,
  parseJsonFromText,
  parseOcrAmount,
  resolveOcrEndpoint,
  type OcrContext,
} from '@/lib/ocr'
import { revalidatePath } from 'next/cache'

type RecognizeAttachmentInput = {
  imageDataUrl: string
  context: OcrContext
}

type RecognizeAndAppendInput = {
  attachmentId: string
  context: OcrContext
}

function extractAssistantText(payload: any) {
  const firstChoice = payload?.choices?.[0]
  const content = firstChoice?.message?.content

  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item
        if (item?.type === 'output_text') return item.text || ''
        if (item?.type === 'text') return item.text || ''
        return ''
      })
      .join('\n')
  }

  return ''
}

function appendNote(existing: string | null | undefined, addition: string) {
  const next = addition.trim()
  if (!next) return existing || null
  const current = (existing || '').trim()
  return current ? `${current}\n${next}` : next
}

export async function recognizeAttachmentNote(input: RecognizeAttachmentInput) {
  try {
    const locale = normalizeLocale(await getCurrentLocale())
    const t = createTranslator(locale)
    const session = await getSession()

    if (!session) {
      throw new Error(t('notLoggedIn'))
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { ocrEnabled: true },
    })
    if (!currentUser?.ocrEnabled) {
      throw new Error(t('ocrPermissionDenied'))
    }

    if (!input.imageDataUrl?.startsWith('data:image/')) {
      throw new Error(t('ocrInvalidImage'))
    }

    const apiKey = process.env.OCR_API_KEY
    if (!apiKey) {
      throw new Error(t('ocrApiKeyMissing'))
    }

    const settings = await getAISettings()
    if (!settings.enabled) {
      throw new Error(t('ocrDisabled'))
    }

    const timeoutMs = Number(process.env.OCR_TIMEOUT_MS || 30000)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(resolveOcrEndpoint(process.env.OCR_API_BASE_URL), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: settings.model,
          temperature: 0.1,
          messages: [
            {
              role: 'system',
              content: settings.systemPrompt,
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: fillOcrUserPrompt(settings.userPrompt, input.context),
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: input.imageDataUrl,
                  },
                },
              ],
            },
          ],
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error?.message || t('ocrRequestFailed'))
      }

      const text = extractAssistantText(payload)
      const parsed = normalizeOcrResult(parseJsonFromText(text))
      const noteLocale = locale === 'en' ? 'en' : 'zh-HK'
      const noteText = formatOcrKeywordsForNote(parsed, 80)
      const attachmentMemo = formatOcrAttachmentMemo(parsed, noteLocale, 12)
      const amount = parseOcrAmount(parsed.amount)

      return {
        success: true as const,
        noteText,
        attachmentMemo,
        amount,
        parsed,
      }
    } finally {
      clearTimeout(timer)
    }
  } catch (error: any) {
    return { success: false as const, error: error.message }
  }
}

/**
 * Recognize a saved attachment image, append keywords to the parent entity note,
 * optionally update attachment type label, and create a timeline Memo.
 */
export async function recognizeAndAppendOcr(input: RecognizeAndAppendInput) {
  try {
    const locale = normalizeLocale(await getCurrentLocale())
    const t = createTranslator(locale)
    const session = await getSession()
    if (!session) throw new Error(t('notLoggedIn'))

    const attachment = await prisma.attachment.findUnique({
      where: { id: input.attachmentId },
      include: {
        record: true,
        privateRecord: true,
        contract: true,
        activity: true,
      },
    })
    if (!attachment) throw new Error(t('attachmentNotFound'))
    if (!attachment.fileUrl?.startsWith('data:image/')) {
      throw new Error(t('ocrInvalidImage'))
    }

    // Permission: same rules as editing the parent entity
    if (attachment.recordId && attachment.record) {
      if (!hasPublicLedgerAccess(session)) throw new Error(t('unauthorized'))
      if (attachment.record.userId !== session.userId && !session.isAdmin) {
        throw new Error(t('canOnlyModifyOwnRecord'))
      }
    } else if (attachment.privateRecordId && attachment.privateRecord) {
      if (attachment.privateRecord.userId !== session.userId && !session.isAdmin) {
        throw new Error(t('canOnlyModifyOwnPrivateRecord'))
      }
    } else if (attachment.contractId) {
      if (!session.isAdmin) throw new Error(t('unauthorized'))
    } else if (attachment.activityId && attachment.activity) {
      if (attachment.activity.userId !== session.userId && !session.isAdmin) {
        throw new Error(t('canOnlyModifyOwnActivity'))
      }
    } else {
      throw new Error(t('unauthorized'))
    }

    const recognized = await recognizeAttachmentNote({
      imageDataUrl: attachment.fileUrl,
      context: input.context,
    })
    if (!recognized.success) {
      return recognized
    }

    const noteText = recognized.noteText || ''
    const attachmentMemo = recognized.attachmentMemo || ''
    const memoPrefix = locale === 'en' ? 'OCR' : '圖像辨識'

    await prisma.$transaction(async (tx) => {
      if (attachmentMemo) {
        await tx.attachment.update({
          where: { id: attachment.id },
          data: { note: attachmentMemo },
        })
      }

      if (attachment.recordId && attachment.record) {
        await tx.record.update({
          where: { id: attachment.recordId },
          data: { note: appendNote(attachment.record.note, noteText) },
        })
        if (noteText) {
          await tx.memo.create({
            data: {
              content: `${memoPrefix}: ${noteText}`,
              authorId: session.userId,
              recordId: attachment.recordId,
            },
          })
        }
      } else if (attachment.privateRecordId && attachment.privateRecord) {
        await tx.privateRecord.update({
          where: { id: attachment.privateRecordId },
          data: { note: appendNote(attachment.privateRecord.note, noteText) },
        })
        if (noteText) {
          await tx.memo.create({
            data: {
              content: `${memoPrefix}: ${noteText}`,
              authorId: session.userId,
              privateRecordId: attachment.privateRecordId,
            },
          })
        }
      } else if (attachment.contractId && attachment.contract) {
        await tx.contract.update({
          where: { id: attachment.contractId },
          data: { note: appendNote(attachment.contract.note, noteText) },
        })
        if (noteText) {
          await tx.memo.create({
            data: {
              content: `${memoPrefix}: ${noteText}`,
              authorId: session.userId,
              contractId: attachment.contractId,
            },
          })
        }
      } else if (attachment.activityId && attachment.activity) {
        await tx.activity.update({
          where: { id: attachment.activityId },
          data: { note: appendNote(attachment.activity.note, noteText) },
        })
        if (noteText) {
          await tx.memo.create({
            data: {
              content: `${memoPrefix}: ${noteText}`,
              authorId: session.userId,
              activityId: attachment.activityId,
            },
          })
        }
      }
    })

    revalidatePath('/')
    revalidatePath('/report')
    revalidatePath('/review')
    revalidatePath('/private-ledger')
    revalidatePath('/contracts')
    revalidatePath('/activities')
    revalidatePath('/admin')

    return {
      success: true as const,
      noteText,
      attachmentMemo,
      amount: recognized.amount ?? null,
      parsed: recognized.parsed || null,
    }
  } catch (error: any) {
    return { success: false as const, error: error.message }
  }
}
