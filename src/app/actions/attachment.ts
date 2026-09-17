'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from './auth'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'

export type AttachmentSourceFilter = 'ALL' | 'RECORD' | 'PRIVATE' | 'ACTIVITY' | 'CONTRACT'

export type AttachmentAdminFilter = {
  source?: AttachmentSourceFilter
  startDate?: Date
  endDate?: Date
  poolId?: string
}

const attachmentInclude = {
  uploader: { select: { roleName: true } },
  category: { select: { name: true } },
  record: {
    select: {
      id: true,
      note: true,
      date: true,
      attachmentUrl: true,
      poolId: true,
      pool: { select: { name: true } },
    },
  },
  privateRecord: {
    select: { id: true, note: true, date: true, customCategory: true },
  },
  activity: {
    select: { id: true, title: true, eventDate: true },
  },
  contract: {
    select: {
      id: true,
      title: true,
      expiryDate: true,
      poolId: true,
      pool: { select: { name: true } },
    },
  },
} as const

function excludePayrollClause() {
  return {
    payrollPaidId: null,
    payrollPdfId: null,
  }
}

function buildSourceWhere(source?: AttachmentSourceFilter) {
  switch (source) {
    case 'RECORD':
      return { recordId: { not: null } }
    case 'PRIVATE':
      return { privateRecordId: { not: null } }
    case 'ACTIVITY':
      return { activityId: { not: null } }
    case 'CONTRACT':
      return { contractId: { not: null } }
    case 'ALL':
    default:
      return {
        OR: [
          { recordId: { not: null } },
          { privateRecordId: { not: null } },
          { activityId: { not: null } },
          { contractId: { not: null } },
        ],
      }
  }
}

export async function queryAttachmentsForAdmin(filter: AttachmentAdminFilter = {}) {
  const session = await getSession()
  if (!session?.isAdmin) return []

  const where: any = {
    AND: [excludePayrollClause(), buildSourceWhere(filter.source)],
  }

  if (filter.startDate || filter.endDate) {
    where.AND.push({
      createdAt: {
        ...(filter.startDate ? { gte: filter.startDate } : {}),
        ...(filter.endDate ? { lte: filter.endDate } : {}),
      },
    })
  }

  // Pool filter only applies to public ledger / contracts; ignore for private/activity.
  if (
    filter.poolId &&
    filter.source !== 'PRIVATE' &&
    filter.source !== 'ACTIVITY'
  ) {
    where.AND.push({
      OR: [
        { record: { poolId: filter.poolId } },
        { contract: { poolId: filter.poolId } },
      ],
    })
  }

  return prisma.attachment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: attachmentInclude,
  })
}

export async function bulkDeleteAttachments(ids: string[]) {
  try {
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    const session = await getSession()

    if (!session?.isAdmin) {
      throw new Error(t('unauthorized'))
    }

    const uniqueIds = Array.from(new Set((ids || []).filter(Boolean)))
    if (uniqueIds.length === 0) {
      return { success: false, error: t('noAttachmentSelected'), deleted: 0 }
    }

    const rows = await prisma.attachment.findMany({
      where: {
        id: { in: uniqueIds },
        ...excludePayrollClause(),
      },
      select: {
        id: true,
        fileUrl: true,
        recordId: true,
        payrollPaidId: true,
        payrollPdfId: true,
      },
    })

    if (rows.length === 0) {
      return { success: false, error: t('noAttachmentData'), deleted: 0 }
    }

    const deletableIds = rows.map((r) => r.id)
    const recordUrlPairs = rows
      .filter((r) => r.recordId)
      .map((r) => ({ recordId: r.recordId as string, fileUrl: r.fileUrl }))

    await prisma.$transaction(async (tx) => {
      for (const pair of recordUrlPairs) {
        await tx.record.updateMany({
          where: {
            id: pair.recordId,
            attachmentUrl: pair.fileUrl,
          },
          data: { attachmentUrl: null },
        })
      }

      await tx.attachment.deleteMany({
        where: { id: { in: deletableIds } },
      })
    })

    revalidatePath('/admin')
    return { success: true, deleted: deletableIds.length }
  } catch (error: any) {
    return { success: false, error: error.message || 'Delete failed', deleted: 0 }
  }
}
