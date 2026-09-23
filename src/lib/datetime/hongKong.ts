/**
 * Project task schedules are entered as wall-clock times in Hong Kong
 * (`datetime-local` has no timezone). Railway/Node often runs in UTC, so
 * `new Date('2026-09-20T22:00')` would store 22:00Z and display as the next
 * morning in HKT — breaking consecutive same-level schedules.
 */

export const HONG_KONG_TZ = 'Asia/Hong_Kong'

const DATETIME_LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function hongKongParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: HONG_KONG_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value || 0)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

/**
 * Parse a `datetime-local` value (`YYYY-MM-DDTHH:mm`) as Hong Kong wall time.
 * Returns null for empty/invalid input.
 */
export function parseDatetimeLocalHongKong(
  value?: string | null
): Date | null {
  if (!value) return null
  const raw = String(value).trim()
  if (!raw) return null
  const m = raw.match(DATETIME_LOCAL_RE)
  if (!m) {
    const fallback = new Date(raw)
    return Number.isNaN(fallback.getTime()) ? null : fallback
  }
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const hour = Number(m[4])
  const minute = Number(m[5])
  const second = Number(m[6] || 0)
  if (
    [year, month, day, hour, minute, second].some((n) => Number.isNaN(n)) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null
  }
  // Hong Kong observes UTC+8 year-round (no DST).
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute, second, 0))
}

/** Value for `<input type="datetime-local">` in Hong Kong wall time. */
export function formatDatetimeLocalHongKong(
  value?: string | Date | null
): string {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const p = hongKongParts(d)
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}`
}

/** Display label `YYYY-MM-DD HH:mm` in Hong Kong wall time. */
export function formatDatetimeLabelHongKong(
  value?: string | Date | null
): string {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const p = hongKongParts(d)
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}`
}

/** Calendar date `YYYY-MM-DD` in Hong Kong. */
export function formatDateHongKong(value?: string | Date | null): string {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const p = hongKongParts(d)
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`
}
