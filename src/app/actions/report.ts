'use server'

import prisma from '@/lib/prisma'
import { getSession } from './auth'

export type ReportFilter = {
  startDate?: Date
  endDate?: Date
  categoryId?: string
  subCategoryId?: string
  thirdCategoryId?: string
  poolId?: string
  userId?: string
  noteKeyword?: string
  status?: 'PENDING' | 'APPROVED' | 'ALL'
}

export async function getReportRecords(filter: ReportFilter) {
  const session = await getSession()
  if (!session?.isAdmin) return []

  const where: any = {}

  if (filter.status && filter.status !== 'ALL') {
    where.status = filter.status
  } else if (!filter.status) {
    where.status = 'APPROVED'
  }

  if (filter.userId) {
    where.userId = filter.userId
  }
  if (filter.startDate || filter.endDate) {
    where.date = {}
    if (filter.startDate) where.date.gte = filter.startDate
    if (filter.endDate) where.date.lte = filter.endDate
  }

  if (filter.categoryId) {
    const subCategories = await prisma.category.findMany({
      where: { parentId: filter.categoryId },
      include: { children: { select: { id: true } } }
    })
    const categoryIds = [
      filter.categoryId,
      ...subCategories.map((c) => c.id),
      ...subCategories.flatMap((c) => c.children.map((child) => child.id))
    ]
    where.OR = [
      { categoryId: filter.categoryId },
      { subCategoryId: { in: categoryIds } },
      { thirdCategoryId: { in: categoryIds } }
    ]
  }

  if (filter.subCategoryId) {
    const thirdCategories = await prisma.category.findMany({
      where: { parentId: filter.subCategoryId },
      select: { id: true }
    })
    const subTreeIds = [filter.subCategoryId, ...thirdCategories.map((item) => item.id)]
    where.AND = [
      ...(where.AND || []),
      {
        OR: [
          { subCategoryId: filter.subCategoryId },
          { thirdCategoryId: { in: subTreeIds } }
        ]
      }
    ]
  }

  if (filter.thirdCategoryId) {
    where.thirdCategoryId = filter.thirdCategoryId
  }

  if (filter.poolId) {
    where.poolId = filter.poolId
  }

  if (filter.noteKeyword?.trim()) {
    const kw = filter.noteKeyword.trim()
    where.AND = [
      ...(where.AND || []),
      {
        OR: [
          { content: { contains: kw, mode: 'insensitive' } },
          { note: { contains: kw, mode: 'insensitive' } },
          { memos: { some: { content: { contains: kw, mode: 'insensitive' } } } },
        ],
      },
    ]
  }

  return await prisma.record.findMany({
    where,
    orderBy: { date: 'desc' },
    include: {
      category: { select: { name: true } },
      subCategory: { select: { name: true } },
      thirdCategory: { select: { name: true } },
      user: { select: { roleName: true } },
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

export type ActivityReportFilter = {
  startDate?: Date
  endDate?: Date
  noteKeyword?: string
  visibility?: 'PUBLIC' | 'PRIVATE' | 'ALL'
  userId?: string
}

export async function getReportActivities(filter: ActivityReportFilter) {
  const session = await getSession()
  if (!session?.isAdmin) return []

  const where: any = {}

  if (filter.visibility && filter.visibility !== 'ALL') {
    where.visibility = filter.visibility
  }
  if (filter.userId) {
    where.userId = filter.userId
  }
  if (filter.startDate || filter.endDate) {
    where.eventDate = {}
    if (filter.startDate) where.eventDate.gte = filter.startDate
    if (filter.endDate) where.eventDate.lte = filter.endDate
  }
  if (filter.noteKeyword?.trim()) {
    const kw = filter.noteKeyword.trim()
    where.OR = [
      { title: { contains: kw, mode: 'insensitive' } },
      { note: { contains: kw, mode: 'insensitive' } },
      { memos: { some: { content: { contains: kw, mode: 'insensitive' } } } },
    ]
  }

  return prisma.activity.findMany({
    where,
    orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
    include: {
      user: { select: { roleName: true } },
      attachments: {
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      },
    },
  })
}

export type ContractReportFilter = {
  startDate?: Date
  endDate?: Date
  noteKeyword?: string
  type?: 'INCOME' | 'EXPENSE' | 'ALL'
  categoryId?: string
  poolId?: string
  userId?: string
}

export async function getReportContracts(filter: ContractReportFilter) {
  const session = await getSession()
  if (!session?.isAdmin) return []

  const where: any = {}

  if (filter.type && filter.type !== 'ALL') {
    where.type = filter.type
  }
  if (filter.userId) {
    where.userId = filter.userId
  }
  if (filter.poolId) {
    where.poolId = filter.poolId
  }
  if (filter.categoryId) {
    where.OR = [
      { categoryId: filter.categoryId },
      { subCategoryId: filter.categoryId },
      { thirdCategoryId: filter.categoryId },
    ]
  }
  if (filter.startDate || filter.endDate) {
    where.effectiveDate = {}
    if (filter.startDate) where.effectiveDate.gte = filter.startDate
    if (filter.endDate) where.effectiveDate.lte = filter.endDate
  }
  if (filter.noteKeyword?.trim()) {
    const kw = filter.noteKeyword.trim()
    where.AND = [
      ...(where.AND || []),
      {
        OR: [
          { title: { contains: kw, mode: 'insensitive' } },
          { note: { contains: kw, mode: 'insensitive' } },
          { memos: { some: { content: { contains: kw, mode: 'insensitive' } } } },
        ],
      },
    ]
  }

  return prisma.contract.findMany({
    where,
    orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
    include: {
      user: { select: { roleName: true } },
      category: { select: { name: true } },
      subCategory: { select: { name: true } },
      thirdCategory: { select: { name: true } },
      pool: { select: { name: true } },
      attachments: {
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      },
    },
  })
}