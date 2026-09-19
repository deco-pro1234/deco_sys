'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createTranslator, formatCurrency, type Locale } from '@/lib/i18n'
import { createProject } from '../actions/project'

type ProjectListItem = {
  id: string
  title: string
  status: string
  startDate?: string | Date | null
  endDate?: string | Date | null
  note?: string | null
  owner?: { id: string; roleName?: string | null } | null
  members?: Array<{ userId: string; user?: { roleName?: string | null } | null }>
  _count?: { tasks: number; ledger: number }
  ledgerSummary?: { incomeHkd: number; expenseHkd: number; balanceHkd: number } | null
  accessMode?: 'full' | 'temp'
}

type Candidate = { id: string; roleName: string; email: string; isAdmin: boolean }

type Props = {
  locale: Locale
  currentUserId: string
  isAdmin: boolean
  initialProjects: ProjectListItem[]
  memberCandidates: Candidate[]
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
  initialProjects,
  memberCandidates,
}: Props) {
  const t = createTranslator(locale)
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<(typeof STATUS_KEYS)[number]>('PLANNING')
  const [endDate, setEndDate] = useState('')
  const [note, setNote] = useState('')
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [filter, setFilter] = useState<'ALL' | (typeof STATUS_KEYS)[number]>('ALL')

  const filtered = useMemo(() => {
    if (filter === 'ALL') return initialProjects
    return initialProjects.filter((p) => p.status === filter)
  }, [filter, initialProjects])

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
      endDate: endDate || null,
      note,
      memberIds,
    })
    setSubmitting(false)
    if (!res.success) {
      alert(res.error || t('submitFailed'))
      return
    }
    setTitle('')
    setNote('')
    setEndDate('')
    setMemberIds([])
    router.refresh()
    if (res.id) router.push(`/projects/${res.id}`)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-0 py-4 sm:px-0">
      <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">{t('projectsPage')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('projectsPageHint')}</p>
      </div>

      {isAdmin ? (
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
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-xl border border-transparent bg-[#F2F2F7] px-4 py-3 text-sm outline-none"
            />
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
        </div>
      ) : (
        <div className="rounded-2xl bg-white px-4 py-3 text-sm text-gray-500 shadow-sm">
          {t('projectCreateAdminOnly')}
        </div>
      )}

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

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-3xl bg-white p-8 text-center text-sm text-gray-400 shadow-sm">
            {t('projectEmpty')}
          </div>
        ) : (
          filtered.map((project) => (
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
                    {t('projectOwner')}: {project.owner?.roleName || '—'} · {t('projectEndDate')}:{' '}
                    {dayLabel(project.endDate)}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-[#F2F2F7] px-2.5 py-1 text-[11px] font-semibold text-gray-600">
                  {statusLabel(project.status)}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl bg-[#F2F2F7] px-2 py-2">
                  <div className="text-gray-400">{t('projectTasks')}</div>
                  <div className="font-semibold text-gray-800">{project._count?.tasks ?? 0}</div>
                </div>
                <div className="rounded-xl bg-[#F2F2F7] px-2 py-2">
                  <div className="text-gray-400">
                    {project.accessMode === 'temp'
                      ? t('projectTempAccessBadge')
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
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
