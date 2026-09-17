'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from './auth'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'
import { maybeSendReminderCatchUp } from '@/lib/reminders/emailReminders'

type AttachmentPayload = {
  url: string
  size: number
  note?: string
}

export type CreateContractInput = {
  title: string
  type: 'INCOME' | 'EXPENSE'
  effectiveDate: Date
  expiryDate: Date
  reminderDays: number
  note?: string
  amount: number
  categoryId?: string
  subCategoryId?: string
  thirdCategoryId?: string
  poolId?: string
  attachment?: AttachmentPayload
  attachments?: AttachmentPayload[]
  initialMemo?: string
}

function getDeepestCategoryId(data: {
  categoryId?: string | null
  subCategoryId?: string | null
  thirdCategoryId?: string | null
}) {
  return data.thirdCategoryId || data.subCategoryId || data.categoryId || undefined
}

/** Any admin may view / append attachment / memo. */
async function assertContractAdminAccess(contractId: string) {
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  const session = await getSession()

  if (!session) {
    throw new Error(t('notLoggedIn'))
  }
  if (!session.isAdmin) {
    throw new Error(t('unauthorized'))
  }

  const contract = await prisma.contract.findUnique({
    where: { id: contractId }
  })

  if (!contract) {
    throw new Error(t('contractNotFound'))
  }

  return { session, contract }
}

/** Only the creator may edit core fields or delete. */
async function assertContractOwner(contractId: string) {
  const { session, contract } = await assertContractAdminAccess(contractId)
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)

  if (contract.userId !== session.userId) {
    throw new Error(t('canOnlyModifyOwnContract'))
  }

  return { session, contract }
}

export type UpdateContractInput = {
  title: string
  type: 'INCOME' | 'EXPENSE'
  effectiveDate: Date
  expiryDate: Date
  reminderDays: number
  note?: string
  amount: number
  categoryId?: string
  subCategoryId?: string
  thirdCategoryId?: string
  poolId?: string
}

export async function getContracts() {
  const session = await getSession()
  if (!session?.isAdmin) return []

  return await prisma.contract.findMany({
    where: session.isAdmin ? undefined : { userId: session.userId },
    orderBy: [
      { expiryDate: 'asc' },
      { createdAt: 'desc' }
    ],
    include: {
      user: { select: { roleName: true } },
      category: { select: { name: true } },
      subCategory: { select: { name: true } },
      thirdCategory: { select: { name: true } },
      pool: { select: { name: true } },
      attachments: {
        orderBy: { createdAt: 'desc' },
        include: {
          uploader: { select: { roleName: true } }
        }
      },
      memos: {
        orderBy: { createdAt: 'desc' },
        include: {
          author: { select: { roleName: true } }
        }
      }
    }
  })
}

export async function createContract(data: CreateContractInput) {
  try {
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    const session = await getSession()
    if (!session) {
      throw new Error(t('notLoggedIn'))
    }
    if (!session.isAdmin) {
      throw new Error(t('unauthorized'))
    }

    const result = await prisma.$transaction(async (tx) => {
      const contract = await tx.contract.create({
        data: {
          title: data.title,
          type: data.type,
          effectiveDate: data.effectiveDate,
          expiryDate: data.expiryDate,
          reminderDays: data.reminderDays,
          note: data.note,
          amount: data.amount,
          categoryId: data.categoryId,
          subCategoryId: data.categoryId ? data.subCategoryId : undefined,
          thirdCategoryId: data.categoryId ? data.thirdCategoryId : undefined,
          poolId: data.poolId,
          userId: session.userId
        }
      })

      if (data.attachment) {
        await tx.attachment.create({
          data: {
            fileUrl: data.attachment.url,
            size: data.attachment.size,
            note: data.attachment.note,
            uploaderId: session.userId,
            categoryId: data.categoryId ? getDeepestCategoryId(data) : undefined,
            contractId: contract.id
          }
        })
      }

      const extraAttachments = data.attachments || []
      for (const item of extraAttachments) {
        await tx.attachment.create({
          data: {
            fileUrl: item.url,
            size: item.size,
            note: item.note,
            uploaderId: session.userId,
            categoryId: data.categoryId ? getDeepestCategoryId(data) : undefined,
            contractId: contract.id,
          },
        })
      }

      if (data.initialMemo?.trim()) {
        await tx.memo.create({
          data: {
            content: data.initialMemo.trim(),
            authorId: session.userId,
            contractId: contract.id,
          },
        })
      }

      return contract
    })

    try {
      await maybeSendReminderCatchUp({
        entityType: 'CONTRACT',
        entityId: result.id,
        title: result.title,
        targetDate: result.expiryDate,
        reminderDays: result.reminderDays,
        eligible: true,
      })
    } catch (e) {
      console.error('[createContract] reminder catch-up failed', e)
    }

    revalidatePath('/contracts')
    revalidatePath('/admin')
    return { success: true, contract: result }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function updateContract(contractId: string, data: UpdateContractInput) {
  try {
    await assertContractOwner(contractId)

    const updated = await prisma.contract.update({
      where: { id: contractId },
      data: {
        title: data.title,
        type: data.type,
        effectiveDate: data.effectiveDate,
        expiryDate: data.expiryDate,
        reminderDays: data.reminderDays,
        note: data.note,
        amount: data.amount,
        categoryId: data.categoryId || null,
        subCategoryId: data.categoryId ? data.subCategoryId || null : null,
        thirdCategoryId: data.categoryId ? data.thirdCategoryId || null : null,
        poolId: data.poolId || null,
      },
    })

    try {
      await maybeSendReminderCatchUp({
        entityType: 'CONTRACT',
        entityId: updated.id,
        title: updated.title,
        targetDate: updated.expiryDate,
        reminderDays: updated.reminderDays,
        eligible: true,
      })
    } catch (e) {
      console.error('[updateContract] reminder catch-up failed', e)
    }

    revalidatePath('/contracts')
    revalidatePath('/admin')
    revalidatePath('/report')
    return { success: true, contract: updated }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function addContractAttachment(contractId: string, attachment: AttachmentPayload) {
  try {
    const { session, contract } = await assertContractAdminAccess(contractId)

    await prisma.attachment.create({
      data: {
        fileUrl: attachment.url,
        size: attachment.size,
        note: attachment.note,
        uploaderId: session.userId,
        categoryId: contract.categoryId ? getDeepestCategoryId(contract) : undefined,
        contractId
      }
    })

    revalidatePath('/contracts')
    revalidatePath('/admin')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function addContractMemo(contractId: string, content: string) {
  try {
    const { session } = await assertContractAdminAccess(contractId)

    await prisma.memo.create({
      data: {
        content,
        authorId: session.userId,
        contractId
      }
    })

    revalidatePath('/contracts')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function appendContractNoteKeywords(contractId: string, noteText: string) {
  try {
    const { session, contract } = await assertContractAdminAccess(contractId)
    const addition = noteText.trim()
    if (!addition) return { success: true }

    const nextNote = contract.note?.trim() ? `${contract.note.trim()}\n${addition}` : addition
    await prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id: contractId },
        data: { note: nextNote },
      })
      await tx.memo.create({
        data: {
          content: addition.startsWith('OCR') || addition.startsWith('圖像辨識')
            ? addition
            : `圖像辨識: ${addition}`,
          authorId: session.userId,
          contractId,
        },
      })
    })

    revalidatePath('/contracts')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function deleteContract(contractId: string) {
  try {
    await assertContractOwner(contractId)

    await prisma.$transaction(async (tx) => {
      await tx.memo.deleteMany({ where: { contractId } })
      await tx.attachment.deleteMany({ where: { contractId } })
      await tx.contract.delete({ where: { id: contractId } })
    })

    revalidatePath('/contracts')
    revalidatePath('/admin')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
