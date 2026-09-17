import prisma from '@/lib/prisma'
import {
  getReminderRecipients,
  isReminderEmailConfigured,
  sendReminderEmail,
} from '@/lib/email/resend'
import {
  DEFAULT_PLUGIN_FLAGS,
  PLUGIN_SETTING_KEYS,
  type PluginFlags,
  type PluginId,
} from '@/lib/plugins'
import { normalizeDueDate } from '@/lib/recurring'
import {
  isWhatsAppReminderConfigured,
  sendWhatsAppReminder,
} from '@/lib/whatsapp/reminderNotify'

export type ReminderEntityType = 'CONTRACT' | 'ACTIVITY' | 'RECURRING'
export type ReminderKind =
  | 'advance'
  | 'd30'
  | 'd15'
  | 'd7'
  | 'd3'
  | 'd1'
  | 'due'
  | 'overdue_1'
  | 'overdue_7'
  | 'overdue_30'

/** Default pre-due milestones (calendar days before target). */
export const DEFAULT_PRE_DUE_DAYS = [30, 15, 7, 3, 1] as const

export type ReminderCandidate = {
  entityType: ReminderEntityType
  entityId: string
  title: string
  targetDate: Date
  reminderDays: number
  daysDiff: number
  kinds: ReminderKind[]
  hrefPath: string
}

const KIND_LABEL_ZH: Record<ReminderKind, string> = {
  advance: '自訂提前提醒日',
  d30: '到期前 30 天',
  d15: '到期前 15 天',
  d7: '到期前 7 天',
  d3: '到期前 3 天',
  d1: '到期前 1 天',
  due: '到期當天',
  overdue_1: '過期第 1 天',
  overdue_7: '過期第 7 天',
  overdue_30: '過期第 30 天',
}

const PRE_DUE_KIND_BY_DAYS: Record<number, ReminderKind> = {
  30: 'd30',
  15: 'd15',
  7: 'd7',
  3: 'd3',
  1: 'd1',
}

/** Calendar YYYY-MM-DD in Asia/Hong_Kong */
export function hongKongYmd(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function parseYmd(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  return { y, m, d }
}

/** daysDiff = targetDay - today (HK calendar days) */
export function daysDiffHongKong(targetDate: Date, todayYmd = hongKongYmd()): number {
  const today = parseYmd(todayYmd)
  const targetYmd = hongKongYmd(targetDate)
  const target = parseYmd(targetYmd)
  const t0 = Date.UTC(today.y, today.m - 1, today.d)
  const t1 = Date.UTC(target.y, target.m - 1, target.d)
  return Math.round((t1 - t0) / 86400000)
}

/**
 * Match trigger kinds for a given day.
 * - Fixed: 30 / 15 / 7 / 3 / 1 days before, due day, overdue 1/7/30
 * - Custom advance: when daysDiff === reminderDays and that day is not already a fixed milestone
 * - Only fire pre-due milestones that fall within the entity's reminder window
 *   (daysDiff <= reminderDays), so a short window (e.g. 7) won't spam d30/d15.
 */
export function matchReminderKinds(daysDiff: number, reminderDays: number): ReminderKind[] {
  const kinds: ReminderKind[] = []
  const window = Math.max(0, reminderDays)

  for (const day of DEFAULT_PRE_DUE_DAYS) {
    if (daysDiff === day && day <= window) {
      kinds.push(PRE_DUE_KIND_BY_DAYS[day])
    }
  }

  if (
    reminderDays > 0 &&
    daysDiff === reminderDays &&
    !(reminderDays in PRE_DUE_KIND_BY_DAYS)
  ) {
    kinds.push('advance')
  }

  if (daysDiff === 0) kinds.push('due')
  if (daysDiff === -1) kinds.push('overdue_1')
  if (daysDiff === -7) kinds.push('overdue_7')
  if (daysDiff === -30) kinds.push('overdue_30')

  return kinds
}

export function anchorDateYmd(targetDate: Date): string {
  return hongKongYmd(targetDate)
}

function appBaseUrl() {
  return (process.env.APP_BASE_URL || '').replace(/\/$/, '') || 'http://localhost:3000'
}

function formatDaysDiffLabel(daysDiff: number) {
  if (daysDiff > 0) return `尚餘 ${daysDiff} 天`
  if (daysDiff === 0) return '今天到期'
  return `已逾期 ${Math.abs(daysDiff)} 天`
}

/** Subject urgency prefix by proximity to due date. */
export function urgencySubjectPrefix(daysDiff: number): string {
  if (daysDiff <= -30) return '【已逾期 30 天·至急】'
  if (daysDiff <= -7) return '【已逾期 7 天·至急】'
  if (daysDiff <= -1) return '【已逾期·至急】'
  if (daysDiff === 0) return '【今天到期·至急】'
  if (daysDiff === 1) return '【明日到期·緊急】'
  if (daysDiff <= 3) return '【緊急·尚餘數天】'
  if (daysDiff <= 7) return '【即將到期】'
  if (daysDiff <= 15) return '【請留意】'
  return '【提前提醒】'
}

function entityTypeLabel(entityType: ReminderEntityType) {
  if (entityType === 'CONTRACT') return '合約'
  if (entityType === 'RECURRING') return '恆常收支'
  return '公開事項'
}

function entityHrefPath(entityType: ReminderEntityType) {
  if (entityType === 'CONTRACT') return '/contracts'
  if (entityType === 'RECURRING') return '/recurring'
  return '/activities'
}

async function loadPluginFlags(): Promise<PluginFlags> {
  try {
    const settings = await prisma.systemSetting.findMany({
      where: { key: { in: Object.values(PLUGIN_SETTING_KEYS) } },
    })
    const map = new Map(settings.map((item) => [item.key, item.value]))
    const flags = { ...DEFAULT_PLUGIN_FLAGS }
    ;(Object.keys(PLUGIN_SETTING_KEYS) as PluginId[]).forEach((id) => {
      const key = PLUGIN_SETTING_KEYS[id]
      if (map.has(key)) {
        flags[id] = map.get(key) === 'true'
      }
    })
    return flags
  } catch {
    return { ...DEFAULT_PLUGIN_FLAGS }
  }
}

function buildEmailContent(candidate: ReminderCandidate, kinds: ReminderKind[]) {
  const typeLabel = entityTypeLabel(candidate.entityType)
  const reasonText = kinds.map((k) => KIND_LABEL_ZH[k]).join('、')
  const dateStr = hongKongYmd(candidate.targetDate)
  const link = `${appBaseUrl()}${candidate.hrefPath}`
  const urgency = urgencySubjectPrefix(candidate.daysDiff)
  const subject = `${urgency}[SK11-system] ${typeLabel}「${candidate.title}」· ${formatDaysDiffLabel(candidate.daysDiff)}`

  const text = [
    `SK11-system 到期提醒 ${urgency}`,
    ``,
    `類型：${typeLabel}`,
    `標題：${candidate.title}`,
    `目標日：${dateStr}`,
    `狀態：${formatDaysDiffLabel(candidate.daysDiff)}`,
    `觸發原因：${reasonText}`,
    `提前提醒設定：${candidate.reminderDays} 天`,
    ``,
    `前往系統：${link}`,
  ].join('\n')

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1f2937; line-height: 1.6;">
      <h2 style="margin: 0 0 12px; color: #1e3a5f;">SK11-system 到期提醒 ${escapeHtml(urgency)}</h2>
      <table style="border-collapse: collapse; width: 100%; max-width: 520px;">
        <tr><td style="padding: 6px 0; color: #6b7280;">類型</td><td style="padding: 6px 0; font-weight: 600;">${typeLabel}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">標題</td><td style="padding: 6px 0; font-weight: 600;">${escapeHtml(candidate.title)}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">目標日</td><td style="padding: 6px 0;">${dateStr}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">狀態</td><td style="padding: 6px 0;">${formatDaysDiffLabel(candidate.daysDiff)}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">觸發原因</td><td style="padding: 6px 0;">${reasonText}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">提前提醒</td><td style="padding: 6px 0;">${candidate.reminderDays} 天</td></tr>
      </table>
      <p style="margin: 20px 0 0;">
        <a href="${link}" style="display: inline-block; background: #1e3a5f; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 8px;">開啟系統</a>
      </p>
    </div>
  `

  return { subject, html, text }
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function toCandidate(input: {
  entityType: ReminderEntityType
  entityId: string
  title: string
  targetDate: Date
  reminderDays: number
  hrefPath: string
  todayYmd?: string
}): ReminderCandidate | null {
  const todayYmd = input.todayYmd || hongKongYmd()
  const daysDiff = daysDiffHongKong(input.targetDate, todayYmd)
  const kinds = matchReminderKinds(daysDiff, input.reminderDays)
  if (!kinds.length) return null
  return {
    entityType: input.entityType,
    entityId: input.entityId,
    title: input.title,
    targetDate: input.targetDate,
    reminderDays: input.reminderDays,
    daysDiff,
    kinds,
    hrefPath: input.hrefPath,
  }
}

export async function collectReminderCandidates(todayYmd = hongKongYmd()): Promise<ReminderCandidate[]> {
  const flags = await loadPluginFlags()

  const [contracts, activities, recurringTemplates] = await Promise.all([
    flags.contracts
      ? prisma.contract.findMany({
          select: {
            id: true,
            title: true,
            expiryDate: true,
            reminderDays: true,
          },
        })
      : Promise.resolve([]),
    flags.matters
      ? prisma.activity.findMany({
          where: { visibility: 'PUBLIC' },
          select: {
            id: true,
            title: true,
            eventDate: true,
            reminderDays: true,
          },
        })
      : Promise.resolve([]),
    flags.recurring
      ? prisma.recurringTemplate.findMany({
          select: {
            id: true,
            title: true,
            nextDueDate: true,
            reminderDays: true,
          },
        })
      : Promise.resolve([]),
  ])

  const candidates: ReminderCandidate[] = []

  for (const c of contracts) {
    const candidate = toCandidate({
      entityType: 'CONTRACT',
      entityId: c.id,
      title: c.title,
      targetDate: c.expiryDate,
      reminderDays: c.reminderDays,
      hrefPath: '/contracts',
      todayYmd,
    })
    if (candidate) candidates.push(candidate)
  }

  for (const a of activities) {
    const candidate = toCandidate({
      entityType: 'ACTIVITY',
      entityId: a.id,
      title: a.title,
      targetDate: a.eventDate,
      reminderDays: a.reminderDays,
      hrefPath: '/activities',
      todayYmd,
    })
    if (candidate) candidates.push(candidate)
  }

  for (const r of recurringTemplates) {
    const candidate = toCandidate({
      entityType: 'RECURRING',
      entityId: r.id,
      title: r.title,
      targetDate: normalizeDueDate(r.nextDueDate),
      reminderDays: r.reminderDays,
      hrefPath: '/recurring',
      todayYmd,
    })
    if (candidate) candidates.push(candidate)
  }

  return candidates
}

export type ReminderSendDetail = {
  entityType: ReminderEntityType
  entityId: string
  title: string
  kinds: ReminderKind[]
  status: 'SENT' | 'SKIPPED' | 'FAILED'
  error?: string
}

async function sendOneCandidate(candidate: ReminderCandidate): Promise<ReminderSendDetail> {
  const recipients = getReminderRecipients()
  const anchorDate = anchorDateYmd(candidate.targetDate)
  const pendingKinds: ReminderKind[] = []

  for (const kind of candidate.kinds) {
    const existing = await prisma.reminderEmailLog.findUnique({
      where: {
        entityType_entityId_kind_anchorDate: {
          entityType: candidate.entityType,
          entityId: candidate.entityId,
          kind,
          anchorDate,
        },
      },
    })
    if (existing?.status === 'SENT') continue
    pendingKinds.push(kind)
  }

  if (!pendingKinds.length) {
    return {
      entityType: candidate.entityType,
      entityId: candidate.entityId,
      title: candidate.title,
      kinds: candidate.kinds,
      status: 'SKIPPED',
    }
  }

  const { subject, html, text } = buildEmailContent(candidate, pendingKinds)
  const emailConfigured = isReminderEmailConfigured() && recipients.length > 0
  const waConfigured = isWhatsAppReminderConfigured()
  const channelCount = (emailConfigured ? 1 : 0) + (waConfigured ? 1 : 0)
  const toEmails = [
    emailConfigured ? recipients.join(',') : '',
    waConfigured ? 'whatsapp' : '',
  ]
    .filter(Boolean)
    .join('+')

  try {
    if (channelCount === 0) {
      throw new Error('No reminder channels configured')
    }

    const errors: string[] = []
    let okCount = 0

    if (emailConfigured) {
      try {
        await sendReminderEmail({ to: recipients, subject, html, text })
        okCount += 1
      } catch (e: unknown) {
        errors.push(`email: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (waConfigured) {
      const wa = await sendWhatsAppReminder({ subject, body: text })
      if (wa.ok) okCount += 1
      else errors.push(`whatsapp: ${wa.errors.join('; ') || 'send failed'}`)
    }

    if (okCount === 0) {
      throw new Error(errors.join(' | ') || 'All reminder channels failed')
    }

    const partialError = errors.length > 0 ? errors.join(' | ').slice(0, 1000) : null

    for (const kind of pendingKinds) {
      await prisma.reminderEmailLog.upsert({
        where: {
          entityType_entityId_kind_anchorDate: {
            entityType: candidate.entityType,
            entityId: candidate.entityId,
            kind,
            anchorDate,
          },
        },
        create: {
          entityType: candidate.entityType,
          entityId: candidate.entityId,
          kind,
          anchorDate,
          toEmails,
          subject,
          status: 'SENT',
          error: partialError,
        },
        update: {
          toEmails,
          subject,
          status: 'SENT',
          error: partialError,
          sentAt: new Date(),
        },
      })
    }

    return {
      entityType: candidate.entityType,
      entityId: candidate.entityId,
      title: candidate.title,
      kinds: pendingKinds,
      status: 'SENT',
      error: partialError || undefined,
    }
  } catch (e: any) {
    const message = e?.message || String(e)

    for (const kind of pendingKinds) {
      try {
        await prisma.reminderEmailLog.upsert({
          where: {
            entityType_entityId_kind_anchorDate: {
              entityType: candidate.entityType,
              entityId: candidate.entityId,
              kind,
              anchorDate,
            },
          },
          create: {
            entityType: candidate.entityType,
            entityId: candidate.entityId,
            kind,
            anchorDate,
            toEmails,
            subject,
            status: 'FAILED',
            error: message.slice(0, 1000),
          },
          update: {
            status: 'FAILED',
            error: message.slice(0, 1000),
            subject,
            toEmails,
          },
        })
      } catch (_logErr) {
        /* ignore log write failure */
      }
    }

    return {
      entityType: candidate.entityType,
      entityId: candidate.entityId,
      title: candidate.title,
      kinds: pendingKinds,
      status: 'FAILED',
      error: message,
    }
  }
}

/**
 * Immediate catch-up when creating/updating an entity that lands on a trigger day today.
 * No-op if not configured, private activity, or today is not a trigger day.
 */
export async function maybeSendReminderCatchUp(input: {
  entityType: ReminderEntityType
  entityId: string
  title: string
  targetDate: Date
  reminderDays: number
  /** Activities: only PUBLIC; contracts always eligible. */
  eligible?: boolean
}): Promise<ReminderSendDetail | null> {
  if (input.eligible === false) return null
  if (!isReminderEmailConfigured() && !isWhatsAppReminderConfigured()) return null

  const flags = await loadPluginFlags()
  if (input.entityType === 'CONTRACT' && !flags.contracts) return null
  if (input.entityType === 'ACTIVITY' && !flags.matters) return null
  if (input.entityType === 'RECURRING' && !flags.recurring) return null

  const candidate = toCandidate({
    entityType: input.entityType,
    entityId: input.entityId,
    title: input.title,
    targetDate: input.targetDate,
    reminderDays: input.reminderDays,
    hrefPath: entityHrefPath(input.entityType),
  })
  if (!candidate) return null

  return sendOneCandidate(candidate)
}

export type ReminderJobResult = {
  ok: boolean
  skippedReason?: string
  today: string
  sent: number
  skipped: number
  failed: number
  details: ReminderSendDetail[]
}

export async function runReminderEmailJob(): Promise<ReminderJobResult> {
  const today = hongKongYmd()
  const details: ReminderSendDetail[] = []

  if (!isReminderEmailConfigured() && !isWhatsAppReminderConfigured()) {
    return {
      ok: true,
      skippedReason:
        'No reminder channels: set RESEND_API_KEY+REMINDER_EMAILS and/or WhatsApp reminder env',
      today,
      sent: 0,
      skipped: 0,
      failed: 0,
      details: [],
    }
  }

  const candidates = await collectReminderCandidates(today)
  let sent = 0
  let skipped = 0
  let failed = 0

  for (const candidate of candidates) {
    const detail = await sendOneCandidate(candidate)
    details.push(detail)
    if (detail.status === 'SENT') sent += 1
    else if (detail.status === 'SKIPPED') skipped += 1
    else failed += 1
  }

  return { ok: failed === 0, today, sent, skipped, failed, details }
}
