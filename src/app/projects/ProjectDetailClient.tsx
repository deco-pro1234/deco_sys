'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createTranslator, formatCurrency, type Locale } from '@/lib/i18n'
import { compressImage, MAX_PDF_PAGES, openAttachment, prepareAttachments, type ClientAttachment } from '@/lib/image'
import {
  addProjectMemo,
  addProjectTaskMemo,
  createProjectLedgerEntry,
  createProjectTask,
  createProjectTempAccount,
  deleteProject,
  deleteProjectLedgerEntry,
  deleteProjectTask,
  removeUserProjectTaskAccess,
  setProjectMembers,
  setUserProjectTaskAccess,
  updateProject,
  updateProjectTask,
} from '../actions/project'

type Candidate = {
  id: string
  roleName: string
  email: string
  isAdmin: boolean
  accountKind?: string
  loginPhone?: string | null
}

type TaskMemo = {
  id: string
  content: string
  createdAt: string | Date
  author?: { roleName?: string | null } | null
  attachments?: Array<{
    id: string
    fileUrl: string
    note?: string | null
    size?: number
    createdAt?: string | Date
  }>
}

type ProjectTask = {
  id: string
  title: string
  status: string
  dueDate?: string | Date | null
  reminderDays: number
  note?: string | null
  assigneeId?: string | null
  assignee?: { id?: string; roleName?: string | null } | null
  assignees?: Array<{
    userId: string
    user?: { id: string; roleName?: string | null; email?: string | null } | null
  }>
  createdBy?: { roleName?: string | null } | null
  memos?: TaskMemo[]
}

type TaskAccessRow = {
  id: string
  userId: string
  taskId: string
  canView: boolean
  canAddMemo: boolean
  expiresAt?: string | Date | null
  user?: { id: string; roleName?: string | null; email?: string | null } | null
  task?: { id: string; title: string; status: string } | null
}

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
  tasks: ProjectTask[]
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
  taskAccesses?: TaskAccessRow[]
  accessMode?: 'full' | 'temp'
  canManageTempAccess?: boolean
  canManageProject?: boolean
  myTaskAccess?: Record<string, { canView: boolean; canAddMemo: boolean }> | null
}

type Props = {
  locale: Locale
  currentUserId: string
  isAdmin: boolean
  project: ProjectDetail
  memberCandidates: Candidate[]
  tempAccountCandidates?: Candidate[]
}

type TempGrantDraft = {
  canView: boolean
  canAddMemo: boolean
}

function dayInput(value?: string | Date | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function getTaskAssigneeIds(task: ProjectTask) {
  if (task.assignees && task.assignees.length > 0) {
    return task.assignees.map((a) => a.userId)
  }
  return task.assigneeId ? [task.assigneeId] : []
}

function taskAssigneeNames(task: ProjectTask) {
  if (task.assignees && task.assignees.length > 0) {
    return task.assignees.map((a) => a.user?.roleName || a.userId).join(', ')
  }
  return task.assignee?.roleName || ''
}

export default function ProjectDetailClient({
  locale,
  isAdmin,
  project,
  memberCandidates,
  tempAccountCandidates = [],
}: Props) {
  const t = createTranslator(locale)
  const router = useRouter()
  const isTemp = project.accessMode === 'temp'
  const canManageTempAccess = Boolean(project.canManageTempAccess)
  const canManageProject = Boolean(project.canManageProject || isAdmin)
  const isFullMember = !isTemp

  const [tab, setTab] = useState<'tasks' | 'ledger' | 'memo' | 'settings' | 'temp'>(
    'tasks'
  )

  const [title, setTitle] = useState(project.title)
  const [status, setStatus] = useState(project.status)
  const [endDate, setEndDate] = useState(dayInput(project.endDate))
  const [reminderDays, setReminderDays] = useState(String(project.reminderDays || 15))
  const [note, setNote] = useState(project.note || '')
  const [memberIds, setMemberIds] = useState(project.members.map((m) => m.userId))

  const [taskTitle, setTaskTitle] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [taskAssigneeIds, setTaskAssigneeIds] = useState<string[]>([])
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [taskMemoDraft, setTaskMemoDraft] = useState('')
  const [taskMemoFiles, setTaskMemoFiles] = useState<ClientAttachment[]>([])
  const [assigneeOverrides, setAssigneeOverrides] = useState<Record<string, string[]>>({})
  const assigneeOverridesRef = useRef(assigneeOverrides)

  const [ledgerType, setLedgerType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE')
  const [ledgerAmount, setLedgerAmount] = useState('')
  const [ledgerDate, setLedgerDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [ledgerNote, setLedgerNote] = useState('')

  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)

  const memberIdSet = useMemo(
    () => new Set(project.members.map((m) => m.userId)),
    [project.members]
  )
  const tempCandidates = useMemo(
    () =>
      tempAccountCandidates.filter(
        (u) => u.id !== project.ownerId && !memberIdSet.has(u.id)
      ),
    [tempAccountCandidates, memberIdSet, project.ownerId]
  )

  const accessByUser = useMemo(() => {
    const map = new Map<
      string,
      {
        userId: string
        roleName: string
        email?: string | null
        expiresAt: string
        grants: Record<string, TempGrantDraft>
      }
    >()
    for (const row of project.taskAccesses || []) {
      const existing = map.get(row.userId) || {
        userId: row.userId,
        roleName: row.user?.roleName || row.userId,
        email: row.user?.email,
        expiresAt: dayInput(row.expiresAt),
        grants: {},
      }
      existing.grants[row.taskId] = {
        canView: row.canView,
        canAddMemo: row.canAddMemo,
      }
      if (row.expiresAt) existing.expiresAt = dayInput(row.expiresAt)
      map.set(row.userId, existing)
    }
    return Array.from(map.values())
  }, [project.taskAccesses])

  const [tempUserId, setTempUserId] = useState('')
  const [tempExpiresAt, setTempExpiresAt] = useState('')
  const [tempGrants, setTempGrants] = useState<Record<string, TempGrantDraft>>({})
  const [newTempName, setNewTempName] = useState('')
  const [newTempPhone, setNewTempPhone] = useState('')
  const [newTempPassword, setNewTempPassword] = useState('')
  const [createTempGrants, setCreateTempGrants] = useState<Record<string, TempGrantDraft>>({})
  const [createTempExpiresAt, setCreateTempExpiresAt] = useState('')

  useEffect(() => {
    assigneeOverridesRef.current = assigneeOverrides
  }, [assigneeOverrides])

  useEffect(() => {
    setMemberIds(project.members.map((m) => m.userId))
  }, [project.members])

  useEffect(() => {
    setAssigneeOverrides((prev) => {
      let changed = false
      const next = { ...prev }
      for (const task of project.tasks) {
        const override = next[task.id]
        if (!override) continue
        const server = getTaskAssigneeIds(task).slice().sort().join(',')
        if (server === override.slice().sort().join(',')) {
          delete next[task.id]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [project.tasks])

  const activeTab =
    tab === 'temp' && !canManageTempAccess
      ? 'tasks'
      : (tab === 'ledger' || tab === 'memo' || tab === 'settings') && isTemp
        ? 'tasks'
        : tab === 'settings' && !canManageProject
          ? canManageTempAccess
            ? 'temp'
            : 'tasks'
          : tab

  const summary = useMemo(() => {
    const income = (project.ledger || [])
      .filter((e) => e.type === 'INCOME')
      .reduce((s, e) => s + Number(e.amount || 0), 0)
    const expense = (project.ledger || [])
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

  const canAddMemoForTask = (taskId: string) => {
    if (isFullMember) return true
    return Boolean(project.myTaskAccess?.[taskId]?.canAddMemo)
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

  const toggleCreateAssignee = (id: string) => {
    setTaskAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const loadTempUserDraft = (userId: string) => {
    setTempUserId(userId)
    const existing = accessByUser.find((row) => row.userId === userId)
    setTempExpiresAt(existing?.expiresAt || '')
    const next: Record<string, TempGrantDraft> = {}
    for (const task of project.tasks) {
      const grant = existing?.grants[task.id]
      next[task.id] = {
        canView: Boolean(grant?.canView),
        canAddMemo: Boolean(grant?.canAddMemo),
      }
    }
    setTempGrants(next)
  }

  const handleMemoFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const result = await prepareAttachments(file)
      if (result.truncated) {
        alert(
          t('pdfPagesTruncated')
            .replace('{{total}}', String(result.totalPages))
            .replace('{{max}}', String(MAX_PDF_PAGES))
        )
      }
      setTaskMemoFiles((prev) => [...prev, ...result.attachments])
    } catch {
      try {
        const fallback = await compressImage(file, 200)
        setTaskMemoFiles((prev) => [...prev, fallback])
      } catch {
        alert(t('submitFailed'))
      }
    }
    event.target.value = ''
  }

  const tabs = (
    [
      ['tasks', t('projectTasks')],
      ...(isFullMember
        ? ([
            ['ledger', t('projectLedger')],
            ['memo', t('projectMemos')],
          ] as const)
        : []),
      ...(canManageTempAccess ? ([['temp', t('projectTempAccess')]] as const) : []),
      ...(canManageProject ? ([['settings', t('projectSettings')]] as const) : []),
    ] as const
  )

  return (
    <div className="mx-auto max-w-4xl space-y-4 py-4">
      <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
        <Link href="/projects" className="text-sm font-semibold text-[#007AFF]">
          ‹ {t('projectsPage')}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold text-gray-900">{project.title}</h1>
          {isTemp ? (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
              {t('projectTempAccessBadge')}
            </span>
          ) : null}
        </div>
        <div className="mt-1 text-xs text-gray-500">
          {projectStatusLabel(project.status)}
          {isFullMember ? (
            <>
              {' '}
              · {t('projectOwner')}: {project.owner?.roleName || '—'}
            </>
          ) : null}
        </div>
        {isFullMember ? (
          <>
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
            <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
              {t('projectLedgerHint')}
            </p>
          </>
        ) : (
          <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
            {t('projectTempGuestHint')}
          </p>
        )}
      </div>

      {tabs.length > 1 ? (
      <div className="flex gap-2 overflow-x-auto">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold ${
              activeTab === key ? 'bg-[#007AFF] text-white' : 'bg-white text-gray-600 shadow-sm'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      ) : null}

      {activeTab === 'tasks' ? (
        <div className="space-y-3 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          {isFullMember ? (
            <div className="space-y-2">
              <input
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder={t('projectTaskTitlePlaceholder')}
                className="w-full rounded-xl bg-[#F2F2F7] px-4 py-3 text-sm outline-none"
              />
              <input
                type="date"
                value={taskDue}
                onChange={(e) => setTaskDue(e.target.value)}
                className="w-full rounded-xl bg-[#F2F2F7] px-4 py-3 text-sm outline-none"
              />
              <div>
                <div className="mb-2 text-xs font-medium text-gray-500">
                  {t('projectTaskAssignees')}
                </div>
                <div className="flex flex-wrap gap-2">
                  {project.members.map((m) => (
                    <button
                      key={m.userId}
                      type="button"
                      onClick={() => toggleCreateAssignee(m.userId)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                        taskAssigneeIds.includes(m.userId)
                          ? 'bg-[#007AFF] text-white'
                          : 'bg-[#F2F2F7] text-gray-600'
                      }`}
                    >
                      {m.user?.roleName || m.userId}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                disabled={busy || !taskTitle.trim()}
                onClick={async () => {
                  const ok = await run(() =>
                    createProjectTask(project.id, {
                      title: taskTitle,
                      dueDate: taskDue || null,
                      assigneeIds: taskAssigneeIds,
                    })
                  )
                  if (ok) {
                    setTaskTitle('')
                    setTaskDue('')
                    setTaskAssigneeIds([])
                  }
                }}
                className="w-full rounded-xl bg-[#007AFF] py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {t('addProjectTask')}
              </button>
            </div>
          ) : null}

          <div className="divide-y divide-gray-100">
            {project.tasks.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-400">{t('projectTaskEmpty')}</div>
            ) : (
              project.tasks.map((task) => {
                const expanded = expandedTaskId === task.id
                const names = taskAssigneeNames(task)
                const canMemo = canAddMemoForTask(task.id)
                return (
                  <div key={task.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        className="min-w-0 flex-1 rounded-xl px-1 py-0.5 text-left hover:bg-gray-50"
                        onClick={() => {
                          setExpandedTaskId(expanded ? null : task.id)
                          setTaskMemoDraft('')
                          setTaskMemoFiles([])
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#F2F2F7] text-[10px] font-bold text-gray-500 transition-transform ${
                              expanded ? 'rotate-90' : ''
                            }`}
                            aria-hidden
                          >
                            ›
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-gray-900">{task.title}</div>
                            <div className="mt-1 text-xs text-gray-500">
                              {taskStatusLabel(task.status)}
                              {task.dueDate ? ` · ${dayInput(task.dueDate)}` : ''}
                              {names ? ` · ${names}` : ''}
                              {task.memos && task.memos.length > 0
                                ? ` · ${t('projectTaskMemoCount').replace('{{count}}', String(task.memos.length))}`
                                : ''}
                              {isTemp && !canMemo
                                ? ` · ${t('projectTempAccessReadOnly')}`
                                : ''}
                            </div>
                          </div>
                        </div>
                      </button>
                      {isFullMember ? (
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
                                    assigneeIds: getTaskAssigneeIds(task),
                                  })
                                )
                              }
                              className="rounded-lg bg-[#F2F2F7] px-2 py-1 text-[11px] font-semibold text-gray-700"
                            >
                              {task.status === 'TODO'
                                ? t('projectTaskStart')
                                : t('projectTaskComplete')}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              if (confirm(t('confirmDeleteItem'))) {
                                run(() => deleteProjectTask(task.id))
                              }
                            }}
                            className="rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-600"
                          >
                            {t('delete')}
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {expanded ? (
                      <div className="mt-3 space-y-3 rounded-2xl bg-[#F8FAFC] p-3">
                        {isFullMember ? (
                          <div>
                            <div className="mb-2 text-xs font-medium text-gray-500">
                              {t('projectTaskAssignees')}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {project.members.map((m) => {
                                const currentIds =
                                  assigneeOverrides[task.id] ?? getTaskAssigneeIds(task)
                                const selected = currentIds.includes(m.userId)
                                return (
                                  <button
                                    key={m.userId}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                      const base =
                                        assigneeOverridesRef.current[task.id] ??
                                        getTaskAssigneeIds(task)
                                      const next = selected
                                        ? base.filter((id) => id !== m.userId)
                                        : [...base, m.userId]
                                      setAssigneeOverrides((prev) => ({
                                        ...prev,
                                        [task.id]: next,
                                      }))
                                      run(() =>
                                        updateProjectTask(task.id, {
                                          title: task.title,
                                          status: task.status as any,
                                          dueDate: dayInput(task.dueDate) || null,
                                          reminderDays: task.reminderDays,
                                          note: task.note || undefined,
                                          assigneeIds: next,
                                        })
                                      ).then((ok) => {
                                        if (!ok) {
                                          setAssigneeOverrides((prev) => {
                                            const copy = { ...prev }
                                            delete copy[task.id]
                                            return copy
                                          })
                                        }
                                      })
                                    }}
                                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                                      selected
                                        ? 'bg-[#007AFF] text-white'
                                        : 'bg-white text-gray-600 shadow-sm'
                                    }`}
                                  >
                                    {m.user?.roleName || m.userId}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        ) : null}

                        <div className="space-y-2">
                          <div className="text-xs font-medium text-gray-500">
                            {t('projectTaskMemos')}
                          </div>
                          {(task.memos || []).length === 0 ? (
                            <div className="text-xs text-gray-400">
                              {t('projectTaskMemoEmpty')}
                            </div>
                          ) : (
                            (task.memos || []).map((m) => (
                              <div
                                key={m.id}
                                className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm"
                              >
                                <div className="text-xs text-gray-400">
                                  {m.author?.roleName || '—'} · {dayInput(m.createdAt)}
                                </div>
                                <div className="mt-1 whitespace-pre-wrap text-gray-800">
                                  {m.content}
                                </div>
                                {m.attachments && m.attachments.length > 0 ? (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {m.attachments.map((att, idx) => (
                                      <button
                                        key={att.id}
                                        type="button"
                                        onClick={() => openAttachment(att.fileUrl)}
                                        className="rounded-lg bg-[#EEF2FF] px-2 py-1 text-[11px] font-semibold text-[#4338CA]"
                                      >
                                        {att.note || `${t('attachment')} ${idx + 1}`}
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            ))
                          )}
                        </div>

                        {canMemo ? (
                          <>
                            <textarea
                              value={taskMemoDraft}
                              onChange={(e) => setTaskMemoDraft(e.target.value)}
                              rows={3}
                              placeholder={t('projectTaskMemoPlaceholder')}
                              className="w-full rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm outline-none"
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              <label className="cursor-pointer rounded-lg bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm">
                                {t('addAttachment')}
                                <input
                                  type="file"
                                  accept="image/*,application/pdf"
                                  className="hidden"
                                  onChange={handleMemoFiles}
                                />
                              </label>
                              {taskMemoFiles.map((f, idx) => (
                                <span
                                  key={`${f.url.slice(0, 24)}-${idx}`}
                                  className="rounded-lg bg-[#EEF2FF] px-2 py-1 text-[11px] text-[#4338CA]"
                                >
                                  {f.note || `${t('attachment')} ${idx + 1}`}
                                  <button
                                    type="button"
                                    className="ml-1 font-bold"
                                    onClick={() =>
                                      setTaskMemoFiles((prev) =>
                                        prev.filter((_, i) => i !== idx)
                                      )
                                    }
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                            <button
                              type="button"
                              disabled={
                                busy || (!taskMemoDraft.trim() && taskMemoFiles.length === 0)
                              }
                              onClick={async () => {
                                const ok = await run(() =>
                                  addProjectTaskMemo(task.id, {
                                    content: taskMemoDraft,
                                    attachments: taskMemoFiles.map((f) => ({
                                      url: f.url,
                                      size: f.size,
                                      note: f.note,
                                    })),
                                  })
                                )
                                if (ok) {
                                  setTaskMemoDraft('')
                                  setTaskMemoFiles([])
                                }
                              }}
                              className="w-full rounded-xl bg-[#007AFF] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                            >
                              {t('appendProjectTaskMemo')}
                            </button>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>
        </div>
      ) : null}

      {activeTab === 'ledger' && isFullMember ? (
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
                ledgerType === 'INCOME'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-[#F2F2F7] text-gray-600'
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
            {(project.ledger || []).length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-400">
                {t('projectLedgerEmpty')}
              </div>
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
                      if (confirm(t('confirmDeleteItem'))) {
                        run(() => deleteProjectLedgerEntry(entry.id))
                      }
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

      {activeTab === 'memo' && isFullMember ? (
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
            {(project.memos || []).map((m) => (
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

      {activeTab === 'temp' && canManageTempAccess ? (
        <div className="space-y-4 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">{t('projectTempAccessHint')}</p>
          <p className="text-xs text-gray-400">{t('projectTempAccountLoginHint')}</p>

          <div className="space-y-3 rounded-2xl bg-[#F8FAFC] p-4">
            <div className="text-sm font-semibold text-gray-800">
              {t('projectTempAccountCreate')}
            </div>
            <input
              value={newTempName}
              onChange={(e) => setNewTempName(e.target.value)}
              placeholder={t('projectTempAccountNamePlaceholder')}
              className="w-full rounded-xl bg-white px-4 py-3 text-sm outline-none shadow-sm"
            />
            <div className="text-[11px] text-gray-400">{t('projectTempAccountName')}</div>
            <input
              value={newTempPhone}
              onChange={(e) => setNewTempPhone(e.target.value)}
              placeholder={t('projectTempAccountPhonePlaceholder')}
              className="w-full rounded-xl bg-white px-4 py-3 text-sm outline-none shadow-sm"
            />
            <div className="text-[11px] text-gray-400">{t('projectTempAccountPhone')}</div>
            <input
              type="password"
              value={newTempPassword}
              onChange={(e) => setNewTempPassword(e.target.value)}
              placeholder={t('projectTempAccountPassword')}
              className="w-full rounded-xl bg-white px-4 py-3 text-sm outline-none shadow-sm"
            />
            <input
              type="date"
              value={createTempExpiresAt}
              onChange={(e) => setCreateTempExpiresAt(e.target.value)}
              className="w-full rounded-xl bg-white px-4 py-3 text-sm outline-none shadow-sm"
            />
            <div className="text-[11px] text-gray-400">{t('projectTempAccessExpires')}</div>
            <div>
              <div className="mb-2 text-xs font-medium text-gray-500">
                {t('projectTempAccessTasks')}
              </div>
              {project.tasks.length === 0 ? (
                <div className="text-xs text-gray-400">{t('projectTaskEmpty')}</div>
              ) : (
                <div className="space-y-2">
                  {project.tasks.map((task) => {
                    const grant = createTempGrants[task.id] || {
                      canView: false,
                      canAddMemo: false,
                    }
                    return (
                      <div
                        key={`create-${task.id}`}
                        className="rounded-2xl bg-white px-3 py-3 text-sm shadow-sm"
                      >
                        <div className="font-medium text-gray-900">{task.title}</div>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600">
                          <label className="inline-flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={grant.canView}
                              onChange={(e) => {
                                const canView = e.target.checked
                                setCreateTempGrants((prev) => ({
                                  ...prev,
                                  [task.id]: {
                                    canView,
                                    canAddMemo: canView
                                      ? prev[task.id]?.canAddMemo || false
                                      : false,
                                  },
                                }))
                              }}
                            />
                            {t('projectTempAccessCanView')}
                          </label>
                          <label className="inline-flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={grant.canAddMemo}
                              onChange={(e) => {
                                const canAddMemo = e.target.checked
                                setCreateTempGrants((prev) => ({
                                  ...prev,
                                  [task.id]: {
                                    canView: canAddMemo
                                      ? true
                                      : prev[task.id]?.canView || false,
                                    canAddMemo,
                                  },
                                }))
                              }}
                            />
                            {t('projectTempAccessCanAddMemo')}
                          </label>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <button
              type="button"
              disabled={busy || !newTempName.trim() || !newTempPassword}
              onClick={async () => {
                const ok = await run(() =>
                  createProjectTempAccount(project.id, {
                    roleName: newTempName,
                    phone: newTempPhone || null,
                    password: newTempPassword,
                    expiresAt: createTempExpiresAt || null,
                    grants: Object.entries(createTempGrants)
                      .filter(([, g]) => g.canView || g.canAddMemo)
                      .map(([taskId, g]) => ({
                        taskId,
                        canView: g.canView || g.canAddMemo,
                        canAddMemo: g.canAddMemo,
                        expiresAt: createTempExpiresAt || null,
                      })),
                  })
                )
                if (ok) {
                  setNewTempName('')
                  setNewTempPhone('')
                  setNewTempPassword('')
                  setCreateTempExpiresAt('')
                  setCreateTempGrants({})
                }
              }}
              className="w-full rounded-xl bg-[#007AFF] py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {t('projectTempAccountCreateSave')}
            </button>
          </div>

          <div>
            <div className="mb-2 text-xs font-medium text-gray-500">
              {t('projectTempAccessUser')}
            </div>
            <div className="flex flex-wrap gap-2">
              {tempCandidates.length === 0 ? (
                <div className="text-xs text-gray-400">{t('projectTempAccessSelectUser')}</div>
              ) : (
                tempCandidates.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => loadTempUserDraft(u.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                      tempUserId === u.id
                        ? 'bg-[#007AFF] text-white'
                        : 'bg-[#F2F2F7] text-gray-600'
                    }`}
                  >
                    {u.roleName}
                    {u.loginPhone ? ` · ${u.loginPhone}` : ''}
                  </button>
                ))
              )}
            </div>
          </div>

          {tempUserId ? (
            <>
              <div>
                <div className="mb-2 text-xs font-medium text-gray-500">
                  {t('projectTempAccessExpires')}
                </div>
                <input
                  type="date"
                  value={tempExpiresAt}
                  onChange={(e) => setTempExpiresAt(e.target.value)}
                  className="w-full rounded-xl bg-[#F2F2F7] px-4 py-3 text-sm outline-none"
                />
              </div>

              <div>
                <div className="mb-2 text-xs font-medium text-gray-500">
                  {t('projectTempAccessTasks')}
                </div>
                {project.tasks.length === 0 ? (
                  <div className="text-xs text-gray-400">{t('projectTaskEmpty')}</div>
                ) : (
                  <div className="space-y-2">
                    {project.tasks.map((task) => {
                      const grant = tempGrants[task.id] || {
                        canView: false,
                        canAddMemo: false,
                      }
                      return (
                        <div
                          key={task.id}
                          className="rounded-2xl bg-[#F8FAFC] px-3 py-3 text-sm"
                        >
                          <div className="font-medium text-gray-900">{task.title}</div>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600">
                            <label className="inline-flex items-center gap-1.5">
                              <input
                                type="checkbox"
                                checked={grant.canView}
                                onChange={(e) => {
                                  const canView = e.target.checked
                                  setTempGrants((prev) => ({
                                    ...prev,
                                    [task.id]: {
                                      canView,
                                      canAddMemo: canView
                                        ? prev[task.id]?.canAddMemo || false
                                        : false,
                                    },
                                  }))
                                }}
                              />
                              {t('projectTempAccessCanView')}
                            </label>
                            <label className="inline-flex items-center gap-1.5">
                              <input
                                type="checkbox"
                                checked={grant.canAddMemo}
                                onChange={(e) => {
                                  const canAddMemo = e.target.checked
                                  setTempGrants((prev) => ({
                                    ...prev,
                                    [task.id]: {
                                      canView: canAddMemo
                                        ? true
                                        : prev[task.id]?.canView || false,
                                      canAddMemo,
                                    },
                                  }))
                                }}
                              />
                              {t('projectTempAccessCanAddMemo')}
                            </label>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    setUserProjectTaskAccess(
                      project.id,
                      tempUserId,
                      Object.entries(tempGrants)
                        .filter(([, g]) => g.canView || g.canAddMemo)
                        .map(([taskId, g]) => ({
                          taskId,
                          canView: g.canView || g.canAddMemo,
                          canAddMemo: g.canAddMemo,
                          expiresAt: tempExpiresAt || null,
                        }))
                    )
                  )
                }
                className="w-full rounded-xl bg-[#007AFF] py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {t('projectTempAccessSave')}
              </button>
            </>
          ) : null}

          <div className="border-t border-gray-100 pt-4">
            <div className="mb-2 text-xs font-medium text-gray-500">
              {t('projectTempAccess')}
            </div>
            {accessByUser.length === 0 ? (
              <div className="text-sm text-gray-400">{t('projectTempAccessEmpty')}</div>
            ) : (
              <div className="space-y-3">
                {accessByUser.map((row) => (
                  <div
                    key={row.userId}
                    className="rounded-2xl border border-gray-100 px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          {row.roleName}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {Object.entries(row.grants)
                            .filter(([, g]) => g.canView)
                            .map(([taskId, g]) => {
                              const task = project.tasks.find((item) => item.id === taskId)
                              const label = task?.title || taskId
                              return `${label} (${g.canAddMemo ? t('projectTempAccessCanAddMemo') : t('projectTempAccessCanView')})`
                            })
                            .join(' · ')}
                          {row.expiresAt ? ` · ${row.expiresAt}` : ''}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          className="rounded-lg bg-[#F2F2F7] px-2 py-1 text-[11px] font-semibold text-gray-700"
                          onClick={() => loadTempUserDraft(row.userId)}
                        >
                          {t('projectTempAccessEdit')}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className="rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-600"
                          onClick={() => {
                            if (!confirm(t('confirmDeleteItem'))) return
                            run(() => removeUserProjectTaskAccess(project.id, row.userId))
                          }}
                        >
                          {t('projectTempAccessRemove')}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {activeTab === 'settings' && canManageProject ? (
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
