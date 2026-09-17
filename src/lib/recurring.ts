/** Add N months keeping preferred day-of-month, clamping to month end. */
export function addMonthsClamped(base: Date, months: number, dayOfMonth: number) {
  const year = base.getFullYear()
  const month = base.getMonth() + months
  const anchor = new Date(year, month, 1)
  const lastDay = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()
  const day = Math.min(Math.max(1, dayOfMonth), lastDay)
  return new Date(anchor.getFullYear(), anchor.getMonth(), day)
}

export function preferredDayOfMonth(date: Date) {
  return date.getDate()
}

export function normalizeDueDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export const RECURRING_INTERVAL_PRESETS = [
  { months: 1, key: 'everyMonth' as const },
  { months: 2, key: 'everyTwoMonths' as const },
  { months: 3, key: 'everyQuarter' as const },
  { months: 12, key: 'everyYear' as const },
]
