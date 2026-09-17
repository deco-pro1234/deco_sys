'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from './auth'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'

type ModifyAttachmentInput = {
  url: string
  size: number
  note?: string
}

export async function requestModifyRecord(
  originalId: string,
  data: any & { thirdCategoryId?: string; attachment?: ModifyAttachmentInput; attachments?: ModifyAttachmentInput[] }
) {
  try {
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    const session = await getSession()
    if (!session) return { success: false, error: t('notLoggedIn') }

    const originalRecord = await prisma.record.findUnique({ where: { id: originalId } })
    if (!originalRecord) return { success: false, error: t('originalRecordNotFound') }
    
    // 权限校验：必须是记录所有者或管理员
    if (originalRecord.userId !== session.userId && !session.isAdmin) {
      return { success: false, error: t('canOnlyModifyOwnRecord') }
    }

    if (originalRecord.isReviewing) return { success: false, error: t('reviewingInProgress') }

    const attachmentList =
      data.attachments && data.attachments.length > 0
        ? data.attachments
        : data.attachment
          ? [data.attachment]
          : []

    await prisma.$transaction(async (tx) => {
      // 标记原记录正在审核中
      await tx.record.update({
        where: { id: originalId },
        data: { isReviewing: true }
      })

      // 创建一个 Pending 的新记录
      await tx.record.create({
        data: {
          type: data.type,
          status: 'PENDING',
          date: new Date(data.date),
          note: data.note,
          amount: data.amount,
          categoryId: data.categoryId,
          subCategoryId: data.subCategoryId || undefined,
          thirdCategoryId: data.thirdCategoryId || undefined,
          attachmentUrl: attachmentList[0]?.url,
          poolId: data.poolId || undefined,
          userId: originalRecord.userId, // 保持原作者
          originalRecordId: originalId,
        }
      }).then(async (pendingRecord) => {
        for (const item of attachmentList) {
          await tx.attachment.create({
            data: {
              fileUrl: item.url,
              size: item.size,
              note: item.note,
              uploaderId: session.userId,
              categoryId: data.thirdCategoryId || data.subCategoryId || data.categoryId,
              recordId: pendingRecord.id,
            }
          })
        }
      })
    })

    revalidatePath('/report')
    revalidatePath('/review')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
