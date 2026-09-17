import prisma from '@/lib/prisma'
import {
  DEFAULT_PLUGIN_FLAGS,
  PLUGIN_SETTING_KEYS,
  type PluginFlags,
  type PluginId,
} from '@/lib/plugins'
import type { WhatsAppActor } from './identity'

export type WaReminderBucket = 'overdue' | 'today' | 'upcoming'

export type WaReminderItem = {
  source: '合約' | '事項' | '恆常'
  title: string
  targetDate: Date
  bucket: WaReminderBucket
  daysDiff: number
}

function getDaysDiff(dateValue: Date) {
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const target = new Date(dateValue)
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  return Math.ceil((targetDay.getTime() - startOfToday.getTime()) / 86400000)
}

function getBucket(daysDiff: number, reminderDays: number): WaReminderBucket | null {
  if (daysDiff < 0) return 'overdue'
  if (daysDiff === 0) return 'today'
  if (daysDiff <= reminderDays) return 'upcoming'
  return null
}

async function loadPluginFlags(): Promise<PluginFlags> {
  const keys = Object.values(PLUGIN_SETTING_KEYS)
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: keys } } })
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const flags = { ...DEFAULT_PLUGIN_FLAGS }
  for (const id of Object.keys(PLUGIN_SETTING_KEYS) as PluginId[]) {
    const raw = map.get(PLUGIN_SETTING_KEYS[id])
    if (raw === '0' || raw === 'false') flags[id] = false
    if (raw === '1' || raw === 'true') flags[id] = true
  }
  return flags
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10)
}

const BUCKET_ZH: Record<WaReminderBucket, string> = {
  overdue: '已過期',
  today: '今天',
  upcoming: '即將到期',
}

/**
 * 彙總合約 / 事項 / 恆常提醒（依用戶權限過濾）。
 */
export async function collectWhatsAppReminders(actor: WhatsAppActor): Promise<WaReminderItem[]> {
  const flags = await loadPluginFlags()
  const items: WaReminderItem[] = []

  if (flags.contracts && actor.isAdmin) {
    const contracts = await prisma.contract.findMany({
      select: { title: true, expiryDate: true, reminderDays: true },
      orderBy: { expiryDate: 'asc' },
    })
    for (const c of contracts) {
      const daysDiff = getDaysDiff(c.expiryDate)
      const bucket = getBucket(daysDiff, c.reminderDays)
      if (!bucket) continue
      items.push({
        source: '合約',
        title: c.title,
        targetDate: c.expiryDate,
        bucket,
        daysDiff,
      })
    }
  }

  if (flags.matters) {
    const activities = await prisma.activity.findMany({
      where: {
        OR: [{ visibility: 'PUBLIC' }, { userId: actor.userId }],
      },
      select: { title: true, eventDate: true, reminderDays: true },
      orderBy: { eventDate: 'asc' },
    })
    for (const a of activities) {
      const daysDiff = getDaysDiff(a.eventDate)
      const bucket = getBucket(daysDiff, a.reminderDays)
      if (!bucket) continue
      items.push({
        source: '事項',
        title: a.title,
        targetDate: a.eventDate,
        bucket,
        daysDiff,
      })
    }
  }

  if (flags.recurring) {
    const templates = await prisma.recurringTemplate.findMany({
      where: actor.isAdmin ? undefined : { userId: actor.userId },
      select: { title: true, nextDueDate: true, reminderDays: true },
      orderBy: { nextDueDate: 'asc' },
    })
    for (const t of templates) {
      const daysDiff = getDaysDiff(t.nextDueDate)
      const bucket = getBucket(daysDiff, t.reminderDays)
      if (!bucket) continue
      items.push({
        source: '恆常',
        title: t.title,
        targetDate: t.nextDueDate,
        bucket,
        daysDiff,
      })
    }
  }

  const order: Record<WaReminderBucket, number> = { overdue: 0, today: 1, upcoming: 2 }
  items.sort((a, b) => {
    if (order[a.bucket] !== order[b.bucket]) return order[a.bucket] - order[b.bucket]
    return a.daysDiff - b.daysDiff
  })
  return items
}

export function formatRemindersMessage(items: WaReminderItem[], limit = 15): string {
  if (items.length === 0) {
    return '目前沒有到期／即將到期的合約、事項或恆常收支。'
  }
  const lines = [`📋 提醒一覽（共 ${items.length} 項）`, '']
  for (const item of items.slice(0, limit)) {
    const when =
      item.daysDiff < 0
        ? `過期 ${Math.abs(item.daysDiff)} 天`
        : item.daysDiff === 0
          ? '今天'
          : `${item.daysDiff} 天後`
    lines.push(
      `• [${BUCKET_ZH[item.bucket]}] ${item.source}｜${item.title}`,
      `  ${ymd(item.targetDate)}（${when}）`,
    )
  }
  if (items.length > limit) lines.push('', `…其餘 ${items.length - limit} 項請登入系統查看`)
  return lines.join('\n')
}
