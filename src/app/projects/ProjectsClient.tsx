'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createTranslator, formatCurrency, type Locale } from '@/lib/i18n'
import { createProject } from '../actions/project'
import AiProjectFrameworkPanel from './AiProjectFrameworkPanel'
import { PageHelpHeading } from '@/components/HelpTip'
import type { ProjectCompletionStats } from '@/lib/projects/completion'
import type { ReminderItem, ReminderKind } from '../actions/reminder'

type ProjectListItem = {
  id: string
  title: string
  status: string
  startDate?: string | Date | null
  endDate?: string | Date | null
  note?: string | null
  owner?: { id: string; roleName?: string | null } | null
  contactUser?: { id: string; roleName?: string | null } | null
  members?: Array<{ userId: string; user?: { roleName?: string | null } | null }>
  _count?: { tasks: number; ledger: number }
  completion?: ProjectCompletionStats | null
  ledgerSummary?: {
    incomeHkd: number
    expenseHkd: number
    balanceHkd: number
    scoped?: boolean
  } | null
  accessMode?: 'full' | 'temp'
  memberRole?: 'OWNER' | 'MANAGER' | 'MEMBER' | null
  canViewFullLedger?: boolean
}

type Candidate = { id: string; roleName: string; email: string; isAdmin: boolean }

type Props = {
  locale: Locale
  currentUserId: string
  isAdmin: boolean
  isProjectTemp?: boolean
  initialProjects: ProjectListItem[]
  memberCandidates: Candidate[]
  initialReminders?: ReminderItem[]
}

const STATUS_KEYS = ['PLANNING', 'ACTIVE', 'DONE', 'ARCHIVED'] as const
const REMINDER_PREVIEW = 5

function dayLabel(value?: string | Date | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toISOString().slice(0, 10)
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

export default function ProjectsClient({
  locale,
  isAdmin,
  isProjectTemp = false,
  initialProjects,
  memberCandidates,
  initialReminders = [],
}: Props) {
  const t = createTranslator(locale)
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<(typeof STATUS_KEYS)[number]>('PLANNING')
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [contactUserId, setContactUserId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [filter, setFilter] = useState<'ALL' | (typeof STATUS_KEYS)[number]>('ALL')
  const [remindersExpanded, setRemindersExpanded] = useState(false)
  const [reminderBucketFilter, setReminderBucketFilter] = useState<
    'ALL' | 'overdue' | 'today' | 'upcoming'
  >('ALL')

  const filtered = useMemo(() => {
    if (filter === 'ALL') return initialProjects
    return initialProjects.filter((p) => p.status === filter)
  }, [filter, initialProjects])

  const reminderGroups = useMemo(() => {
    return {
      overdue: initialReminders.filter((r) => r.bucket === 'overdue'),
      today: initialReminders.filter((r) => r.bucket === 'today'),
      upcoming: initialReminders.filter((r) => r.bucket === 'upcoming'),
    }
  }, [initialReminders])

  const filteredReminders = useMemo(() => {
    if (reminderBucketFilter === 'ALL') return initialReminders
    return initialReminders.filter((r) => r.bucket === reminderBucketFilter)
  }, [initialReminders, reminderBucketFilter])

  const visibleReminders = remindersExpanded
    ? filteredReminders
    : filteredReminders.slice(0, REMINDER_PREVIEW)

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      PLANNING: t('projectStatusPlanning'),
      ACTIVE: t('projectStatusActive'),
      DONE: t('projectStatusDone'),
      ARCHIVED: t('projectStatusArchived'),
    }
    return map[s] || s
  }

  const toggleMember = (id: string) => {
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const handleCreate = async () => {
    if (!isAdmin) return
    setSubmitting(true)
    const res = await createProject({
      title,
      status,
      startDate: startDate || null,
      note,
      memberIds,
      contactUserId: contactUserId || null,
    })
    setSubmitting(false)
    if (!res.success) {
      alert(res.error || t('submitFailed'))
      return
    }
    setTitle('')
    setNote('')
    setStartDate(new Date().toISOString().slice(0, 10))
    setMemberIds([])
    setContactUserId('')
    router.refresh()
    if (res.id) router.push(`/projects/${res.id}`)
  }

  const formatReminderBadge = (item: ReminderItem) => {
    if (item.bucket === 'overdue') {
      return locale === 'en'
        ? `${Math.abs(item.daysDiff)} days overdue`
        : `已逾期 ${Math.abs(item.daysDiff)} 天`
    }
    if (item.bucket === 'today') return t('reminderToday')
    return locale === 'en' ? `${item.daysDiff} days left` : `尚餘 ${item.daysDiff} 天`
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-0 py-4 sm:px-0">
      <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
        <PageHelpHeading
          locale={locale}
          title={isProjectTemp ? t('projectTempMyTasks') : t('projectsPage')}
          titleKey="helpProjectsTitle"
          bodyKey="helpProjectsBody"
          subtitle={isProjectTemp ? t('projectsPageTempHint') : t('projectsPageHint')}
        />
      </div>

      {initialReminders.length > 0 ? (
        <section className="rounded-2xl border border-[#FF9500]/20 bg-[#FFF7ED] px-4 py-4 shadow-sm sm:rounded-3xl sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-[#9A3412]">{t('projectReminders')}</h2>
              <p className="mt-1 text-sm text-[#C2410C]">{t('projectRemindersHint')}</p>
            </div>
            <span className="rounded-full bg-[#FF9500]/15 px-2.5 py-1 text-xs font-bold text-[#C2410C]">
              {initialReminders.length}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {(
              [
                ['ALL', t('all'), initialReminders.length],
                ['overdue', t('reminderOverdue'), reminderGroups.overdue.length],
                ['today', t('reminderToday'), reminderGroups.today.length],
                ['upcoming', t('reminderUpcoming'), reminderGroups.upcoming.length],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setReminderBucketFilter(key)
                  setRemindersExpanded(false)
                }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  reminderBucketFilter === key
                    ? 'bg-[#9A3412] text-white'
                    : 'bg-white/80 text-[#9A3412]'
                }`}
              >
                {label} {count}
              </button>
            ))}
          </div>

          <div className="mt-3 space-y-2">
            {visibleReminders.map((item) => {
              const kind = kindLabel(item.kind, t)
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex flex-col gap-1 rounded-xl bg-white/90 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-white sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {kind ? (
                        <span className="rounded-md bg-[#FFF7ED] px-1.5 py-0.5 text-[10px] font-semibold text-[#9A3412]">
                          {kind}
                        </span>
                      ) : null}
                      <span className="font-medium text-gray-900">{item.title}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      {dayLabel(item.targetDate)}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#FFF7ED] px-2 py-0.5 text-xs font-medium text-[#C2410C]">
                    {formatReminderBadge(item)}
                  </span>
                </Link>
              )
            })}
          </div>

          {filteredReminders.length > REMINDER_PREVIEW ? (
            <button
              type="button"
              onClick={() => setRemindersExpanded((v) => !v)}
              className="mt-3 w-full rounded-xl bg-white/80 py-2 text-xs font-semibold text-[#9A3412]"
            >
              {remindersExpanded
                ? t('reminderCollapse')
                : t('reminderShowMore').replace(
                    '{{count}}',
                    String(filteredReminders.length - REMINDER_PREVIEW)
                  )}
            </button>
          ) : null}
        </section>
      ) : null}

      {!isProjectTemp && isAdmin ? (
        <div className="space-y-3 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800">{t('createProject')}</h2>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('projectTitlePlaceholder')}
            className="w-full rounded-xl border border-transparent bg-[#F2F2F7] px-4 py-3 text-sm outline-none focus:border-[#007AFF] focus:bg-white"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as (typeof STATUS_KEYS)[number])}
              className="rounded-xl border border-transparent bg-[#F2F2F7] px-4 py-3 text-sm outline-none"
            >
              {STATUS_KEYS.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                {t('projectStartDate')}
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-transparent bg-[#F2F2F7] px-4 py-3 text-sm outline-none"
              />
            </label>
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('projectNotePlaceholder')}
            rows={2}
            className="w-full rounded-xl border border-transparent bg-[#F2F2F7] px-4 py-3 text-sm outline-none focus:border-[#007AFF] focus:bg-white"
          />
          {memberCandidates.length > 0 ? (
            <div>
              <div className="mb-2 text-xs font-medium text-gray-500">{t('projectMembers')}</div>
              <div className="flex flex-wrap gap-2">
                {memberCandidates.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleMember(u.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                      memberIds.includes(u.id)
                        ? 'bg-[#007AFF] text-white'
                        : 'bg-[#F2F2F7] text-gray-600'
                    }`}
                  >
                    {u.roleName}
                  </button>
                ))}
              </div>
              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-medium text-gray-500">
                  {t('projectContact')}
                </span>
                <select
                  value={contactUserId}
                  onChange={(e) => setContactUserId(e.target.value)}
                  className="w-full rounded-xl border border-transparent bg-[#F2F2F7] px-4 py-3 text-sm outline-none"
                >
                  <option value="">{t('projectContactNone')}</option>
                  {memberCandidates.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.roleName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          <button
            type="button"
            disabled={submitting || !title.trim()}
            onClick={handleCreate}
            className="w-full rounded-xl bg-[#007AFF] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? t('saving') : t('createProject')}
          </button>
          <AiProjectFrameworkPanel locale={locale} memberIds={memberIds} />
        </div>
      ) : !isProjectTemp ? (
        <div className="rounded-2xl bg-white px-4 py-3 text-sm text-gray-500 shadow-sm">
          {t('projectCreateAdminOnly')}
        </div>
      ) : null}

      {!isProjectTemp ? (
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['ALL', ...STATUS_KEYS] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
              filter === s ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 shadow-sm'
            }`}
          >
            {s === 'ALL' ? t('all') : statusLabel(s)}
          </button>
        ))}
      </div>
      ) : null}

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-3xl bg-white p-8 text-center text-sm text-gray-400 shadow-sm">
            {t('projectEmpty')}
          </div>
        ) : (
          filtered.map((project) => {
            const completion = project.completion
            return (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="block rounded-3xl border border-gray-100 bg-white p-4 shadow-sm transition-colors hover:border-[#007AFF]/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-base font-semibold text-gray-900">
                      {project.title}
                    </div>
                    {project.accessMode === 'temp' ? (
                      <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                        {t('projectTempAccessBadge')}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {isProjectTemp
                      ? `${t('projectTasks')}: ${project._count?.tasks ?? 0}`
                      : `${t('projectOwner')}: ${project.owner?.roleName || '—'} · ${t('projectStartDate')}: ${dayLabel(project.startDate)}`}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-[#F2F2F7] px-2.5 py-1 text-[11px] font-semibold text-gray-600">
                  {statusLabel(project.status)}
                </span>
              </div>
              {!isProjectTemp ? (
              <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
                <div className="rounded-xl bg-[#F2F2F7] px-2 py-2">
                  <div className="text-gray-400">{t('projectCompletion')}</div>
                  <div className="font-semibold text-gray-800">
                    {completion
                      ? `${completion.percent}% (${completion.done}/${completion.total})`
                      : '—'}
                  </div>
                </div>
                <div className="rounded-xl bg-[#F2F2F7] px-2 py-2">
                  <div className="text-gray-400">{t('projectTasks')}</div>
                  <div className="font-semibold text-gray-800">{project._count?.tasks ?? 0}</div>
                </div>
                <div className="rounded-xl bg-[#F2F2F7] px-2 py-2">
                  <div className="text-gray-400">
                    {project.accessMode === 'temp'
                      ? t('projectTempAccessBadge')
                      : project.ledgerSummary?.scoped
                        ? t('projectLedgerMyScope')
                        : t('projectLedgerBalance')}
                  </div>
                  <div className="font-semibold text-gray-800">
                    {project.accessMode === 'temp'
                      ? '—'
                      : formatCurrency(locale, project.ledgerSummary?.balanceHkd || 0)}
                  </div>
                </div>
                <div className="rounded-xl bg-[#F2F2F7] px-2 py-2">
                  <div className="text-gray-400">{t('projectMembers')}</div>
                  <div className="font-semibold text-gray-800">
                    {project.accessMode === 'temp' ? '—' : project.members?.length ?? 0}
                  </div>
                </div>
              </div>
              ) : null}
            </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
