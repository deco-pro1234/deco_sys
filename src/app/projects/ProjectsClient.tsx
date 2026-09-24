'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createTranslator, formatCurrency, type Locale } from '@/lib/i18n'
import { createProject } from '../actions/project'
import AiProjectFrameworkPanel from './AiProjectFrameworkPanel'
import ProjectMemberPicker, { type ProjectMemberPick } from './ProjectMemberPicker'
import { PageHelpHeading } from '@/components/HelpTip'
import ProjectRemindersGrouped from '@/components/ProjectRemindersGrouped'
import type { ProjectCompletionStats } from '@/lib/projects/completion'
import type { ReminderItem } from '../actions/reminder'
import { countReminderBuckets } from '@/lib/projects/reminderGrouping'

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

type Props = {
  locale: Locale
  currentUserId: string
  isAdmin: boolean
  isProjectTemp?: boolean
  initialProjects: ProjectListItem[]
  initialReminders?: ReminderItem[]
}

const STATUS_KEYS = ['PLANNING', 'ACTIVE', 'DONE', 'ARCHIVED'] as const

function dayLabel(value?: string | Date | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toISOString().slice(0, 10)
}

export default function ProjectsClient({
  locale,
  isAdmin,
  isProjectTemp = false,
  initialProjects,
  initialReminders = [],
}: Props) {
  const t = createTranslator(locale)
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<(typeof STATUS_KEYS)[number]>('PLANNING')
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<ProjectMemberPick[]>([])
  const [contactUserId, setContactUserId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [filter, setFilter] = useState<'ALL' | (typeof STATUS_KEYS)[number]>('ALL')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const memberIds = useMemo(() => selectedMembers.map((m) => m.id), [selectedMembers])

  useEffect(() => {
    if (contactUserId && !memberIds.includes(contactUserId)) {
      setContactUserId('')
    }
  }, [contactUserId, memberIds])

  const remindersByProject = useMemo(() => {
    const map = new Map<string, ReminderItem[]>()
    for (const item of initialReminders) {
      const id =
        item.projectId || item.href.match(/^\/projects\/([^/?#]+)/)?.[1] || ''
      if (!id) continue
      const list = map.get(id) || []
      list.push(item)
      map.set(id, list)
    }
    return map
  }, [initialReminders])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return initialProjects.filter((p) => {
      if (filter !== 'ALL' && p.status !== filter) return false
      if (q && !p.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [filter, initialProjects, search])

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      PLANNING: t('projectStatusPlanning'),
      ACTIVE: t('projectStatusActive'),
      DONE: t('projectStatusDone'),
      ARCHIVED: t('projectStatusArchived'),
    }
    return map[s] || s
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
    setSelectedMembers([])
    setContactUserId('')
    setShowCreate(false)
    router.refresh()
    if (res.id) router.push(`/projects/${res.id}`)
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
        <div className="space-y-2">
          <p className="px-1 text-xs text-[#C2410C]">{t('projectRemindersHint')}</p>
          <ProjectRemindersGrouped
            locale={locale}
            items={initialReminders}
            t={t}
            defaultOpen
            pageHref="/projects"
          />
        </div>
      ) : null}

      {!isProjectTemp && isAdmin ? (
        <div className="space-y-3 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <span className="text-sm font-semibold text-gray-800">{t('projectCreateToggle')}</span>
            <span
              aria-hidden
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#007AFF] text-sm font-bold text-white transition-transform ${
                showCreate ? 'rotate-45' : ''
              }`}
            >
              +
            </span>
          </button>
          {showCreate ? (
            <div className="space-y-3 border-t border-gray-100 pt-3">
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
              <div>
                <div className="mb-2 text-xs font-medium text-gray-500">{t('projectMembers')}</div>
                <p className="mb-2 text-[11px] leading-relaxed text-gray-400">
                  {t('projectMemberRoleHint')}
                </p>
                <ProjectMemberPicker
                  locale={locale}
                  selected={selectedMembers}
                  onChange={setSelectedMembers}
                  allowManagerRole={false}
                  disabled={submitting}
                />
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
                    {selectedMembers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.roleName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
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
          ) : null}
        </div>
      ) : !isProjectTemp ? (
        <div className="rounded-2xl bg-white px-4 py-3 text-sm text-gray-500 shadow-sm">
          {t('projectCreateAdminOnly')}
        </div>
      ) : null}

      {!isProjectTemp ? (
        <div className="space-y-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('projectSearchPlaceholder')}
            className="w-full rounded-2xl border border-transparent bg-white px-4 py-3 text-sm shadow-sm outline-none focus:border-[#007AFF]"
          />
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
        </div>
      ) : null}

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
            <div className="text-sm text-gray-400">{t('projectEmpty')}</div>
            {!isProjectTemp ? (
              <p className="mt-2 text-xs text-gray-400">{t('projectEmptyHint')}</p>
            ) : null}
          </div>
        ) : (
          filtered.map((project) => {
            const completion = project.completion
            const reminderCounts = countReminderBuckets(
              remindersByProject.get(project.id) || []
            )
            return (
              <a
                key={project.id}
                href={`/projects/${project.id}`}
                className="block rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm transition-colors hover:border-[#007AFF]/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-[15px] font-semibold text-gray-900">
                        {project.title}
                      </div>
                      {project.accessMode === 'temp' ? (
                        <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          {t('projectTempAccessBadge')}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                      <span>{statusLabel(project.status)}</span>
                      {!isProjectTemp && completion ? (
                        <span>
                          · {t('projectCompletion')} {completion.percent}%
                        </span>
                      ) : null}
                      <span>
                        · {t('projectTasks')} {project._count?.tasks ?? 0}
                      </span>
                      {!isProjectTemp && project.startDate ? (
                        <span className="text-gray-400">· {dayLabel(project.startDate)}</span>
                      ) : null}
                    </div>
                    {reminderCounts.total > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {reminderCounts.overdue > 0 ? (
                          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                            {t('reminderOverdue')} {reminderCounts.overdue}
                          </span>
                        ) : null}
                        {reminderCounts.today > 0 ? (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                            {t('reminderToday')} {reminderCounts.today}
                          </span>
                        ) : null}
                        {reminderCounts.upcoming > 0 ? (
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-800">
                            {t('reminderUpcoming')} {reminderCounts.upcoming}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-[#007AFF]">›</span>
                </div>
                {!isProjectTemp &&
                project.accessMode !== 'temp' &&
                project.ledgerSummary &&
                (project.canViewFullLedger || project.ledgerSummary.scoped) ? (
                  <div className="mt-2 text-[11px] text-gray-400">
                    {project.ledgerSummary.scoped
                      ? t('projectLedgerMyScope')
                      : t('projectLedgerBalance')}
                    : {formatCurrency(locale, project.ledgerSummary.balanceHkd || 0)}
                  </div>
                ) : null}
              </a>
            )
          })
        )}
      </div>
    </div>
  )
}
