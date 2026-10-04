'use server'

import prisma from '@/lib/prisma'
import { getSession } from './auth'
import { revalidatePath } from 'next/cache'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'

export type ReviewRecordEdits = {
  type?: 'INCOME' | 'EXPENSE'
  date?: string | Date
  content?: string | null
  note?: string | null
  amount?: number
  categoryId?: string
  subCategoryId?: string | null
  thirdCategoryId?: string | null
  poolId?: string | null
}

export async function getPendingReviewCount() {
  const session = await getSession()
  if (!session || !session.isAdmin) return 0

  return await prisma.record.count({
    where: { status: 'PENDING' }
  })
}

export async function getReviewRecords(status: 'PENDING' | 'APPROVED' | 'REJECTED') {
  const session = await getSession()
  if (!session || !session.isAdmin) return []

  return await prisma.record.findMany({
    where: { status },
    orderBy: { createdAt: 'desc' },
    include: {
      category: true,
      subCategory: true,
      thirdCategory: true,
      user: true,
      pool: true,
      originalRecord: true,
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

function normalizeEdits(edits: ReviewRecordEdits | undefined, t: (key: any) => string) {
  if (!edits) return null

  const data: {
    type?: string
    date?: Date
    content?: string | null
    note?: string | null
    amount?: number
    categoryId?: string
    subCategoryId?: string | null
    thirdCategoryId?: string | null
    poolId?: string | null
  } = {}

  if (edits.type === 'INCOME' || edits.type === 'EXPENSE') {
    data.type = edits.type
  }
  if (edits.date != null) {
    const date = edits.date instanceof Date ? edits.date : new Date(edits.date)
    if (Number.isNaN(date.getTime())) throw new Error(t('fillRequiredFields'))
    data.date = date
  }
  if (edits.content !== undefined) {
    data.content = edits.content?.trim() || null
  }
  if (edits.note !== undefined) {
    data.note = edits.note?.trim() || null
  }
  if (edits.amount !== undefined) {
    if (!Number.isFinite(edits.amount)) throw new Error(t('fillRequiredFields'))
    data.amount = edits.amount
  }
  if (edits.categoryId) {
    data.categoryId = edits.categoryId
    data.subCategoryId = edits.subCategoryId ?? null
    data.thirdCategoryId = edits.thirdCategoryId ?? null
  }
  if (edits.poolId !== undefined) {
    data.poolId = edits.poolId || null
  }

  return Object.keys(data).length > 0 ? data : null
}

/**
 * Approve/reject a PENDING record.
 * Optional edits are applied only on APPROVE (B3: persist with 通過).
 */
export async function reviewRecord(
  id: string,
  action: 'APPROVE' | 'REJECT',
  edits?: ReviewRecordEdits
) {
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  const session = await getSession()
  if (!session || !session.isAdmin) return { success: false, error: t('unauthorized') }

  try {
    await prisma.$transaction(async (tx) => {
      const record = await tx.record.findUnique({ where: { id } })
      if (!record || record.status !== 'PENDING') throw new Error(t('recordAlreadyReviewed'))

      const patch = action === 'APPROVE' ? normalizeEdits(edits, t) : null
      const effective = patch
        ? {
            type: patch.type ?? record.type,
            date: patch.date ?? record.date,
            content: patch.content !== undefined ? patch.content : record.content,
            note: patch.note !== undefined ? patch.note : record.note,
            amount: patch.amount ?? record.amount,
            categoryId: patch.categoryId ?? record.categoryId,
            subCategoryId:
              patch.categoryId !== undefined ? patch.subCategoryId ?? null : record.subCategoryId,
            thirdCategoryId:
              patch.categoryId !== undefined ? patch.thirdCategoryId ?? null : record.thirdCategoryId,
            poolId: patch.poolId !== undefined ? patch.poolId : record.poolId,
          }
        : {
            type: record.type,
            date: record.date,
            content: record.content,
            note: record.note,
            amount: record.amount,
            categoryId: record.categoryId,
            subCategoryId: record.subCategoryId,
            thirdCategoryId: record.thirdCategoryId,
            poolId: record.poolId,
          }

      if (action === 'APPROVE' && patch) {
        // Align amount sign with type when both provided / type changed
        let amount = effective.amount
        if (effective.type === 'INCOME' && amount < 0) amount = Math.abs(amount)
        if (effective.type === 'EXPENSE' && amount > 0) amount = -Math.abs(amount)
        effective.amount = amount

        await tx.record.update({
          where: { id },
          data: {
            type: effective.type,
            date: effective.date,
            content: effective.content,
            note: effective.note,
            amount: effective.amount,
            categoryId: effective.categoryId,
            subCategoryId: effective.subCategoryId,
            thirdCategoryId: effective.thirdCategoryId,
            poolId: effective.poolId,
          },
        })

        const changedSummary = [
          patch.type != null && patch.type !== record.type ? `type→${patch.type}` : null,
          patch.amount != null && patch.amount !== record.amount ? `amount→${effective.amount}` : null,
          patch.poolId !== undefined && patch.poolId !== record.poolId ? 'pool changed' : null,
          patch.content !== undefined && patch.content !== record.content ? 'content updated' : null,
          patch.note !== undefined && patch.note !== record.note ? 'note updated' : null,
          patch.categoryId && patch.categoryId !== record.categoryId ? 'category changed' : null,
          patch.date && patch.date.getTime() !== new Date(record.date).getTime() ? 'date changed' : null,
        ]
          .filter(Boolean)
          .join('；')

        if (changedSummary) {
          await tx.memo.create({
            data: {
              content:
                locale === 'en'
                  ? `Review edit: ${changedSummary}`
                  : `審批修改：${changedSummary}`,
              authorId: session.userId,
              recordId: record.originalRecordId || id,
            },
          })
        }
      }

      if (action === 'APPROVE') {
        if (record.originalRecordId) {
          const oldRecord = await tx.record.findUnique({ where: { id: record.originalRecordId } })
          if (!oldRecord) throw new Error(t('originalRecordNotFound'))

          if (oldRecord.poolId && (oldRecord.type === 'INCOME' || oldRecord.type === 'EXPENSE')) {
            await tx.capitalPool.update({
              where: { id: oldRecord.poolId },
              data: { balanceHkd: { decrement: oldRecord.amount } }
            })
          }

          if (effective.poolId && (effective.type === 'INCOME' || effective.type === 'EXPENSE')) {
            await tx.capitalPool.update({
              where: { id: effective.poolId },
              data: { balanceHkd: { increment: effective.amount } }
            })
          }

          await tx.record.update({
            where: { id: record.originalRecordId },
            data: {
              amount: effective.amount,
              categoryId: effective.categoryId,
              subCategoryId: effective.subCategoryId,
              thirdCategoryId: effective.thirdCategoryId,
              content: effective.content,
              note: effective.note,
              date: effective.date,
              type: effective.type,
              poolId: effective.poolId,
              attachmentUrl: record.attachmentUrl,
              isReviewing: false
            }
          })

          // Move memos from pending copy to original when present
          await tx.memo.updateMany({
            where: { recordId: id },
            data: { recordId: record.originalRecordId },
          })

          await tx.attachment.updateMany({
            where: { recordId: record.id },
            data: { recordId: record.originalRecordId }
          })
          await tx.record.delete({ where: { id } })
        } else {
          await tx.record.update({
            where: { id },
            data: { status: 'APPROVED' }
          })
          if (effective.poolId && (effective.type === 'INCOME' || effective.type === 'EXPENSE')) {
            await tx.capitalPool.update({
              where: { id: effective.poolId },
              data: { balanceHkd: { increment: effective.amount } }
            })
          }
        }
      } else {
        if (record.originalRecordId) {
          await tx.record.update({
            where: { id: record.originalRecordId },
            data: { isReviewing: false }
          })
        }
        await tx.record.update({
          where: { id },
          data: { status: 'REJECTED' }
        })
      }
    })

    revalidatePath('/')
    revalidatePath('/review')
    revalidatePath('/report')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
