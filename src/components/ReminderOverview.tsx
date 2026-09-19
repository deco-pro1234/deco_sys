'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { createTranslator, type Locale } from '@/lib/i18n'
import type { ReminderBucket, ReminderItem, ReminderKind } from '@/app/actions/reminder'

type Props = {
  locale: Locale
  contracts: ReminderItem[]
  activities: ReminderItem[]
  recurring?: ReminderItem[]
  projects?: ReminderItem[]
}

const PREVIEW_PER_BUCKET = 2

function formatBadgeText(item: ReminderItem, locale: Locale) {
  if (item.bucket === 'overdue') {
    return locale === 'en' ? `${Math.abs(item.daysDiff)}d overdue` : `逾期 ${Math.abs(item.daysDiff)} 天`
  }
  if (item.bucket === 'today') {
    return locale === 'en' ? 'Today' : '今天'
  }
  return locale === 'en' ? `${item.daysDiff}d left` : `尚餘 ${item.daysDiff} 天`
}

function kindLabel(kind: ReminderKind | undefined, t: (key: any) => string) {
  switch (kind) {
    case 'project_start':
      return t('reminderKindProjectStart')
    case 'project_end':
      return t('reminderKindProjectEnd')
    case 'project_task_start':
      return t('reminderKindTaskStart')
    case 'project_task_due':
      return t('reminderKindTaskDue')
    default:
      return null
  }
}

function bucketCounts(items: ReminderItem[]) {
  return {
    overdue: items.filter((i) => i.bucket === 'overdue').length,
    today: items.filter((i) => i.bucket === 'today').length,
    upcoming: items.filter((i) => i.bucket === 'upcoming').length,
  }
}

function groupByBucket(items: ReminderItem[]) {
  return {
    overdue: items.filter((i) => i.bucket === 'overdue'),
    today: items.filter((i) => i.bucket === 'today'),
    upcoming: items.filter((i) => i.bucket === 'upcoming'),
  }
}

function ReminderRow({
  item,
  locale,
  t,
}: {
  item: ReminderItem
  locale: Locale
  t: (key: any) => string
}) {
  const kind = kindLabel(item.kind, t)
  return (
    <Link
      href={item.href}
      className="flex flex-col gap-1 rounded-xl bg-[#FFF7ED] px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-[#FFEDD5] sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          {kind ? (
            <span className="shrink-0 rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-[#9A3412]">
              {kind}
            </span>
          ) : null}
          <span className="truncate font-medium text-gray-900">{item.title}</span>
        </div>
      </div>
      <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-[#C2410C]">
        {formatBadgeText(item, locale)}
      </span>
    </Link>
  )
}

function Section({
  title,
  href,
  items,
  locale,
  t,
}: {
  title: string
  href: string
  items: ReminderItem[]
  locale: Locale
  t: (key: any) => string
}) {
  const [expanded, setExpanded] = useState(false)
  const groups = useMemo(() => groupByBucket(items), [items])
  const counts = useMemo(() => bucketCounts(items), [items])

  if (items.length === 0) return null

  const buckets: Array<{ key: ReminderBucket; label: string; list: ReminderItem[] }> = [
    { key: 'overdue', label: t('reminderOverdue'), list: groups.overdue },
    { key: 'today', label: t('reminderToday'), list: groups.today },
    { key: 'upcoming', label: t('reminderUpcoming'), list: groups.upcoming },
  ]

  const hiddenCount = buckets.reduce((sum, b) => {
    if (expanded) return sum
    return sum + Math.max(0, b.list.length - PREVIEW_PER_BUCKET)
  }, 0)

  return (
    <div className="rounded-2xl border border-[#FF9500]/20 bg-white/80 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <Link href={href} className="text-sm font-semibold text-[#9A3412] hover:underline">
          {title}
        </Link>
        <span className="rounded-full bg-[#FF9500]/10 px-2.5 py-1 text-xs font-bold text-[#C2410C]">
          {items.length}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        {counts.overdue > 0 ? (
          <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">
            {t('reminderOverdue')} {counts.overdue}
          </span>
        ) : null}
        {counts.today > 0 ? (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">
            {t('reminderToday')} {counts.today}
          </span>
        ) : null}
        {counts.upcoming > 0 ? (
          <span className="rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-800">
            {t('reminderUpcoming')} {counts.upcoming}
          </span>
        ) : null}
      </div>

      <div className="mt-3 space-y-3">
        {buckets.map((bucket) => {
          if (bucket.list.length === 0) return null
          const visible = expanded ? bucket.list : bucket.list.slice(0, PREVIEW_PER_BUCKET)
          return (
            <div key={bucket.key}>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                {bucket.label}
                <span className="ml-1 font-normal text-gray-400">({bucket.list.length})</span>
              </div>
              <div className="space-y-1.5">
                {visible.map((item) => (
                  <ReminderRow key={item.id} item={item} locale={locale} t={t} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {hiddenCount > 0 || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 w-full rounded-xl bg-[#FFF7ED] py-2 text-xs font-semibold text-[#9A3412] transition-colors hover:bg-[#FFEDD5]"
        >
          {expanded
            ? t('reminderCollapse')
            : t('reminderShowMore').replace('{{count}}', String(hiddenCount))}
        </button>
      ) : null}
    </div>
  )
}

export default function ReminderOverview({
  locale,
  contracts,
  activities,
  recurring = [],
  projects = [],
}: Props) {
  const t = createTranslator(locale)

  if (
    contracts.length === 0 &&
    activities.length === 0 &&
    recurring.length === 0 &&
    projects.length === 0
  ) {
    return null
  }

  return (
    <div className="mx-auto mt-4 grid max-w-4xl grid-cols-1 gap-3 px-4 sm:px-0 md:grid-cols-2">
      <Section title={t('contractExpiryReminder')} href="/contracts" items={contracts} locale={locale} t={t} />
      <Section title={t('activityReminder')} href="/activities" items={activities} locale={locale} t={t} />
      <Section title={t('projectReminders')} href="/projects" items={projects} locale={locale} t={t} />
      <Section title={t('recurring')} href="/recurring" items={recurring} locale={locale} t={t} />
    </div>
  )
}
