'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { ReminderItem, ReminderKind } from '@/app/actions/reminder'
import type { Locale } from '@/lib/i18n'
import {
  countReminderBuckets,
  filterRemindersByUrgency,
  groupProjectReminders,
  type ReminderUrgencyFilter,
} from '@/lib/projects/reminderGrouping'

type TFn = (key: any) => string

type Props = {
  locale: Locale
  items: ReminderItem[]
  t: TFn
  /** When true, section starts expanded (e.g. projects page). Default collapsed. */
  defaultOpen?: boolean
  /** Compact styling for embedding inside project detail. */
  compact?: boolean
  /** Hide the outer title row (when parent already shows one). */
  hideHeader?: boolean
  title?: string
  pageHref?: string
}

function formatBadgeText(item: ReminderItem, locale: Locale) {
  if (item.bucket === 'overdue') {
    return locale === 'en' ? `${Math.abs(item.daysDiff)}d overdue` : `逾期 ${Math.abs(item.daysDiff)} 天`
  }
  if (item.bucket === 'today') {
    return locale === 'en' ? 'Today' : '今天'
  }
  return locale === 'en' ? `${item.daysDiff}d left` : `尚餘 ${item.daysDiff} 天`
}

function kindLabel(kind: ReminderKind | undefined, t: TFn) {
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

function dayLabel(value?: string | Date | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toISOString().slice(0, 10)
}

export default function ProjectRemindersGrouped({
  locale,
  items,
  t,
  defaultOpen = false,
  compact = false,
  hideHeader = false,
  title,
  pageHref = '/projects',
}: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const [urgency, setUrgency] = useState<ReminderUrgencyFilter>('action')
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({})

  const totals = useMemo(() => countReminderBuckets(items), [items])
  const filtered = useMemo(() => filterRemindersByUrgency(items, urgency), [items, urgency])
  const groups = useMemo(() => groupProjectReminders(filtered), [filtered])

  // If action filter is empty but upcoming exists, still show shell with filter chips.
  if (items.length === 0) return null

  const headerTitle = title || t('projectReminders')
  const effectiveOpen = hideHeader ? true : open

  return (
    <div
      className={
        compact
          ? 'rounded-2xl border border-[#FF9500]/20 bg-[#FFF7ED]/80 p-3'
          : 'rounded-2xl border border-[#FF9500]/20 bg-white/80 p-4 shadow-sm'
      }
    >
      {!hideHeader ? (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span
              aria-hidden
              className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#FF9500]/10 text-[10px] font-bold text-[#9A3412] transition-transform ${
                open ? 'rotate-90' : ''
              }`}
            >
              ▶
            </span>
            <span className="truncate text-sm font-semibold text-[#9A3412]">{headerTitle}</span>
            <span className="sr-only">
              {open ? t('reminderCollapseSection') : t('reminderExpandSection')}
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-[#FF9500]/10 px-2.5 py-1 text-xs font-bold text-[#C2410C]">
              {totals.total}
            </span>
            <Link
              href={pageHref}
              className="rounded-lg px-1.5 py-1 text-[11px] font-semibold text-[#C2410C] hover:bg-[#FFF7ED]"
            >
              {t('reminderOpenPage')}
            </Link>
          </div>
        </div>
      ) : null}

      <div className={`${hideHeader ? '' : 'mt-2'} flex flex-wrap gap-1.5 text-[11px]`}>
        {(
          [
            ['action', t('reminderFilterAction'), totals.action],
            ['upcoming', t('reminderUpcoming'), totals.upcoming],
            ['all', t('all'), totals.total],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setUrgency(key)
              if (!hideHeader) setOpen(true)
            }}
            className={`rounded-full px-2 py-0.5 font-semibold ${
              urgency === key
                ? 'bg-[#9A3412] text-white'
                : key === 'action' && totals.overdue > 0
                  ? 'bg-rose-50 text-rose-700'
                  : 'bg-[#FFF7ED] text-[#9A3412]'
            }`}
          >
            {label} {count}
          </button>
        ))}
      </div>

      {!hideHeader && !effectiveOpen ? (
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-gray-500">
          {totals.overdue > 0 ? (
            <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">
              {t('reminderOverdue')} {totals.overdue}
            </span>
          ) : null}
          {totals.today > 0 ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">
              {t('reminderToday')} {totals.today}
            </span>
          ) : null}
          {totals.upcoming > 0 ? (
            <span className="rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-800">
              {t('reminderUpcoming')} {totals.upcoming}
            </span>
          ) : null}
        </div>
      ) : null}

      {effectiveOpen ? (
        <div className="mt-3 space-y-2">
          {groups.length === 0 ? (
            <p className="rounded-xl bg-[#FFF7ED] px-3 py-2 text-xs text-[#9A3412]">
              {urgency === 'action' ? t('reminderNoActionItems') : t('reminderEmptyFilter')}
            </p>
          ) : (
            groups.map((group) => {
              const expanded = Boolean(expandedProjects[group.projectId])
              return (
                <div
                  key={group.projectId}
                  className="overflow-hidden rounded-xl border border-[#FF9500]/15 bg-white"
                >
                  <div className="flex items-stretch">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedProjects((prev) => ({
                          ...prev,
                          [group.projectId]: !prev[group.projectId],
                        }))
                      }
                      className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left"
                    >
                      <span
                        aria-hidden
                        className={`text-[10px] font-bold text-[#9A3412] transition-transform ${
                          expanded ? 'rotate-90' : ''
                        }`}
                      >
                        ▶
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-gray-900">
                          {group.projectTitle}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-1 text-[10px]">
                          {group.counts.overdue > 0 ? (
                            <span className="rounded-full bg-rose-50 px-1.5 py-0.5 font-semibold text-rose-700">
                              {t('reminderOverdue')} {group.counts.overdue}
                            </span>
                          ) : null}
                          {group.counts.today > 0 ? (
                            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-800">
                              {t('reminderToday')} {group.counts.today}
                            </span>
                          ) : null}
                          {group.counts.upcoming > 0 ? (
                            <span className="rounded-full bg-sky-50 px-1.5 py-0.5 font-semibold text-sky-800">
                              {t('reminderUpcoming')} {group.counts.upcoming}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-[#FFF7ED] px-2 py-0.5 text-xs font-bold text-[#C2410C]">
                        {group.counts.total}
                      </span>
                    </button>
                    <Link
                      href={group.href}
                      className="flex items-center border-l border-[#FF9500]/10 px-3 text-[11px] font-semibold text-[#C2410C] hover:bg-[#FFF7ED]"
                    >
                      {t('reminderHandleProject')}
                    </Link>
                  </div>

                  {expanded ? (
                    <div className="space-y-1 border-t border-[#FF9500]/10 bg-[#FFFBF5] px-2 py-2">
                      {group.items.map((item) => {
                        const kind = kindLabel(item.kind, t)
                        return (
                          <a
                            key={item.id}
                            href={item.href}
                            className="flex flex-col gap-1 rounded-lg bg-white px-2.5 py-2 text-sm text-gray-700 transition-colors hover:bg-[#FFEDD5] sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {kind ? (
                                  <span className="shrink-0 rounded-md bg-[#FFF7ED] px-1.5 py-0.5 text-[10px] font-semibold text-[#9A3412]">
                                    {kind}
                                  </span>
                                ) : null}
                                <span className="truncate font-medium text-gray-900">
                                  {item.title}
                                </span>
                              </div>
                              <div className="mt-0.5 text-[11px] text-gray-400">
                                {dayLabel(item.targetDate)}
                              </div>
                            </div>
                            <span className="shrink-0 rounded-full bg-[#FFF7ED] px-2 py-0.5 text-xs font-medium text-[#C2410C]">
                              {formatBadgeText(item, locale)}
                            </span>
                          </a>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              )
            })
          )}
        </div>
      ) : null}
    </div>
  )
}
