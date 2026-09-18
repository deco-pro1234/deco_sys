'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createTranslator, formatCurrency, type Locale } from '@/lib/i18n'
import {
  addProjectMemo,
  createProjectLedgerEntry,
  createProjectTask,
  deleteProject,
  deleteProjectLedgerEntry,
  deleteProjectTask,
  setProjectMembers,
  updateProject,
  updateProjectTask,
} from '../actions/project'

type Candidate = { id: string; roleName: string; email: string; isAdmin: boolean }

type ProjectDetail = {
  id: string
  title: string
  status: string
  startDate?: string | Date | null
  endDate?: string | Date | null
  reminderDays: number
  note?: string | null
  ownerId: string
  owner?: { id: string; roleName?: string | null } | null
  members: Array<{
    id: string
    userId: string
    role: string
    user?: { id: string; roleName?: string | null; email?: string | null } | null
  }>
  tasks: Array<{
    id: string
    title: string
    status: string
    dueDate?: string | Date | null
    reminderDays: number
    note?: string | null
    assigneeId?: string | null
    assignee?: { roleName?: string | null } | null
    createdBy?: { roleName?: string | null } | null
  }>
  ledger: Array<{
    id: string
    type: string
    amount: number
    date: string | Date
    note?: string | null
    createdBy?: { roleName?: string | null } | null
  }>
  memos: Array<{
    id: string
    content: string
    createdAt: string | Date
    author?: { roleName?: string | null } | null
  }>
}

type Props = {
  locale: Locale
  currentUserId: string
  isAdmin: boolean
  project: ProjectDetail
  memberCandidates: Candidate[]
}

function dayInput(value?: string | Date | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

export default function ProjectDetailClient({
  locale,
  isAdmin,
  project,
  memberCandidates,
}: Props) {
  const t = createTranslator(locale)
  const router = useRouter()
  const [tab, setTab] = useState<'tasks' | 'ledger' | 'memo' | 'settings'>('tasks')

  const [title, setTitle] = useState(project.title)
  const [status, setStatus] = useState(project.status)
  const [endDate, setEndDate] = useState(dayInput(project.endDate))
  const [reminderDays, setReminderDays] = useState(String(project.reminderDays || 15))
  const [note, setNote] = useState(project.note || '')
  const [memberIds, setMemberIds] = useState(project.members.map((m) => m.userId))

  const [taskTitle, setTaskTitle] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [taskAssignee, setTaskAssignee] = useState('')

  const [ledgerType, setLedgerType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE')
  const [ledgerAmount, setLedgerAmount] = useState('')
  const [ledgerDate, setLedgerDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [ledgerNote, setLedgerNote] = useState('')

  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)

  const summary = useMemo(() => {
    const income = project.ledger
      .filter((e) => e.type === 'INCOME')
      .reduce((s, e) => s + Number(e.amount || 0), 0)
    const expense = project.ledger
      .filter((e) => e.type === 'EXPENSE')
      .reduce((s, e) => s + Number(e.amount || 0), 0)
    return { income, expense, balance: income - expense }
  }, [project.ledger])

  const projectStatusLabel = (s: string) => {
    const map: Record<string, string> = {
      PLANNING: t('projectStatusPlanning'),
      ACTIVE: t('projectStatusActive'),
      DONE: t('projectStatusDone'),
      ARCHIVED: t('projectStatusArchived'),
    }
    return map[s] || s
  }

  const taskStatusLabel = (s: string) => {
    const map: Record<string, string> = {
      TODO: t('projectTaskTodo'),
      DOING: t('projectTaskDoing'),
      DONE: t('projectTaskDone'),
    }
    return map[s] || s
  }

  const run = async (fn: () => Promise<{ success: boolean; error?: string }>) => {
    setBusy(true)
    const res = await fn()
    setBusy(false)
    if (!res.success) {
      alert(res.error || t('submitFailed'))
      return false
    }
    router.refresh()
    return true
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 py-4">
      <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
        <Link href="/projects" className="text-sm font-semibold text-[#007AFF]">
          ‹ {t('projectsPage')}
        </Link>
        <h1 className="mt-2 text-xl font-bold text-gray-900">{project.title}</h1>
        <div className="mt-1 text-xs text-gray-500">
          {projectStatusLabel(project.status)} · {t('projectOwner')}: {project.owner?.roleName || '—'}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl bg-[#ECFDF5] px-2 py-2">
            <div className="text-emerald-700/70">{t('income')}</div>
            <div className="font-semibold text-emerald-800">
              {formatCurrency(locale, summary.income)}
            </div>
          </div>
          <div className="rounded-xl bg-[#FEF2F2] px-2 py-2">
            <div className="text-rose-700/70">{t('expense')}</div>
            <div className="font-semibold text-rose-800">
              {formatCurrency(locale, summary.expense)}
            </div>
          </div>
          <div className="rounded-xl bg-[#F2F2F7] px-2 py-2">
            <div className="text-gray-400">{t('projectLedgerBalance')}</div>
            <div className="font-semibold text-gray-800">
              {formatCurrency(locale, summary.balance)}
            </div>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-gray-400">{t('projectLedgerHint')}</p>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {(
          [
            ['tasks', t('projectTasks')],
            ['ledger', t('projectLedger')],
            ['memo', t('projectMemos')],
            ...(isAdmin ? ([['settings', t('projectSettings')]] as const) : []),
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold ${
              tab === key ? 'bg-[#007AFF] text-white' : 'bg-white text-gray-600 shadow-sm'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'tasks' ? (
        <div className="space-y-3 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="space-y-2">
            <input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder={t('projectTaskTitlePlaceholder')}
              className="w-full rounded-xl bg-[#F2F2F7] px-4 py-3 text-sm outline-none"
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                type="date"
                value={taskDue}
                onChange={(e) => setTaskDue(e.target.value)}
                className="rounded-xl bg-[#F2F2F7] px-4 py-3 text-sm outline-none"
              />
              <select
                value={taskAssignee}
                onChange={(e) => setTaskAssignee(e.target.value)}
                className="rounded-xl bg-[#F2F2F7] px-4 py-3 text-sm outline-none"
              >
                <option value="">{t('projectAssigneeOptional')}</option>
                {project.members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.user?.roleName || m.userId}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={busy || !taskTitle.trim()}
              onClick={async () => {
                const ok = await run(() =>
                  createProjectTask(project.id, {
                    title: taskTitle,
                    dueDate: taskDue || null,
                    assigneeId: taskAssignee || null,
                  })
                )
                if (ok) {
                  setTaskTitle('')
                  setTaskDue('')
                  setTaskAssignee('')
                }
              }}
              className="w-full rounded-xl bg-[#007AFF] py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {t('addProjectTask')}
            </button>
          </div>

          <div className="divide-y divide-gray-100">
            {project.tasks.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-400">{t('projectTaskEmpty')}</div>
            ) : (
              project.tasks.map((task) => (
                <div key={task.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900">{task.title}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {taskStatusLabel(task.status)}
                      {task.dueDate ? ` · ${dayInput(task.dueDate)}` : ''}
                      {task.assignee?.roleName ? ` · ${task.assignee.roleName}` : ''}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {task.status !== 'DONE' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            updateProjectTask(task.id, {
                              title: task.title,
                              status: task.status === 'TODO' ? 'DOING' : 'DONE',
                              dueDate: dayInput(task.dueDate) || null,
                              reminderDays: task.reminderDays,
                              note: task.note || undefined,
                              assigneeId: task.assigneeId,
                            })
                          )
                        }
                        className="rounded-lg bg-[#F2F2F7] px-2 py-1 text-[11px] font-semibold text-gray-700"
                      >
                        {task.status === 'TODO' ? t('projectTaskStart') : t('projectTaskComplete')}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (confirm(t('confirmDeleteItem'))) run(() => deleteProjectTask(task.id))
                      }}
                      className="rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-600"
                    >
                      {t('delete')}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {tab === 'ledger' ? (
        <div className="space-y-3 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setLedgerType('EXPENSE')}
              className={`rounded-xl py-2 text-sm font-semibold ${
                ledgerType === 'EXPENSE' ? 'bg-rose-500 text-white' : 'bg-[#F2F2F7] text-gray-600'
              }`}
            >
              {t('expense')}
            </button>
            <button
              type="button"
              onClick={() => setLedgerType('INCOME')}
              className={`rounded-xl py-2 text-sm font-semibold ${
                ledgerType === 'INCOME' ? 'bg-emerald-500 text-white' : 'bg-[#F2F2F7] text-gray-600'
              }`}
            >
              {t('income')}
            </button>
          </div>
          <input
            type="number"
            min="0"
            step="0.01"
            value={ledgerAmount}
            onChange={(e) => setLedgerAmount(e.target.value)}
            placeholder={t('projectLedgerAmountPlaceholder')}
            className="w-full rounded-xl bg-[#F2F2F7] px-4 py-3 text-sm outline-none"
          />
          <input
            type="date"
            value={ledgerDate}
            onChange={(e) => setLedgerDate(e.target.value)}
            className="w-full rounded-xl bg-[#F2F2F7] px-4 py-3 text-sm outline-none"
          />
          <input
            value={ledgerNote}
            onChange={(e) => setLedgerNote(e.target.value)}
            placeholder={t('note')}
            className="w-full rounded-xl bg-[#F2F2F7] px-4 py-3 text-sm outline-none"
          />
          <button
            type="button"
            disabled={busy || !ledgerAmount}
            onClick={async () => {
              const ok = await run(() =>
                createProjectLedgerEntry(project.id, {
                  type: ledgerType,
                  amount: Number(ledgerAmount),
                  date: ledgerDate,
                  note: ledgerNote,
                })
              )
              if (ok) {
                setLedgerAmount('')
                setLedgerNote('')
              }
            }}
            className="w-full rounded-xl bg-[#007AFF] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t('addProjectLedgerEntry')}
          </button>

          <div className="divide-y divide-gray-100">
            {project.ledger.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-400">{t('projectLedgerEmpty')}</div>
            ) : (
              project.ledger.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {entry.type === 'INCOME' ? t('income') : t('expense')}{' '}
                      {formatCurrency(locale, entry.amount)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {dayInput(entry.date)}
                      {entry.note ? ` · ${entry.note}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (confirm(t('confirmDeleteItem'))) run(() => deleteProjectLedgerEntry(entry.id))
                    }}
                    className="rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-600"
                  >
                    {t('delete')}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {tab === 'memo' ? (
        <div className="space-y-3 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={3}
            placeholder={t('memoPlaceholder')}
            className="w-full rounded-xl bg-[#F2F2F7] px-4 py-3 text-sm outline-none"
          />
          <button
            type="button"
            disabled={busy || !memo.trim()}
            onClick={async () => {
              const ok = await run(() => addProjectMemo(project.id, memo))
              if (ok) setMemo('')
            }}
            className="w-full rounded-xl bg-[#007AFF] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t('addProjectMemo')}
          </button>
          <div className="space-y-2">
            {project.memos.map((m) => (
              <div key={m.id} className="rounded-xl bg-[#F2F2F7] px-3 py-2 text-sm">
                <div className="text-xs text-gray-400">
                  {m.author?.roleName || '—'} · {dayInput(m.createdAt)}
                </div>
                <div className="mt-1 text-gray-800">{m.content}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === 'settings' && isAdmin ? (
        <div className="space-y-3 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl bg-[#F2F2F7] px-4 py-3 text-sm outline-none"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-xl bg-[#F2F2F7] px-4 py-3 text-sm outline-none"
          >
            {['PLANNING', 'ACTIVE', 'DONE', 'ARCHIVED'].map((s) => (
              <option key={s} value={s}>
                {projectStatusLabel(s)}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-xl bg-[#F2F2F7] px-4 py-3 text-sm outline-none"
          />
          <input
            type="number"
            value={reminderDays}
            onChange={(e) => setReminderDays(e.target.value)}
            className="w-full rounded-xl bg-[#F2F2F7] px-4 py-3 text-sm outline-none"
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full rounded-xl bg-[#F2F2F7] px-4 py-3 text-sm outline-none"
          />
          <div>
            <div className="mb-2 text-xs font-medium text-gray-500">{t('projectMembers')}</div>
            <div className="flex flex-wrap gap-2">
              {memberCandidates.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() =>
                    setMemberIds((prev) =>
                      prev.includes(u.id) ? prev.filter((x) => x !== u.id) : [...prev, u.id]
                    )
                  }
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
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const a = await updateProject(project.id, {
                  title,
                  status: status as any,
                  endDate: endDate || null,
                  reminderDays: Number(reminderDays) || 15,
                  note,
                })
                if (!a.success) return a
                return setProjectMembers(project.id, memberIds)
              })
            }
            className="w-full rounded-xl bg-[#007AFF] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t('save')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (!confirm(t('confirmDeleteProject'))) return
              const ok = await run(() => deleteProject(project.id))
              if (ok) router.push('/projects')
            }}
            className="w-full rounded-xl bg-rose-50 py-3 text-sm font-semibold text-rose-600"
          >
            {t('deleteProject')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
