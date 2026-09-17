import prisma from '@/lib/prisma'

const PENDING_PREFIX = 'whatsapp.pending.'
const PENDING_TTL_MS = 5 * 60 * 1000

export type PendingLedgerDraft = {
  kind: 'ledger'
  type: 'INCOME' | 'EXPENSE'
  amount: number
  categoryId: string
  categoryLabel: string
  subCategoryId?: string
  thirdCategoryId?: string
  poolId?: string
  poolLabel?: string
  note?: string
  dateIso: string
  createdAt: number
  userId: string
}

export type PendingAction = PendingLedgerDraft

function keyFor(phoneE164: string) {
  return `${PENDING_PREFIX}${phoneE164}`
}

export async function setPendingAction(phoneE164: string, action: PendingAction) {
  const key = keyFor(phoneE164)
  const value = JSON.stringify(action)
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  })
}

export async function getPendingAction(phoneE164: string): Promise<PendingAction | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key: keyFor(phoneE164) } })
  if (!row?.value) return null
  try {
    const parsed = JSON.parse(row.value) as PendingAction
    if (!parsed?.createdAt || Date.now() - parsed.createdAt > PENDING_TTL_MS) {
      await clearPendingAction(phoneE164)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export async function clearPendingAction(phoneE164: string) {
  try {
    await prisma.systemSetting.delete({ where: { key: keyFor(phoneE164) } })
  } catch {
    /* ignore missing */
  }
}
