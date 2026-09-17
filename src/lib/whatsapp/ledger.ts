import prisma from '@/lib/prisma'
import type { WhatsAppActor } from './identity'

function getDeepestCategoryId(data: {
  categoryId: string
  subCategoryId?: string | null
  thirdCategoryId?: string | null
}) {
  return data.thirdCategoryId || data.subCategoryId || data.categoryId
}

/**
 * 依名稱模糊匹配分類（同 type、優先完全相等，再包含）。
 * 回傳從根到葉的路徑 id。
 */
export async function resolveCategoryPath(
  type: 'INCOME' | 'EXPENSE',
  nameHint: string | undefined,
): Promise<{
  categoryId: string
  subCategoryId?: string
  thirdCategoryId?: string
  label: string
}> {
  const hint = (nameHint || '').trim()
  const all = await prisma.category.findMany({
    where: { type },
    select: { id: true, name: true, parentId: true },
  })

  const byId = new Map(all.map((c) => [c.id, c]))

  function pathLabel(id: string): string {
    const parts: string[] = []
    let cur: string | null = id
    while (cur) {
      const node = byId.get(cur)
      if (!node) break
      parts.unshift(node.name)
      cur = node.parentId
    }
    return parts.join(' / ')
  }

  function rootOf(id: string): string {
    let cur = id
    while (true) {
      const node = byId.get(cur)
      if (!node?.parentId) return cur
      cur = node.parentId
    }
  }

  function buildIds(leafId: string) {
    const chain: string[] = []
    let cur: string | null = leafId
    while (cur) {
      chain.unshift(cur)
      cur = byId.get(cur)?.parentId || null
    }
    return {
      categoryId: chain[0],
      subCategoryId: chain[1],
      thirdCategoryId: chain[2],
      label: pathLabel(leafId),
    }
  }

  if (hint) {
    const exact = all.filter((c) => c.name === hint)
    const partial = all.filter((c) => c.name.includes(hint))
    const pick = exact[0] || partial[0]
    if (pick) return buildIds(pick.id)
  }

  // 預設「未分类」根分類
  const uncategorized = all.find((c) => c.name === '未分类' && !c.parentId)
  if (!uncategorized) {
    const created = await prisma.category.create({
      data: { name: '未分类', type, parentId: null },
    })
    return {
      categoryId: created.id,
      label: '未分类',
    }
  }
  // 確保未分类是根
  if (uncategorized.parentId) {
    const rootId = rootOf(uncategorized.id)
    return buildIds(rootId)
  }
  return { categoryId: uncategorized.id, label: '未分类' }
}

export async function resolveDefaultPool(actor: WhatsAppActor, poolHint?: string) {
  const pools = await prisma.capitalPool.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, userId: true },
  })
  if (pools.length === 0) return { poolId: undefined as string | undefined, poolLabel: undefined as string | undefined }

  const hint = (poolHint || '').trim()
  if (hint) {
    const hit = pools.find((p) => p.name === hint || p.name.includes(hint))
    if (hit) return { poolId: hit.id, poolLabel: hit.name }
  }

  const own = pools.find((p) => p.userId === actor.userId)
  if (own) return { poolId: own.id, poolLabel: own.name }
  return { poolId: pools[0].id, poolLabel: pools[0].name }
}

export type CreateLedgerForWhatsAppInput = {
  actor: WhatsAppActor
  type: 'INCOME' | 'EXPENSE'
  amountAbs: number
  categoryId: string
  subCategoryId?: string
  thirdCategoryId?: string
  poolId?: string
  note?: string
  date?: Date
}

/**
 * 以指定用戶身分建立公帳收支（不依賴 cookie session）。
 */
export async function createPublicLedgerForWhatsApp(input: CreateLedgerForWhatsAppInput) {
  const amount =
    input.type === 'EXPENSE' ? -Math.abs(input.amountAbs) : Math.abs(input.amountAbs)
  const date = input.date || new Date()

  return prisma.$transaction(async (tx) => {
    let status = 'APPROVED'
    if (input.poolId) {
      const pool = await tx.capitalPool.findUnique({ where: { id: input.poolId } })
      if (pool?.isReviewRequired) status = 'PENDING'
    }

    const record = await tx.record.create({
      data: {
        type: input.type,
        status,
        date,
        note: input.note ? `[WhatsApp] ${input.note}` : '[WhatsApp]',
        amount,
        categoryId: input.categoryId,
        subCategoryId: input.subCategoryId,
        thirdCategoryId: input.thirdCategoryId,
        poolId: input.poolId,
        userId: input.actor.userId,
      },
    })

    if (status === 'APPROVED' && input.poolId) {
      await tx.capitalPool.update({
        where: { id: input.poolId },
        data: { balanceHkd: { increment: amount } },
      })
    }

    return { record, status, amount }
  })
}

export async function listTopCategories(type: 'INCOME' | 'EXPENSE', limit = 12) {
  const roots = await prisma.category.findMany({
    where: { parentId: null, type },
    orderBy: { name: 'asc' },
    take: limit,
    select: { name: true },
  })
  return roots.map((c) => c.name)
}

export async function listPools(limit = 12) {
  const pools = await prisma.capitalPool.findMany({
    orderBy: { name: 'asc' },
    take: limit,
    select: { name: true, balanceHkd: true },
  })
  return pools
}

export async function getRecentRecordsForUser(userId: string, limit = 5) {
  return prisma.record.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      category: { select: { name: true } },
      pool: { select: { name: true } },
    },
  })
}

export async function getMonthSummaryAdmin() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

  const records = await prisma.record.findMany({
    where: {
      status: 'APPROVED',
      date: { gte: start, lte: end },
    },
    select: { type: true, amount: true },
  })

  let income = 0
  let expense = 0
  for (const r of records) {
    if (r.amount >= 0) income += r.amount
    else expense += Math.abs(r.amount)
  }

  const pools = await prisma.capitalPool.findMany({
    select: { name: true, balanceHkd: true },
    orderBy: { name: 'asc' },
  })
  const poolTotal = pools.reduce((s, p) => s + p.balanceHkd, 0)

  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    income,
    expense,
    net: income - expense,
    count: records.length,
    poolTotal,
    pools: pools.slice(0, 8),
  }
}

// 供 pending 確認後重建路徑標籤用（避免未使用警告）
export { getDeepestCategoryId }
