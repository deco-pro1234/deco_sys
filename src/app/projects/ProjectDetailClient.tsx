'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createTranslator, formatCurrency, type Locale } from '@/lib/i18n'
import { compressImage, MAX_PDF_PAGES, openAttachment, prepareAttachments, type ClientAttachment } from '@/lib/image'
import {
  addProjectMemo,
  addProjectTaskMemo,
  addProjectSectionAttachment,
  addProjectTaskAttachment,
  createProjectLedgerEntry,
  createProjectSection,
  createProjectTask,
  createProjectTempAccount,
  deleteProject,
  deleteProjectLedgerEntry,
  deleteProjectSection,
  deleteProjectTask,
  exportProjectPdf,
  exportProjectSectionPdf,
  exportProjectTaskPdf,
  removeUserProjectTaskAccess,
  setProjectMembers,
  setUserProjectSectionAccess,
  updateProject,
  updateProjectSection,
  updateProjectTask,
} from '../actions/project'
import {
  computeProjectCompletion,
  taskCompletionPercent,
  type ProjectCompletionStats,
} from '@/lib/projects/completion'
import { FieldHelpLabel, LocaleHelpTip } from '@/components/HelpTip'
import OcrNoteButton, { type OcrResolvedPayload } from '@/components/OcrNoteButton'

type ContactProfile = {
  contactPhone?: string | null
  contactEmail?: string | null
  jobTitle?: string | null
  department?: string | null
}

type ContactUser = {
  id: string
  roleName?: string | null
  email?: string | null
  loginPhone?: string | null
  accountKind?: string | null
  profile?: ContactProfile | null
}

type Candidate = {
  id: string
  roleName: string
  email: string
  isAdmin: boolean
  accountKind?: string
  loginPhone?: string | null
}

type FileAttachment = {
  id: string
  fileUrl: string
  note?: string | null
  size?: number
  createdAt?: string | Date
  uploader?: { roleName?: string | null } | null
}

type TaskMemo = {
  id: string
  content: string
  createdAt: string | Date
  author?: { roleName?: string | null } | null
  attachments?: FileAttachment[]
}

type ProjectTask = {
  id: string
  title: string
  content?: string | null
  status: string
  startAt?: string | Date | null
  dueDate?: string | Date | null
  reminderDays: number
  note?: string | null
  sectionId?: string | null
  section?: { id: string; title: string; parentId?: string | null } | null
  assigneeId?: string | null
  assignee?: { id?: string; roleName?: string | null } | null
  assignees?: Array<{
    userId: string
    user?: ContactUser | null
  }>
  createdBy?: { roleName?: string | null } | null
  memos?: TaskMemo[]
  attachments?: FileAttachment[]
}

type ProjectSection = {
  id: string
  title: string
  description?: string | null
  parentId?: string | null
  sortOrder?: number
  attachments?: FileAttachment[]
  children?: Array<{
    id: string
    title: string
    description?: string | null
    parentId?: string | null
    sortOrder?: number
    attachments?: FileAttachment[]
  }>
}

type SectionAccessRow = {
  id: string
  userId: string
  sectionId?: string | null
  scopeKey: string
  canAddMemo: boolean
  expiresAt?: string | Date | null
  user?: ContactUser | null
  section?: {
    id: string
    title: string
    parentId?: string | null
    parent?: { id: string; title: string } | null
  } | null
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
  contactUserId?: string | null
  owner?: ContactUser | null
  contactUser?: ContactUser | null
  members: Array<{
    id: string
    userId: string
    role: string
    user?: ContactUser | null
  }>
  tasks: ProjectTask[]
  sections?: ProjectSection[]
  ledger: Array<{
    id: string
    type: string
    amount: number
    date: string | Date
    note?: string | null
    createdById?: string
    createdBy?: { id?: string; roleName?: string | null } | null
    attachments?: FileAttachment[]
  }>
  memos: Array<{
    id: string
    content: string
    createdAt: string | Date
    author?: { roleName?: string | null } | null
  }>
  sectionAccesses?: SectionAccessRow[]
  accessMode?: 'full' | 'temp'
  canManageTempAccess?: boolean
  canManageProject?: boolean
  canViewFullLedger?: boolean
  memberRole?: 'OWNER' | 'MANAGER' | 'MEMBER' | null
  myTaskAccess?: Record<string, { canView: boolean; canAddMemo: boolean }> | null
  completion?: ProjectCompletionStats | null
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
  sectionId: string
  canAddMemo: boolean
}

function dayInput(value?: string | Date | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

/** Local datetime for `<input type="datetime-local">`. Legacy date-only values show 00:00. */
function datetimeInput(value?: string | Date | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** Display due datetime for member lists. */
function datetimeLabel(value?: string | Date | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function taskScheduleLabel(task: { startAt?: string | Date | null; dueDate?: string | Date | null }) {
  const start = datetimeLabel(task.startAt)
  const end = datetimeLabel(task.dueDate)
  if (start && end) return `${start} – ${end}`
  if (end) return end
  if (start) return start
  return ''
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
  currentUserId,
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
  const canViewFullLedger = Boolean(project.canViewFullLedger || isAdmin)
  const isFullMember = !isTemp

  const [tab, setTab] = useState<'tasks' | 'ledger' | 'memo' | 'settings' | 'temp' | 'contacts'>(
    'tasks'
  )

  const [title, setTitle] = useState(project.title)
  const [status, setStatus] = useState(project.status)
  const [startDate, setStartDate] = useState(dayInput(project.startDate))
  const [endDate, setEndDate] = useState(dayInput(project.endDate))
  const [reminderDays, setReminderDays] = useState(String(project.reminderDays || 15))
  const [note, setNote] = useState(project.note || '')
  const [contactUserId, setContactUserId] = useState(project.contactUserId || '')
  const [memberRoles, setMemberRoles] = useState<Record<string, 'MANAGER' | 'MEMBER'>>(() => {
    const map: Record<string, 'MANAGER' | 'MEMBER'> = {}
    for (const m of project.members) {
      if (m.userId === project.ownerId) continue
      map[m.userId] = m.role === 'MANAGER' ? 'MANAGER' : 'MEMBER'
    }
    return map
  })

  const [taskTitle, setTaskTitle] = useState('')
  const [taskContent, setTaskContent] = useState('')
  const [taskStartAt, setTaskStartAt] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [taskSectionId, setTaskSectionId] = useState('')
  const [taskAssigneeIds, setTaskAssigneeIds] = useState<string[]>([])
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [taskMemoDraft, setTaskMemoDraft] = useState('')
  const [taskMemoFiles, setTaskMemoFiles] = useState<ClientAttachment[]>([])
  const [taskContentDrafts, setTaskContentDrafts] = useState<Record<string, string>>({})
  const [taskStartDrafts, setTaskStartDrafts] = useState<Record<string, string>>({})
  const [taskDueDrafts, setTaskDueDrafts] = useState<Record<string, string>>({})
  const [sectionDescDrafts, setSectionDescDrafts] = useState<Record<string, string>>({})
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null)
  const [assigneeOverrides, setAssigneeOverrides] = useState<Record<string, string[]>>({})
  const assigneeOverridesRef = useRef(assigneeOverrides)
  const [rootSectionTitle, setRootSectionTitle] = useState('')
  const [childSectionTitle, setChildSectionTitle] = useState('')
  const [childParentId, setChildParentId] = useState('')
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const [childParentTouched, setChildParentTouched] = useState(false)

  const [ledgerType, setLedgerType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE')
  const [ledgerAmount, setLedgerAmount] = useState('')
  const [ledgerDate, setLedgerDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [ledgerNote, setLedgerNote] = useState('')
  const [ledgerAttachments, setLedgerAttachments] = useState<ClientAttachment[]>([])
  const [ledgerOcrAttachmentIndex, setLedgerOcrAttachmentIndex] = useState(0)
  const [ledgerAttachmentNote, setLedgerAttachmentNote] = useState('')

  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)
  const [pdfLocale, setPdfLocale] = useState<'zh' | 'en'>(locale === 'en' ? 'en' : 'zh')
  const [pdfIncludeAttachments, setPdfIncludeAttachments] = useState(false)
  const [pdfDocumentType, setPdfDocumentType] = useState<
    'project' | 'progress' | 'schedule' | 'sectionList' | 'finance'
  >('schedule')
  const [pdfBusy, setPdfBusy] = useState(false)

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
        grants: TempGrantDraft[]
      }
    >()
    for (const row of project.sectionAccesses || []) {
      const existing = map.get(row.userId) || {
        userId: row.userId,
        roleName: row.user?.roleName || row.userId,
        email: row.user?.email,
        expiresAt: dayInput(row.expiresAt),
        grants: [] as TempGrantDraft[],
      }
      existing.grants.push({
        sectionId: row.sectionId || '',
        canAddMemo: row.canAddMemo,
      })
      if (row.expiresAt) existing.expiresAt = dayInput(row.expiresAt)
      map.set(row.userId, existing)
    }
    return Array.from(map.values())
  }, [project.sectionAccesses])

  const rootSections = useMemo(() => {
    const all = project.sections || []
    return all
      .filter((s) => !s.parentId)
      .map((s) => ({
        ...s,
        children: (s.children && s.children.length > 0
          ? s.children
          : all.filter((c) => c.parentId === s.id)
        ).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
      }))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  }, [project.sections])

  useEffect(() => {
    const rootIds = new Set(rootSections.map((s) => s.id))
    if (childParentId && !rootIds.has(childParentId)) {
      setChildParentId('')
      return
    }
    if (!childParentTouched && !childParentId && rootSections.length === 1) {
      setChildParentId(rootSections[0].id)
    }
  }, [rootSections, childParentId, childParentTouched])

  const sectionOptions = useMemo(() => {
    const opts: Array<{ id: string; label: string }> = [
      { id: '', label: t('projectTaskSectionNone') },
    ]
    for (const root of rootSections) {
      opts.push({ id: root.id, label: root.title })
      for (const child of root.children || []) {
        opts.push({ id: child.id, label: `${root.title} / ${child.title}` })
      }
    }
    return opts
  }, [rootSections, t])

  const tasksBySectionId = useMemo(() => {
    const map = new Map<string, ProjectTask[]>()
    for (const task of project.tasks) {
      const key = task.sectionId || ''
      const list = map.get(key) || []
      list.push(task)
      map.set(key, list)
    }
    return map
  }, [project.tasks])

  const displayRows = useMemo(() => {
    type Row =
      | { kind: 'section'; id: string; title: string; depth: number }
      | { kind: 'task'; task: ProjectTask }
    const build = (hideEmpty: boolean) => {
      const rows: Row[] = []
      for (const root of rootSections) {
        const rootTasks = tasksBySectionId.get(root.id) || []
        const childBlocks = (root.children || []).filter((child) => {
          const childTasks = tasksBySectionId.get(child.id) || []
          return !hideEmpty || childTasks.length > 0
        })
        if (hideEmpty && rootTasks.length === 0 && childBlocks.length === 0) continue

        rows.push({ kind: 'section', id: root.id, title: root.title, depth: 0 })
        for (const task of rootTasks) rows.push({ kind: 'task', task })
        for (const child of childBlocks) {
          const childTasks = tasksBySectionId.get(child.id) || []
          if (hideEmpty && childTasks.length === 0) continue
          rows.push({ kind: 'section', id: child.id, title: child.title, depth: 1 })
          for (const task of childTasks) rows.push({ kind: 'task', task })
        }
      }

      const uncategorized = tasksBySectionId.get('') || []
      if (uncategorized.length > 0) {
        rows.push({
          kind: 'section',
          id: '__uncategorized',
          title: t('projectSectionUncategorized'),
          depth: 0,
        })
        for (const task of uncategorized) rows.push({ kind: 'task', task })
      }
      return rows
    }
    return { guest: build(true), manage: build(false) }
  }, [rootSections, tasksBySectionId, t])

  const taskDisplayRows = isTemp ? displayRows.guest : displayRows.manage

  const [tempUserId, setTempUserId] = useState('')
  const [tempExpiresAt, setTempExpiresAt] = useState('')
  const [tempGrants, setTempGrants] = useState<TempGrantDraft[]>([
    { sectionId: '', canAddMemo: false },
  ])
  const [newTempName, setNewTempName] = useState('')
  const [newTempPhone, setNewTempPhone] = useState('')
  const [newTempPassword, setNewTempPassword] = useState('')
  const [createTempGrants, setCreateTempGrants] = useState<TempGrantDraft[]>([
    { sectionId: '', canAddMemo: false },
  ])
  const [createTempExpiresAt, setCreateTempExpiresAt] = useState('')

  useEffect(() => {
    assigneeOverridesRef.current = assigneeOverrides
  }, [assigneeOverrides])

  useEffect(() => {
    const map: Record<string, 'MANAGER' | 'MEMBER'> = {}
    for (const m of project.members) {
      if (m.userId === project.ownerId) continue
      map[m.userId] = m.role === 'MANAGER' ? 'MANAGER' : 'MEMBER'
    }
    setMemberRoles(map)
  }, [project.members, project.ownerId])

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
        : tab === 'contacts' && isTemp
          ? 'tasks'
        : tab === 'settings' && !canManageProject
          ? canManageTempAccess
            ? 'temp'
            : 'tasks'
          : tab

  const completion = useMemo(
    () => project.completion || computeProjectCompletion(project.tasks || []),
    [project.completion, project.tasks]
  )

  const contactPhoneOf = (u?: ContactUser | null) =>
    u?.profile?.contactPhone || u?.loginPhone || ''
  const contactEmailOf = (u?: ContactUser | null) =>
    u?.profile?.contactEmail || u?.email || ''

  const sectionContactGroups = useMemo(() => {
    const roots = project.sections || []
    const groups: Array<{
      key: string
      title: string
      contacts: ContactUser[]
    }> = []

    const pushUnique = (map: Map<string, ContactUser>, user?: ContactUser | null) => {
      if (!user?.id) return
      if (!map.has(user.id)) map.set(user.id, user)
    }

    for (const root of roots) {
      const map = new Map<string, ContactUser>()
      const childIds = new Set((root.children || []).map((c) => c.id))
      for (const task of project.tasks || []) {
        const inRoot = task.sectionId === root.id
        const inChild = task.sectionId ? childIds.has(task.sectionId) : false
        if (!inRoot && !inChild) continue
        for (const a of task.assignees || []) pushUnique(map, a.user)
      }
      for (const grant of project.sectionAccesses || []) {
        const sid = grant.sectionId || null
        if (sid === root.id || (sid && childIds.has(sid))) {
          pushUnique(map, grant.user)
        }
      }
      groups.push({
        key: root.id,
        title: root.title,
        contacts: Array.from(map.values()),
      })
      for (const child of root.children || []) {
        const childMap = new Map<string, ContactUser>()
        for (const task of project.tasks || []) {
          if (task.sectionId !== child.id) continue
          for (const a of task.assignees || []) pushUnique(childMap, a.user)
        }
        for (const grant of project.sectionAccesses || []) {
          if (grant.sectionId === child.id) pushUnique(childMap, grant.user)
        }
        groups.push({
          key: child.id,
          title: `${root.title} / ${child.title}`,
          contacts: Array.from(childMap.values()),
        })
      }
    }

    const uncat = new Map<string, ContactUser>()
    for (const task of project.tasks || []) {
      if (task.sectionId) continue
      for (const a of task.assignees || []) pushUnique(uncat, a.user)
    }
    for (const grant of project.sectionAccesses || []) {
      if (!grant.sectionId) pushUnique(uncat, grant.user)
    }
    if (uncat.size > 0) {
      groups.push({
        key: '__uncategorized__',
        title: t('uncategorized'),
        contacts: Array.from(uncat.values()),
      })
    }
    return groups
  }, [project.sections, project.tasks, project.sectionAccesses, t])

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
    setTempGrants(
      existing && existing.grants.length > 0
        ? existing.grants.map((g) => ({
            sectionId: g.sectionId,
            canAddMemo: Boolean(g.canAddMemo),
          }))
        : [{ sectionId: '', canAddMemo: false }]
    )
  }

  const sectionGrantLabel = (sectionId: string) => {
    if (!sectionId) return t('projectSectionUncategorized')
    const opt = sectionOptions.find((o) => o.id === sectionId)
    return opt?.label || sectionId
  }

  const normalizeGrantRows = (rows: TempGrantDraft[]) => {
    const byScope = new Map<string, TempGrantDraft>()
    for (const row of rows) {
      byScope.set(row.sectionId || '', {
        sectionId: row.sectionId || '',
        canAddMemo: Boolean(row.canAddMemo),
      })
    }
    return Array.from(byScope.values())
  }

  const findSectionById = (sectionId: string): ProjectSection | null => {
    for (const root of rootSections) {
      if (root.id === sectionId) return root
      for (const child of root.children || []) {
        if (child.id === sectionId) return child
      }
    }
    return null
  }

  const prepareUploadFiles = async (file: File) => {
    try {
      const result = await prepareAttachments(file)
      if (result.truncated) {
        alert(
          t('pdfPagesTruncated')
            .replace('{{total}}', String(result.totalPages))
            .replace('{{max}}', String(MAX_PDF_PAGES))
        )
      }
      return result.attachments
    } catch {
      try {
        return [await compressImage(file, 200)]
      } catch {
        alert(t('submitFailed'))
        return [] as ClientAttachment[]
      }
    }
  }

  const handleLedgerImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const files = await prepareUploadFiles(file)
    if (files.length === 0) return
    setLedgerAttachments(files)
    setLedgerOcrAttachmentIndex(0)
    setLedgerAttachmentNote(files[0]?.note || '')
    event.target.value = ''
  }

  const removeLedgerAttachmentAt = (index: number) => {
    const next = ledgerAttachments.filter((_, i) => i !== index)
    let nextOcr = ledgerOcrAttachmentIndex
    if (index < ledgerOcrAttachmentIndex) nextOcr = ledgerOcrAttachmentIndex - 1
    else if (index === ledgerOcrAttachmentIndex) nextOcr = 0
    nextOcr = Math.min(nextOcr, Math.max(0, next.length - 1))
    setLedgerAttachments(next)
    setLedgerOcrAttachmentIndex(nextOcr)
    setLedgerAttachmentNote(next[nextOcr]?.note || '')
  }

  const appendLedgerOcrText = (payload: OcrResolvedPayload | string) => {
    if (typeof payload === 'string') {
      setLedgerNote((current) => (current.trim() ? `${current.trim()}\n${payload}` : payload))
      return
    }
    if (payload.amount != null) {
      setLedgerAmount(String(Math.abs(payload.amount)))
    }
    if (payload.noteText) {
      setLedgerNote((current) =>
        current.trim() ? `${current.trim()}\n${payload.noteText}` : payload.noteText
      )
    } else if (payload.contentText) {
      setLedgerNote((current) =>
        current.trim() ? `${current.trim()}\n${payload.contentText}` : payload.contentText
      )
    }
    if (payload.attachmentMemo) {
      const ocrIndex = ledgerAttachments[ledgerOcrAttachmentIndex]
        ? ledgerOcrAttachmentIndex
        : 0
      setLedgerAttachmentNote(payload.attachmentMemo)
      setLedgerAttachments((prev) =>
        prev.map((item, index) =>
          index === ocrIndex ? { ...item, note: payload.attachmentMemo } : item
        )
      )
    }
  }

  const resetLedgerForm = () => {
    setLedgerAmount('')
    setLedgerNote('')
    setLedgerAttachments([])
    setLedgerOcrAttachmentIndex(0)
    setLedgerAttachmentNote('')
  }

  const downloadPdfBytes = (filename: string, bytes: Uint8Array) => {
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const runPdfExport = async (
    fn: () => Promise<
      | { success: true; filename: string; bytes: Uint8Array }
      | { success: false; error?: string }
    >
  ) => {
    setPdfBusy(true)
    try {
      const res = await fn()
      if (!res.success) {
        alert(res.error || t('projectPdfExportFailed'))
        return
      }
      downloadPdfBytes(res.filename, res.bytes)
    } catch (e: any) {
      alert(e?.message || t('projectPdfExportFailed'))
    } finally {
      setPdfBusy(false)
    }
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
            ['contacts', t('projectContactsTab')],
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
          <LocaleHelpTip
            locale={locale}
            titleKey="helpProjectDetailTitle"
            bodyKey="helpProjectDetailBody"
          />
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
              {project.contactUser?.roleName
                ? ` · ${t('projectContact')}: ${project.contactUser.roleName}`
                : ''}
              {' '}
              · {t('projectCompletion')}: {completion.percent}% ({completion.done}/
              {completion.total})
            </>
          ) : null}
        </div>
        {isFullMember ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
              <div className="rounded-xl bg-[#EEF2FF] px-2 py-2">
                <div className="text-indigo-700/70">{t('projectCompletion')}</div>
                <div className="font-semibold text-indigo-900">
                  {completion.percent}%
                </div>
                <div className="mt-0.5 text-[10px] text-indigo-700/60">
                  {completion.done}/{completion.total}
                </div>
              </div>
              {canViewFullLedger ? (
                <>
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
                </>
              ) : (
                <div className="col-span-1 rounded-xl bg-[#F2F2F7] px-2 py-2 sm:col-span-3">
                  <div className="text-gray-400">{t('projectLedgerMyScope')}</div>
                  <div className="font-semibold text-gray-800">
                    {formatCurrency(locale, summary.balance)}
                  </div>
                  <div className="mt-0.5 text-[10px] text-gray-400">
                    {t('projectLedgerMemberHint')}
                  </div>
                </div>
              )}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
              {canViewFullLedger ? t('projectLedgerHint') : t('projectLedgerMemberHint')}
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
            <div className="space-y-2 rounded-2xl border border-dashed border-gray-200 bg-[#FAFAFA] p-3">
              <div className="text-xs font-semibold text-gray-600">{t('projectPdfExport')}</div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={pdfDocumentType}
                  onChange={(e) =>
                    setPdfDocumentType(
                      e.target.value as
                        | 'project'
                        | 'progress'
                        | 'schedule'
                        | 'sectionList'
                        | 'finance'
                    )
                  }
                  className="min-w-[10rem] flex-1 rounded-xl bg-white px-3 py-2 text-xs outline-none shadow-sm"
                >
                  <option value="schedule">{t('projectPdfTypeSchedule')}</option>
                  <option value="sectionList">{t('projectPdfTypeSectionList')}</option>
                  <option value="finance">{t('projectPdfTypeFinance')}</option>
                  <option value="progress">{t('projectPdfTypeProgress')}</option>
                  <option value="project">{t('projectPdfTypeProject')}</option>
                </select>
                <select
                  value={pdfLocale}
                  onChange={(e) => setPdfLocale(e.target.value as 'zh' | 'en')}
                  className="rounded-xl bg-white px-3 py-2 text-xs outline-none shadow-sm"
                >
                  <option value="zh">{t('projectPdfLocaleZh')}</option>
                  <option value="en">{t('projectPdfLocaleEn')}</option>
                </select>
              </div>
              {pdfDocumentType === 'project' || pdfDocumentType === 'progress' ? (
                <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={pdfIncludeAttachments}
                    onChange={(e) => setPdfIncludeAttachments(e.target.checked)}
                  />
                  {t('projectPdfIncludeAttachments')}
                </label>
              ) : null}
              <button
                type="button"
                disabled={busy || pdfBusy}
                onClick={() =>
                  runPdfExport(() =>
                    exportProjectPdf(project.id, {
                      locale: pdfLocale,
                      includeAttachments: pdfIncludeAttachments,
                      documentType: pdfDocumentType,
                      progressReport: pdfDocumentType === 'progress',
                    })
                  )
                }
                className="w-full rounded-xl bg-[#007AFF] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {pdfBusy ? t('projectPdfExporting') : t('projectPdfGenerate')}
              </button>
            </div>
          ) : null}
          {isFullMember ? (
            <div className="space-y-3">
              <div className="space-y-2 rounded-2xl bg-[#F8FAFC] p-3">
                <div className="text-xs font-semibold text-gray-600">{t('projectSections')}</div>
                <div className="flex gap-2">
                  <input
                    value={rootSectionTitle}
                    onChange={(e) => setRootSectionTitle(e.target.value)}
                    placeholder={t('projectSectionAddRoot')}
                    className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2 text-sm outline-none shadow-sm"
                  />
                  <button
                    type="button"
                    disabled={busy || !rootSectionTitle.trim()}
                    onClick={async () => {
                      const ok = await run(() =>
                        createProjectSection(project.id, { title: rootSectionTitle })
                      )
                      if (ok) setRootSectionTitle('')
                    }}
                    className="shrink-0 rounded-xl bg-[#007AFF] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {t('projectSectionAddRoot')}
                  </button>
                </div>
                {rootSections.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <select
                        value={childParentId}
                        onChange={(e) => {
                          setChildParentTouched(true)
                          setChildParentId(e.target.value)
                        }}
                        className="rounded-xl bg-white px-3 py-2 text-sm outline-none shadow-sm"
                      >
                        <option value="">{t('projectSectionSelectParent')}</option>
                        {rootSections.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title}
                          </option>
                        ))}
                      </select>
                      <input
                        value={childSectionTitle}
                        onChange={(e) => setChildSectionTitle(e.target.value)}
                        placeholder={t('projectSectionTitlePlaceholder')}
                        className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2 text-sm outline-none shadow-sm"
                      />
                      <button
                        type="button"
                        disabled={busy || !childParentId || !childSectionTitle.trim()}
                        onClick={async () => {
                          const ok = await run(() =>
                            createProjectSection(project.id, {
                              title: childSectionTitle,
                              parentId: childParentId,
                            })
                          )
                          if (ok) {
                            setChildSectionTitle('')
                          }
                        }}
                        className="shrink-0 rounded-xl bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {t('projectSectionAddChild')}
                      </button>
                    </div>
                    {!childParentId && childSectionTitle.trim() ? (
                      <div className="text-[11px] text-amber-600">
                        {t('projectSectionChildHint')}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
              <input
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder={t('projectTaskTitlePlaceholder')}
                className="w-full rounded-xl bg-[#F2F2F7] px-4 py-3 text-sm outline-none"
              />
              <textarea
                value={taskContent}
                onChange={(e) => setTaskContent(e.target.value)}
                placeholder={t('projectTaskContentPlaceholder')}
                rows={3}
                className="w-full rounded-xl bg-[#F2F2F7] px-4 py-3 text-sm outline-none"
              />
              <div>
                <div className="mb-1 text-xs font-medium text-gray-500">{t('projectTaskStartAt')}</div>
                <input
                  type="datetime-local"
                  value={taskStartAt}
                  onChange={(e) => setTaskStartAt(e.target.value)}
                  className="w-full rounded-xl bg-[#F2F2F7] px-4 py-3 text-sm outline-none"
                />
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-gray-500">{t('projectTaskDueAt')}</div>
                <input
                  type="datetime-local"
                  value={taskDue}
                  onChange={(e) => setTaskDue(e.target.value)}
                  className="w-full rounded-xl bg-[#F2F2F7] px-4 py-3 text-sm outline-none"
                />
                <div className="mt-1 text-[11px] text-gray-400">{t('projectTaskTimeOptional')}</div>
              </div>
              <select
                value={taskSectionId}
                onChange={(e) => setTaskSectionId(e.target.value)}
                className="w-full rounded-xl bg-[#F2F2F7] px-4 py-3 text-sm outline-none"
              >
                {sectionOptions.map((opt) => (
                  <option key={opt.id || 'none'} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
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
                      content: taskContent || null,
                      startAt: taskStartAt || null,
                      dueDate: taskDue || null,
                      sectionId: taskSectionId || null,
                      assigneeIds: taskAssigneeIds,
                    })
                  )
                  if (ok) {
                    setTaskTitle('')
                    setTaskContent('')
                    setTaskStartAt('')
                    setTaskDue('')
                    setTaskAssigneeIds([])
                  }
                }}
                className="w-full rounded-xl bg-[#007AFF] py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {t('addProjectTask')}
              </button>
              </div>
            </div>
          ) : null}

          <div className="divide-y divide-gray-100">
            {taskDisplayRows.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-400">{t('projectTaskEmpty')}</div>
            ) : (
              taskDisplayRows.map((row) => {
                if (row.kind === 'section') {
                  if (row.depth > 0) {
                    const parent = rootSections.find((r) =>
                      (r.children || []).some((c) => c.id === row.id)
                    )
                    if (parent && collapsedSections[parent.id]) return null
                  }
                  const collapsed = collapsedSections[row.id]
                  const rootMatch = rootSections.find((s) => s.id === row.id)
                  const sectionEntity =
                    row.id === '__uncategorized' ? null : findSectionById(row.id)
                  const sectionExpanded = expandedSectionId === row.id
                  const canDelete =
                    isFullMember &&
                    row.id !== '__uncategorized' &&
                    !(rootMatch && (rootMatch.children || []).length > 0)
                  const sectionDesc =
                    sectionDescDrafts[row.id] ?? sectionEntity?.description ?? ''
                  return (
                    <div
                      key={`sec-${row.id}`}
                      className={`space-y-2 py-3 ${row.depth > 0 ? 'pl-4' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          onClick={() =>
                            setCollapsedSections((prev) => ({
                              ...prev,
                              [row.id]: !prev[row.id],
                            }))
                          }
                        >
                          <span className="text-xs text-gray-400">{collapsed ? '›' : '▾'}</span>
                          <span
                            className={`truncate font-semibold ${
                              row.depth > 0 ? 'text-sm text-gray-700' : 'text-sm text-gray-900'
                            }`}
                          >
                            {row.title}
                          </span>
                          {sectionEntity?.attachments && sectionEntity.attachments.length > 0 ? (
                            <span className="text-[11px] font-normal text-gray-400">
                              · {sectionEntity.attachments.length}
                            </span>
                          ) : null}
                        </button>
                        <div className="flex shrink-0 gap-1">
                          {isFullMember && sectionEntity ? (
                            <>
                              <button
                                type="button"
                                disabled={busy || pdfBusy}
                                onClick={() => {
                                  setExpandedSectionId(sectionExpanded ? null : row.id)
                                  setSectionDescDrafts((prev) => ({
                                    ...prev,
                                    [row.id]: sectionEntity.description || '',
                                  }))
                                }}
                                className="rounded-lg bg-[#F2F2F7] px-2 py-1 text-[11px] font-semibold text-gray-700"
                              >
                                {t('projectSectionDescription')}
                              </button>
                              <button
                                type="button"
                                disabled={busy || pdfBusy}
                                onClick={() =>
                                  runPdfExport(() =>
                                    exportProjectSectionPdf(row.id, {
                                      locale: pdfLocale,
                                      includeAttachments: pdfIncludeAttachments,
                                      documentType:
                                        pdfDocumentType === 'schedule' ||
                                        pdfDocumentType === 'sectionList'
                                          ? pdfDocumentType
                                          : undefined,
                                    })
                                  )
                                }
                                className="rounded-lg bg-[#EEF2FF] px-2 py-1 text-[11px] font-semibold text-[#4338CA]"
                              >
                                PDF
                              </button>
                            </>
                          ) : null}
                          {canDelete ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                if (!confirm(t('confirmDeleteItem'))) return
                                run(() => deleteProjectSection(row.id))
                              }}
                              className="rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-600"
                            >
                              {t('delete')}
                            </button>
                          ) : null}
                        </div>
                      </div>
                      {sectionExpanded && sectionEntity ? (
                        <div className="space-y-2 rounded-2xl bg-[#F8FAFC] p-3">
                          <textarea
                            value={sectionDesc}
                            onChange={(e) =>
                              setSectionDescDrafts((prev) => ({
                                ...prev,
                                [row.id]: e.target.value,
                              }))
                            }
                            rows={2}
                            placeholder={t('projectSectionDescriptionPlaceholder')}
                            className="w-full rounded-xl bg-white px-3 py-2 text-sm outline-none shadow-sm"
                          />
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              run(() =>
                                updateProjectSection(row.id, {
                                  description: sectionDesc,
                                })
                              )
                            }
                            className="rounded-xl bg-[#007AFF] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {t('saveProjectSectionDescription')}
                          </button>
                          <div className="text-xs font-medium text-gray-500">
                            {t('projectSectionAttachments')}
                          </div>
                          {(sectionEntity.attachments || []).length === 0 ? (
                            <div className="text-xs text-gray-400">{t('projectTaskEmpty')}</div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {(sectionEntity.attachments || []).map((att, idx) => (
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
                          )}
                          <label className="inline-flex cursor-pointer items-center rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-[#007AFF] shadow-sm">
                            {t('addAttachment')}
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0]
                                if (!file) return
                                const files = await prepareUploadFiles(file)
                                e.target.value = ''
                                for (const item of files) {
                                  await run(() =>
                                    addProjectSectionAttachment(row.id, {
                                      url: item.url,
                                      size: item.size,
                                      note: item.note,
                                    })
                                  )
                                }
                              }}
                            />
                          </label>
                        </div>
                      ) : sectionEntity?.description ? (
                        <div className="text-xs text-gray-500 line-clamp-2">
                          {sectionEntity.description}
                        </div>
                      ) : null}
                    </div>
                  )
                }

                const task = row.task
                const parentSectionKey = task.sectionId || '__uncategorized'
                if (collapsedSections[parentSectionKey]) return null
                // Also collapse if parent root is collapsed for child sections
                const sectionMeta = task.sectionId
                  ? rootSections
                      .flatMap((r) => [
                        { id: r.id, parentId: null as string | null },
                        ...(r.children || []).map((c) => ({
                          id: c.id,
                          parentId: r.id as string | null,
                        })),
                      ])
                      .find((s) => s.id === task.sectionId)
                  : null
                if (sectionMeta?.parentId && collapsedSections[sectionMeta.parentId]) {
                  return null
                }

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
                          setTaskContentDrafts((prev) => ({
                            ...prev,
                            [task.id]: task.content || '',
                          }))
                          setTaskStartDrafts((prev) => ({
                            ...prev,
                            [task.id]: datetimeInput(task.startAt),
                          }))
                          setTaskDueDrafts((prev) => ({
                            ...prev,
                            [task.id]: datetimeInput(task.dueDate),
                          }))
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
                            {task.content ? (
                              <div className="mt-0.5 line-clamp-2 text-xs text-gray-600">
                                {task.content}
                              </div>
                            ) : null}
                            <div className="mt-1 text-xs text-gray-500">
                              {taskStatusLabel(task.status)} · {taskCompletionPercent(task.status)}%
                              {taskScheduleLabel(task) ? ` · ${taskScheduleLabel(task)}` : ''}
                              {names ? ` · ${names}` : ''}
                              {task.attachments && task.attachments.length > 0
                                ? ` · ${t('attachment')} ${task.attachments.length}`
                                : ''}
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
                                    startAt: datetimeInput(task.startAt) || null,
                                    dueDate: datetimeInput(task.dueDate) || null,
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
                            disabled={busy || pdfBusy}
                            onClick={() =>
                              runPdfExport(() =>
                                exportProjectTaskPdf(task.id, {
                                  locale: pdfLocale,
                                  includeAttachments: pdfIncludeAttachments,
                                })
                              )
                            }
                            className="rounded-lg bg-[#EEF2FF] px-2 py-1 text-[11px] font-semibold text-[#4338CA]"
                          >
                            PDF
                          </button>
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
                                          startAt: datetimeInput(task.startAt) || null,
                                          dueDate: datetimeInput(task.dueDate) || null,
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

                        {isFullMember ? (
                          <div>
                            <div className="mb-2 text-xs font-medium text-gray-500">
                              {t('projectTaskSection')}
                            </div>
                            <select
                              value={task.sectionId || ''}
                              disabled={busy}
                              onChange={(e) => {
                                const nextSectionId = e.target.value || null
                                run(() =>
                                  updateProjectTask(task.id, {
                                    title: task.title,
                                    status: task.status as any,
                                    startAt: datetimeInput(task.startAt) || null,
                                    dueDate: datetimeInput(task.dueDate) || null,
                                    reminderDays: task.reminderDays,
                                    note: task.note || undefined,
                                    sectionId: nextSectionId,
                                    assigneeIds: getTaskAssigneeIds(task),
                                  })
                                )
                              }}
                              className="w-full rounded-xl bg-white px-3 py-2 text-sm outline-none shadow-sm"
                            >
                              {sectionOptions.map((opt) => (
                                <option key={opt.id || 'none'} value={opt.id}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : null}

                        <div>
                          <div className="mb-2 text-xs font-medium text-gray-500">
                            {t('projectTaskContent')}
                          </div>
                          {isFullMember ? (
                            <>
                              <textarea
                                value={taskContentDrafts[task.id] ?? task.content ?? ''}
                                onChange={(e) =>
                                  setTaskContentDrafts((prev) => ({
                                    ...prev,
                                    [task.id]: e.target.value,
                                  }))
                                }
                                rows={3}
                                placeholder={t('projectTaskContentPlaceholder')}
                                className="w-full rounded-xl bg-white px-3 py-2 text-sm outline-none shadow-sm"
                              />
                              <div className="mt-2 space-y-2">
                                <div>
                                  <div className="mb-1 text-xs font-medium text-gray-500">
                                    {t('projectTaskStartAt')}
                                  </div>
                                  <input
                                    type="datetime-local"
                                    value={
                                      taskStartDrafts[task.id] ?? datetimeInput(task.startAt)
                                    }
                                    disabled={busy}
                                    onChange={(e) =>
                                      setTaskStartDrafts((prev) => ({
                                        ...prev,
                                        [task.id]: e.target.value,
                                      }))
                                    }
                                    className="w-full rounded-xl bg-white px-3 py-2 text-sm outline-none shadow-sm"
                                  />
                                </div>
                                <div>
                                  <div className="mb-1 text-xs font-medium text-gray-500">
                                    {t('projectTaskDueAt')}
                                  </div>
                                  <input
                                    type="datetime-local"
                                    value={taskDueDrafts[task.id] ?? datetimeInput(task.dueDate)}
                                    disabled={busy}
                                    onChange={(e) =>
                                      setTaskDueDrafts((prev) => ({
                                        ...prev,
                                        [task.id]: e.target.value,
                                      }))
                                    }
                                    className="w-full rounded-xl bg-white px-3 py-2 text-sm outline-none shadow-sm"
                                  />
                                  <div className="mt-1 text-[11px] text-gray-400">
                                    {t('projectTaskTimeOptional')}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    run(() =>
                                      updateProjectTask(task.id, {
                                        title: task.title,
                                        status: task.status as any,
                                        startAt:
                                          (taskStartDrafts[task.id] ??
                                            datetimeInput(task.startAt)) ||
                                          null,
                                        dueDate:
                                          (taskDueDrafts[task.id] ??
                                            datetimeInput(task.dueDate)) ||
                                          null,
                                        reminderDays: task.reminderDays,
                                        content:
                                          taskContentDrafts[task.id] ?? task.content ?? null,
                                        assigneeIds: getTaskAssigneeIds(task),
                                      })
                                    )
                                  }
                                  className="w-full rounded-xl bg-[#007AFF] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 sm:w-auto"
                                >
                                  {t('saveProjectTaskContent')}
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="whitespace-pre-wrap rounded-xl bg-white px-3 py-2 text-sm text-gray-800 shadow-sm">
                              {task.content || '—'}
                              {taskScheduleLabel(task) ? (
                                <div className="mt-2 text-xs text-gray-500">
                                  {taskScheduleLabel(task)}
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="text-xs font-medium text-gray-500">
                            {t('projectTaskAttachments')}
                          </div>
                          {(task.attachments || []).length === 0 ? (
                            <div className="text-xs text-gray-400">{t('projectTaskEmpty')}</div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {(task.attachments || []).map((att, idx) => (
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
                          )}
                          {isFullMember ? (
                            <label className="inline-flex cursor-pointer items-center rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-[#007AFF] shadow-sm">
                              {t('addAttachment')}
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0]
                                  if (!file) return
                                  const files = await prepareUploadFiles(file)
                                  e.target.value = ''
                                  for (const item of files) {
                                    await run(() =>
                                      addProjectTaskAttachment(task.id, {
                                        url: item.url,
                                        size: item.size,
                                        note: item.note,
                                      })
                                    )
                                  }
                                }}
                              />
                            </label>
                          ) : null}
                        </div>

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
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-800">{t('projectLedger')}</h2>
            <LocaleHelpTip
              locale={locale}
              titleKey="helpProjectLedgerTitle"
              bodyKey="helpProjectLedgerBody"
            />
          </div>
          {!canViewFullLedger ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
              {t('projectLedgerMemberHint')}
            </p>
          ) : null}
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
          <div className="space-y-3 rounded-2xl border border-dashed border-gray-300 bg-[#F8FAFC] p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                {t('attachment')}{' '}
                <span className="normal-case font-normal">({t('attachmentAcceptHint')})</span>
              </label>
              <OcrNoteButton
                locale={locale}
                attachments={ledgerAttachments}
                context="project-ledger"
                onResolved={appendLedgerOcrText}
                disabled={busy}
              />
            </div>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={handleLedgerImageChange}
              className="w-full text-sm text-gray-600 file:mr-4 file:rounded-xl file:border-0 file:bg-[#007AFF]/10 file:px-5 file:py-2.5 file:text-sm file:font-semibold file:text-[#007AFF]"
            />
            <input
              value={ledgerAttachmentNote}
              onChange={(e) => {
                const value = e.target.value
                setLedgerAttachmentNote(value)
                setLedgerAttachments((prev) =>
                  prev.map((item, index) =>
                    index ===
                    (ledgerAttachments[ledgerOcrAttachmentIndex]
                      ? ledgerOcrAttachmentIndex
                      : 0)
                      ? { ...item, note: value }
                      : item
                  )
                )
              }}
              placeholder={t('attachmentTypePlaceholder')}
              className="w-full rounded-xl bg-white px-4 py-3 text-sm outline-none shadow-sm"
            />
            {ledgerAttachments.length > 0 ? (
              <div className="space-y-2">
                {ledgerAttachments.length > 1 ? (
                  <div className="text-xs font-medium text-[#007AFF]">
                    {t('pdfPagesReady').replace('{{count}}', String(ledgerAttachments.length))}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {ledgerAttachments.map((item, index) => (
                    <div
                      key={`${item.size}-${index}-${item.pageIndex || 0}`}
                      className={`relative rounded-lg border p-1 ${
                        index === ledgerOcrAttachmentIndex
                          ? 'border-[#007AFF] ring-2 ring-[#007AFF]/20'
                          : 'border-gray-200'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setLedgerOcrAttachmentIndex(index)
                          setLedgerAttachmentNote(item.note || '')
                        }}
                        className="block"
                      >
                        <img src={item.url} alt="" className="h-16 w-16 rounded object-cover" />
                        {(item.pageIndex || ledgerAttachments.length > 1) && (
                          <div className="mt-0.5 text-center text-[10px] text-gray-500">
                            {item.pageIndex ?? index + 1}
                          </div>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeLedgerAttachmentAt(index)}
                        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-[10px] leading-none text-white"
                        aria-label={t('delete')}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
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
                  attachments:
                    ledgerAttachments.length > 0
                      ? ledgerAttachments.map((a) => ({
                          url: a.url,
                          size: a.size,
                          note: a.note || ledgerAttachmentNote || undefined,
                        }))
                      : undefined,
                })
              )
              if (ok) resetLedgerForm()
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
              project.ledger.map((entry) => {
                const canDelete =
                  canViewFullLedger || entry.createdById === currentUserId
                return (
                  <div key={entry.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        {entry.type === 'INCOME' ? t('income') : t('expense')}{' '}
                        {formatCurrency(locale, entry.amount)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {dayInput(entry.date)}
                        {entry.note ? ` · ${entry.note}` : ''}
                        {canViewFullLedger && entry.createdBy?.roleName
                          ? ` · ${entry.createdBy.roleName}`
                          : ''}
                      </div>
                      {(entry.attachments || []).length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(entry.attachments || []).map((att, idx) => (
                            <button
                              key={att.id}
                              type="button"
                              onClick={() => openAttachment(att.fileUrl)}
                              className="rounded-lg border border-gray-200 bg-white p-1 shadow-sm"
                              title={att.note || t('attachment')}
                            >
                              <img
                                src={att.fileUrl}
                                alt={att.note || `${t('attachment')} ${idx + 1}`}
                                className="h-14 w-14 rounded object-cover"
                              />
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {canDelete ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (confirm(t('confirmDeleteItem'))) {
                            run(() => deleteProjectLedgerEntry(entry.id))
                          }
                        }}
                        className="shrink-0 rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-600"
                      >
                        {t('delete')}
                      </button>
                    ) : null}
                  </div>
                )
              })
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
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-800">{t('projectTempAccess')}</h2>
            <LocaleHelpTip
              locale={locale}
              titleKey="helpProjectTempTitle"
              bodyKey="helpProjectTempBody"
            />
          </div>
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
                {t('projectTempAccessSections')}
              </div>
              <div className="space-y-2">
                {createTempGrants.map((grant, index) => (
                  <div
                    key={`create-grant-${index}`}
                    className="flex flex-wrap items-center gap-2 rounded-2xl bg-white px-3 py-3 text-sm shadow-sm"
                  >
                    <select
                      value={grant.sectionId}
                      onChange={(e) => {
                        const sectionId = e.target.value
                        setCreateTempGrants((prev) =>
                          prev.map((row, i) =>
                            i === index ? { ...row, sectionId } : row
                          )
                        )
                      }}
                      className="min-w-[12rem] flex-1 rounded-xl bg-[#F2F2F7] px-3 py-2 text-sm outline-none"
                    >
                      {sectionOptions.map((opt) => (
                        <option key={opt.id || '__uncategorized'} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={grant.canAddMemo}
                        onChange={(e) => {
                          const canAddMemo = e.target.checked
                          setCreateTempGrants((prev) =>
                            prev.map((row, i) =>
                              i === index ? { ...row, canAddMemo } : row
                            )
                          )
                        }}
                      />
                      {t('projectTempAccessCanAddMemo')}
                    </label>
                    {createTempGrants.length > 1 ? (
                      <button
                        type="button"
                        className="rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-600"
                        onClick={() =>
                          setCreateTempGrants((prev) =>
                            prev.filter((_, i) => i !== index)
                          )
                        }
                      >
                        {t('projectTempAccessRemoveScope')}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-[#007AFF]"
                onClick={() =>
                  setCreateTempGrants((prev) => [
                    ...prev,
                    { sectionId: '', canAddMemo: false },
                  ])
                }
              >
                {t('projectTempAccessAddScope')}
              </button>
              <p className="mt-2 text-[11px] text-gray-400">
                {t('projectTempAccessSectionHint')}
              </p>
            </div>
            <button
              type="button"
              disabled={busy || !newTempName.trim() || !newTempPassword}
              onClick={async () => {
                const grants = normalizeGrantRows(createTempGrants)
                const ok = await run(() =>
                  createProjectTempAccount(project.id, {
                    roleName: newTempName,
                    phone: newTempPhone || null,
                    password: newTempPassword,
                    expiresAt: createTempExpiresAt || null,
                    grants: grants.map((g) => ({
                      sectionId: g.sectionId || null,
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
                  setCreateTempGrants([{ sectionId: '', canAddMemo: false }])
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
                  {t('projectTempAccessSections')}
                </div>
                <div className="space-y-2">
                  {tempGrants.map((grant, index) => (
                    <div
                      key={`edit-grant-${index}`}
                      className="flex flex-wrap items-center gap-2 rounded-2xl bg-[#F8FAFC] px-3 py-3 text-sm"
                    >
                      <select
                        value={grant.sectionId}
                        onChange={(e) => {
                          const sectionId = e.target.value
                          setTempGrants((prev) =>
                            prev.map((row, i) =>
                              i === index ? { ...row, sectionId } : row
                            )
                          )
                        }}
                        className="min-w-[12rem] flex-1 rounded-xl bg-white px-3 py-2 text-sm outline-none shadow-sm"
                      >
                        {sectionOptions.map((opt) => (
                          <option key={opt.id || '__uncategorized'} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={grant.canAddMemo}
                          onChange={(e) => {
                            const canAddMemo = e.target.checked
                            setTempGrants((prev) =>
                              prev.map((row, i) =>
                                i === index ? { ...row, canAddMemo } : row
                              )
                            )
                          }}
                        />
                        {t('projectTempAccessCanAddMemo')}
                      </label>
                      {tempGrants.length > 1 ? (
                        <button
                          type="button"
                          className="rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-600"
                          onClick={() =>
                            setTempGrants((prev) => prev.filter((_, i) => i !== index))
                          }
                        >
                          {t('projectTempAccessRemoveScope')}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-[#007AFF]"
                  onClick={() =>
                    setTempGrants((prev) => [
                      ...prev,
                      { sectionId: '', canAddMemo: false },
                    ])
                  }
                >
                  {t('projectTempAccessAddScope')}
                </button>
                <p className="mt-2 text-[11px] text-gray-400">
                  {t('projectTempAccessSectionHint')}
                </p>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    setUserProjectSectionAccess(
                      project.id,
                      tempUserId,
                      normalizeGrantRows(tempGrants).map((g) => ({
                        sectionId: g.sectionId || null,
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
                          {row.grants
                            .map((g) => {
                              const label = sectionGrantLabel(g.sectionId)
                              return `${label} (${g.canAddMemo ? t('projectTempAccessCanAddMemo') : t('projectTempAccessReadOnly')})`
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

      {activeTab === 'contacts' && isFullMember ? (
        <div className="space-y-4 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{t('projectContact')}</h2>
            <p className="mt-1 text-xs text-gray-500">{t('projectContactHint')}</p>
            {(() => {
              const contact = project.contactUser || project.owner
              if (!contact) {
                return <div className="mt-3 text-sm text-gray-400">{t('projectContactNone')}</div>
              }
              return (
                <div className="mt-3 rounded-2xl bg-[#F2F2F7] p-4 text-sm">
                  <div className="font-semibold text-gray-900">
                    {contact.roleName || '—'}
                    {contact.accountKind === 'PROJECT_TEMP' ? (
                      <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        {t('projectTempAccessBadge')}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-gray-600">
                    <div>
                      {t('projectContactPhone')}: {contactPhoneOf(contact) || '—'}
                    </div>
                    <div>
                      {t('projectContactEmail')}: {contactEmailOf(contact) || '—'}
                    </div>
                    {contact.profile?.jobTitle ? (
                      <div>
                        {t('projectContactJobTitle')}: {contact.profile.jobTitle}
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })()}
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-900">{t('projectOwner')}</h2>
            <div className="mt-2 rounded-2xl border border-gray-100 p-4 text-sm">
              <div className="font-semibold text-gray-900">{project.owner?.roleName || '—'}</div>
              <div className="mt-2 space-y-1 text-xs text-gray-600">
                <div>
                  {t('projectContactPhone')}: {contactPhoneOf(project.owner) || '—'}
                </div>
                <div>
                  {t('projectContactEmail')}: {contactEmailOf(project.owner) || '—'}
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-900">{t('projectSectionContacts')}</h2>
            <p className="mt-1 text-xs text-gray-500">{t('projectSectionContactsHint')}</p>
            <div className="mt-3 space-y-3">
              {sectionContactGroups.length === 0 ? (
                <div className="text-sm text-gray-400">{t('projectNoSectionContacts')}</div>
              ) : (
                sectionContactGroups.map((group) => (
                  <div key={group.key} className="rounded-2xl border border-gray-100 p-3">
                    <div className="text-xs font-semibold text-gray-700">{group.title}</div>
                    {group.contacts.length === 0 ? (
                      <div className="mt-2 text-xs text-gray-400">—</div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {group.contacts.map((c) => (
                          <div
                            key={c.id}
                            className="flex flex-col gap-0.5 rounded-xl bg-[#FAFAFA] px-3 py-2 text-xs text-gray-700 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="font-medium text-gray-900">
                              {c.roleName || '—'}
                              {c.accountKind === 'PROJECT_TEMP' ? (
                                <span className="ml-2 text-[10px] text-amber-700">
                                  {t('projectTempAccessBadge')}
                                </span>
                              ) : null}
                            </div>
                            <div className="text-gray-500">
                              {[contactPhoneOf(c), contactEmailOf(c)].filter(Boolean).join(' · ') ||
                                '—'}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
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
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              {t('projectStartDate')}
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl bg-[#F2F2F7] px-4 py-3 text-sm outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              {t('projectEndDate')}
            </span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-xl bg-[#F2F2F7] px-4 py-3 text-sm outline-none"
            />
          </label>
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
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">{t('projectContact')}</span>
            <select
              value={contactUserId}
              onChange={(e) => setContactUserId(e.target.value)}
              className="w-full rounded-xl bg-[#F2F2F7] px-4 py-3 text-sm outline-none"
            >
              <option value="">{t('projectContactNone')}</option>
              {memberCandidates.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.roleName}
                </option>
              ))}
              {project.members
                .filter((m) => !memberCandidates.some((c) => c.id === m.userId))
                .map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.user?.roleName || m.userId}
                  </option>
                ))}
            </select>
          </label>
          <div>
            <FieldHelpLabel
              locale={locale}
              label={t('projectMembers')}
              titleKey="helpProjectMembersTitle"
              bodyKey="helpProjectMembersBody"
              className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-500"
            />
            <p className="mb-2 text-[11px] leading-relaxed text-gray-400">
              {t('projectMemberRoleHint')}
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 rounded-xl bg-[#F2F2F7] px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-900">
                    {project.owner?.roleName || project.ownerId}
                  </div>
                  <div className="text-[11px] text-gray-500">{t('projectRoleOwner')}</div>
                </div>
                <span className="shrink-0 rounded-lg bg-indigo-100 px-2 py-1 text-[11px] font-semibold text-indigo-700">
                  {t('projectRoleOwner')}
                </span>
              </div>
              {(() => {
                const byId = new Map<string, { id: string; roleName: string }>()
                for (const u of memberCandidates) {
                  byId.set(u.id, { id: u.id, roleName: u.roleName })
                }
                for (const m of project.members) {
                  if (m.userId === project.ownerId) continue
                  if (!byId.has(m.userId)) {
                    byId.set(m.userId, {
                      id: m.userId,
                      roleName: m.user?.roleName || m.userId,
                    })
                  }
                }
                return Array.from(byId.values()).map((u) => {
                  const selected = memberRoles[u.id]
                  const isSelected = Boolean(selected)
                  return (
                    <div
                      key={u.id}
                      className={`rounded-xl px-3 py-2 ${
                        isSelected ? 'bg-[#EEF5FF]' : 'bg-[#F2F2F7]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setMemberRoles((prev) => {
                              if (prev[u.id]) {
                                const next = { ...prev }
                                delete next[u.id]
                                return next
                              }
                              return { ...prev, [u.id]: 'MEMBER' }
                            })
                          }
                          className="min-w-0 text-left"
                        >
                          <div className="truncate text-sm font-medium text-gray-900">
                            {u.roleName}
                          </div>
                          <div className="text-[11px] text-gray-500">
                            {isSelected
                              ? selected === 'MANAGER'
                                ? t('projectRoleManager')
                                : t('projectRoleMember')
                              : t('projectMemberNotSelected')}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setMemberRoles((prev) => {
                              if (prev[u.id]) {
                                const next = { ...prev }
                                delete next[u.id]
                                return next
                              }
                              return { ...prev, [u.id]: 'MEMBER' }
                            })
                          }
                          className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                            isSelected
                              ? 'bg-[#007AFF] text-white'
                              : 'bg-white text-gray-600'
                          }`}
                        >
                          {isSelected ? t('projectMemberSelected') : t('projectMemberAdd')}
                        </button>
                      </div>
                      {isSelected ? (
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setMemberRoles((prev) => ({ ...prev, [u.id]: 'MEMBER' }))
                            }
                            className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold ${
                              selected === 'MEMBER'
                                ? 'bg-white text-[#007AFF] shadow-sm'
                                : 'bg-white/60 text-gray-500'
                            }`}
                          >
                            {t('projectRoleMember')}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setMemberRoles((prev) => ({ ...prev, [u.id]: 'MANAGER' }))
                            }
                            className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold ${
                              selected === 'MANAGER'
                                ? 'bg-white text-[#007AFF] shadow-sm'
                                : 'bg-white/60 text-gray-500'
                            }`}
                          >
                            {t('projectRoleManager')}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )
                })
              })()}
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
                  startDate: startDate || null,
                  endDate: endDate || null,
                  reminderDays: Number(reminderDays) || 15,
                  note,
                  contactUserId: contactUserId || null,
                })
                if (!a.success) return a
                return setProjectMembers(
                  project.id,
                  Object.entries(memberRoles).map(([userId, role]) => ({ userId, role }))
                )
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
