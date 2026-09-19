import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { loadChineseFonts } from '@/lib/fonts/loadChineseFont'
import { drawBrandHeader } from '@/lib/projects/pdfBrand'

export type ProjectPdfLocale = 'zh' | 'en'

export type ProjectPdfAttachment = {
  note?: string | null
  fileUrl: string
  size?: number
}

export type ProjectPdfMemo = {
  author: string
  content: string
  createdAt: Date | string
}

export type ProjectPdfTask = {
  title: string
  content?: string | null
  status: string
  /** 0–100 display completion for this task */
  completionPercent?: number
  startAt?: Date | string | null
  dueDate?: Date | string | null
  assignees?: string[]
  assigneeDetails?: Array<{
    name: string
    isTemp?: boolean
    phone?: string | null
    email?: string | null
  }>
  sectionPath?: string
  attachments?: ProjectPdfAttachment[]
  memos?: ProjectPdfMemo[]
}

export type ProjectPdfSectionNode = {
  title: string
  description?: string | null
  depth: number
  attachments?: ProjectPdfAttachment[]
  tasks: ProjectPdfTask[]
  children?: ProjectPdfSectionNode[]
}

export type ProjectPdfLedgerEntry = {
  type: 'INCOME' | 'EXPENSE' | string
  amount: number
  date: Date | string
  note?: string | null
  createdBy?: string | null
}

export type ProjectPdfMode =
  | 'task'
  | 'section'
  | 'project'
  | 'progress'
  | 'schedule'
  | 'sectionList'
  | 'finance'

export type GenerateProjectPdfInput = {
  projectTitle: string
  projectStatus: string
  projectNote?: string | null
  ownerName?: string | null
  contactName?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  startDate?: Date | string | null
  endDate?: Date | string | null
  completion?: {
    total: number
    done: number
    doing: number
    todo: number
    percent: number
    isComplete: boolean
  } | null
  mode: ProjectPdfMode
  task?: ProjectPdfTask | null
  sections?: ProjectPdfSectionNode[]
  ledger?: ProjectPdfLedgerEntry[]
  includeAttachments: boolean
  locale: ProjectPdfLocale
}

type Labels = {
  reportTitleTask: string
  reportTitleSection: string
  reportTitleProject: string
  reportTitleProgress: string
  reportTitleSchedule: string
  reportTitleSectionList: string
  reportTitleFinance: string
  project: string
  status: string
  owner: string
  contact: string
  phone: string
  email: string
  startDate: string
  endDate: string
  completion: string
  completionDetail: string
  taskCompletion: string
  generatedAt: string
  note: string
  section: string
  description: string
  task: string
  content: string
  schedule: string
  assignees: string
  attachments: string
  memos: string
  noContent: string
  embedded: string
  listedOnly: string
  uncategorized: string
  statusTodo: string
  statusDoing: string
  statusDone: string
  tempMember: string
  colStart: string
  colEnd: string
  colSection: string
  colTask: string
  colStatus: string
  colAssignees: string
  colContent: string
  noSchedule: string
  income: string
  expense: string
  balance: string
  colDate: string
  colType: string
  colAmount: string
  colBy: string
  emptyLedger: string
  emptyTasks: string
}

function labelsFor(locale: ProjectPdfLocale): Labels {
  if (locale === 'en') {
    return {
      reportTitleTask: 'Task report',
      reportTitleSection: 'Section report',
      reportTitleProject: 'Project report',
      reportTitleProgress: 'Project progress report',
      reportTitleSchedule: 'Work schedule',
      reportTitleSectionList: 'Section task list',
      reportTitleFinance: 'Project finance summary',
      project: 'Project',
      status: 'Status',
      owner: 'Owner',
      contact: 'Project contact',
      phone: 'Phone',
      email: 'Email',
      startDate: 'Start date',
      endDate: 'End date',
      completion: 'Completion',
      completionDetail: 'Done / Doing / To do',
      taskCompletion: 'Task completion',
      generatedAt: 'Generated',
      note: 'Note',
      section: 'Section',
      description: 'Description',
      task: 'Task',
      content: 'Content',
      schedule: 'Schedule',
      assignees: 'Assignees',
      attachments: 'Attachments',
      memos: 'Notes',
      noContent: '—',
      embedded: 'embedded',
      listedOnly: 'listed',
      uncategorized: 'Uncategorized',
      statusTodo: 'To do',
      statusDoing: 'Doing',
      statusDone: 'Done',
      tempMember: 'temp',
      colStart: 'Start',
      colEnd: 'End',
      colSection: 'Section',
      colTask: 'Task',
      colStatus: 'Status',
      colAssignees: 'Assignees',
      colContent: 'Content',
      noSchedule: 'No start time',
      income: 'Income',
      expense: 'Expense',
      balance: 'Balance',
      colDate: 'Date',
      colType: 'Type',
      colAmount: 'Amount (HKD)',
      colBy: 'Created by',
      emptyLedger: 'No ledger entries',
      emptyTasks: 'No tasks',
    }
  }
  return {
    reportTitleTask: '事項報告',
    reportTitleSection: '分組報告',
    reportTitleProject: '項目報告',
    reportTitleProgress: '項目進度報表',
    reportTitleSchedule: '工作排程',
    reportTitleSectionList: '分組事項列表',
    reportTitleFinance: '項目財務摘要',
    project: '項目',
    status: '狀態',
    owner: '負責人',
    contact: '專案聯絡人',
    phone: '電話',
    email: '電郵',
    startDate: '開始日期',
    endDate: '結束日期',
    completion: '完成率',
    completionDetail: '已完成 / 進行中 / 待辦',
    taskCompletion: '事項完成度',
    generatedAt: '產生時間',
    note: '備註',
    section: '分組',
    description: '說明',
    task: '事項',
    content: '內容',
    schedule: '時段',
    assignees: '負責人',
    attachments: '附件',
    memos: '事項備註',
    noContent: '—',
    embedded: '已嵌入',
    listedOnly: '僅列表',
    uncategorized: '未分類',
    statusTodo: '待辦',
    statusDoing: '進行中',
    statusDone: '已完成',
    tempMember: '臨時',
    colStart: '開始',
    colEnd: '結束',
    colSection: '分組',
    colTask: '事項',
    colStatus: '狀態',
    colAssignees: '負責人',
    colContent: '內容',
    noSchedule: '未設開始時間',
    income: '收入',
    expense: '支出',
    balance: '結餘',
    colDate: '日期',
    colType: '類型',
    colAmount: '金額（HKD）',
    colBy: '建立者',
    emptyLedger: '尚無帳冊紀錄',
    emptyTasks: '尚無事項',
  }
}

function toBinaryStr(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i])
  return bin
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function formatDateTime(value?: Date | string | null, locale: ProjectPdfLocale = 'zh') {
  if (!value) return ''
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return ''
  const base = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  return locale === 'en' ? base : base
}

function scheduleLabel(
  task: ProjectPdfTask,
  locale: ProjectPdfLocale
) {
  const start = formatDateTime(task.startAt, locale)
  const end = formatDateTime(task.dueDate, locale)
  if (start && end) return `${start} – ${end}`
  return end || start || ''
}

function timeMs(value?: Date | string | null) {
  if (!value) return null
  const d = typeof value === 'string' ? new Date(value) : value
  const t = d.getTime()
  return Number.isNaN(t) ? null : t
}

/** Chronological: startAt ↑, then dueDate ↑; missing start last. */
export function sortTasksForSchedule(tasks: ProjectPdfTask[]) {
  return [...tasks].sort((a, b) => {
    const as = timeMs(a.startAt)
    const bs = timeMs(b.startAt)
    if (as == null && bs == null) {
      const ad = timeMs(a.dueDate)
      const bd = timeMs(b.dueDate)
      if (ad == null && bd == null) return a.title.localeCompare(b.title)
      if (ad == null) return 1
      if (bd == null) return -1
      return ad - bd
    }
    if (as == null) return 1
    if (bs == null) return -1
    if (as !== bs) return as - bs
    const ad = timeMs(a.dueDate) ?? Number.MAX_SAFE_INTEGER
    const bd = timeMs(b.dueDate) ?? Number.MAX_SAFE_INTEGER
    if (ad !== bd) return ad - bd
    return a.title.localeCompare(b.title)
  })
}

function flattenTasks(sections: ProjectPdfSectionNode[] | undefined): ProjectPdfTask[] {
  const out: ProjectPdfTask[] = []
  const walk = (nodes: ProjectPdfSectionNode[]) => {
    for (const n of nodes) {
      for (const t of n.tasks) {
        out.push({ ...t, sectionPath: t.sectionPath || n.title })
      }
      if (n.children?.length) walk(n.children)
    }
  }
  walk(sections || [])
  return out
}

function sortSectionTasksChronologically(sections: ProjectPdfSectionNode[]): ProjectPdfSectionNode[] {
  return sections.map((s) => ({
    ...s,
    tasks: sortTasksForSchedule(s.tasks),
    children: s.children ? sortSectionTasksChronologically(s.children) : [],
  }))
}

function statusLabel(status: string, L: Labels) {
  if (status === 'DOING') return L.statusDoing
  if (status === 'DONE') return L.statusDone
  return L.statusTodo
}

type Rgb = [number, number, number]

const COLORS = {
  brand: [0, 122, 255] as Rgb,
  brandDark: [30, 64, 175] as Rgb,
  brandSoft: [238, 244, 255] as Rgb,
  slate: [51, 65, 85] as Rgb,
  muted: [100, 116, 139] as Rgb,
  line: [226, 232, 240] as Rgb,
  card: [248, 250, 252] as Rgb,
  white: [255, 255, 255] as Rgb,
  done: [16, 185, 129] as Rgb,
  doneSoft: [236, 253, 245] as Rgb,
  doing: [245, 158, 11] as Rgb,
  doingSoft: [255, 251, 235] as Rgb,
  todo: [100, 116, 139] as Rgb,
  todoSoft: [241, 245, 249] as Rgb,
  sectionRoot: [15, 23, 42] as Rgb,
  sectionChild: [51, 65, 85] as Rgb,
}

function statusPalette(status: string): { fg: Rgb; bg: Rgb } {
  if (status === 'DONE') return { fg: COLORS.done, bg: COLORS.doneSoft }
  if (status === 'DOING') return { fg: COLORS.doing, bg: COLORS.doingSoft }
  return { fg: COLORS.todo, bg: COLORS.todoSoft }
}

function taskPercent(task: ProjectPdfTask) {
  if (typeof task.completionPercent === 'number') return task.completionPercent
  if (task.status === 'DONE') return 100
  if (task.status === 'DOING') return 50
  return 0
}

function roundedRect(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  style: 'F' | 'S' | 'FD' = 'F'
) {
  const rr = Math.min(r, w / 2, h / 2)
  doc.roundedRect(x, y, w, h, rr, rr, style)
}

function drawStatusPill(
  doc: jsPDF,
  label: string,
  status: string,
  x: number,
  y: number,
  fontReg: string
) {
  const { fg, bg } = statusPalette(status)
  doc.setFont(fontReg, 'bold')
  doc.setFontSize(7)
  const tw = doc.getTextWidth(label) + 10
  const th = 12
  doc.setFillColor(...bg)
  roundedRect(doc, x, y - 9, tw, th, 3, 'F')
  doc.setTextColor(...fg)
  doc.text(label, x + 5, y)
  doc.setTextColor(...COLORS.slate)
  return tw
}

function drawProgressBar(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  percent: number,
  fill: Rgb
) {
  const h = 6
  doc.setFillColor(...COLORS.line)
  roundedRect(doc, x, y, w, h, 3, 'F')
  const filled = Math.max(0, Math.min(100, percent)) / 100 * w
  if (filled > 0.5) {
    doc.setFillColor(...fill)
    roundedRect(doc, x, y, Math.max(filled, 4), h, 3, 'F')
  }
}

/** Compact meta chips under brand header for list/progress docs. */
function drawMetaSummaryCards(
  doc: jsPDF,
  input: GenerateProjectPdfInput,
  L: Labels,
  locale: ProjectPdfLocale,
  margin: number,
  pageW: number,
  y: number,
  fontReg: string,
  fontBold: string
) {
  const formatDay = (value?: Date | string | null) => {
    if (!value) return ''
    const d = typeof value === 'string' ? new Date(value) : value
    if (Number.isNaN(d.getTime())) return ''
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  }

  const cards: Array<{ label: string; value: string; accent: Rgb; soft: Rgb }> = [
    { label: L.status, value: input.projectStatus, accent: COLORS.brand, soft: COLORS.brandSoft },
  ]
  if (input.ownerName) {
    cards.push({
      label: L.owner,
      value: input.ownerName,
      accent: COLORS.slate,
      soft: COLORS.card,
    })
  }
  if (input.completion) {
    cards.push({
      label: L.completion,
      value: `${input.completion.percent}%`,
      accent: COLORS.done,
      soft: COLORS.doneSoft,
    })
    cards.push({
      label: L.completionDetail,
      value: `${input.completion.done}/${input.completion.doing}/${input.completion.todo}`,
      accent: COLORS.doing,
      soft: COLORS.doingSoft,
    })
  } else if (input.startDate || input.endDate) {
    cards.push({
      label: L.startDate,
      value: formatDay(input.startDate) || '—',
      accent: COLORS.brand,
      soft: COLORS.brandSoft,
    })
  }

  const gap = 8
  const usable = pageW - margin * 2
  const cardW = (usable - gap * (Math.min(cards.length, 4) - 1)) / Math.min(cards.length, 4)
  const cardH = 36
  let x = margin
  for (const card of cards.slice(0, 4)) {
    doc.setFillColor(...card.soft)
    roundedRect(doc, x, y, cardW, cardH, 6, 'F')
    doc.setFillColor(...card.accent)
    doc.rect(x, y, 3, cardH, 'F')
    doc.setFont(fontReg, 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...COLORS.muted)
    doc.text(card.label, x + 10, y + 12)
    doc.setFont(fontBold, 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...COLORS.slate)
    const clipped =
      card.value.length > 18 ? `${card.value.slice(0, 16)}…` : card.value
    doc.text(clipped, x + 10, y + 26)
    x += cardW + gap
  }
  y += cardH + 8

  doc.setFont(fontReg, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.muted)
  const extras = [
    input.contactName ? `${L.contact}: ${input.contactName}` : '',
    input.startDate && input.completion ? `${L.startDate}: ${formatDay(input.startDate)}` : '',
    input.endDate ? `${L.endDate}: ${formatDay(input.endDate)}` : '',
    `${L.generatedAt}: ${formatDateTime(new Date(), locale)}`,
  ].filter(Boolean)
  if (extras.length) {
    y = writeWrapped(doc, extras.join('  ·  '), margin, y, usable, 10)
    y += 4
  }

  if (input.completion && (input.mode === 'progress' || input.mode === 'sectionList')) {
    y += 2
    doc.setFont(fontBold, 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...COLORS.slate)
    doc.text(`${L.completion} ${input.completion.percent}%`, margin, y)
    y += 6
    drawProgressBar(doc, margin, y, usable, input.completion.percent, COLORS.brand)
    y += 14
  }

  if (input.projectNote?.trim() && input.mode === 'progress') {
    doc.setFillColor(...COLORS.brandSoft)
    const note = input.projectNote.trim()
    const lines = doc.splitTextToSize(note, usable - 16) as string[]
    const boxH = Math.min(12 + lines.length * 11, 72)
    roundedRect(doc, margin, y, usable, boxH, 6, 'F')
    doc.setFont(fontBold, 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...COLORS.brandDark)
    doc.text(L.note, margin + 8, y + 12)
    doc.setFont(fontReg, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...COLORS.slate)
    doc.text(lines.slice(0, 4), margin + 8, y + 24)
    y += boxH + 10
  }

  doc.setTextColor(...COLORS.slate)
  return y + 4
}

function measureWrappedHeight(doc: jsPDF, text: string, maxWidth: number, lineHeight: number) {
  const lines = doc.splitTextToSize(text || '', maxWidth) as string[]
  return Math.max(lineHeight, lines.length * lineHeight)
}

function ensureSpace(
  doc: jsPDF,
  y: number,
  need: number,
  margin: number,
  pageH: number
) {
  if (y + need > pageH - margin) {
    doc.addPage()
    return margin
  }
  return y
}

function writeWrapped(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const lines = doc.splitTextToSize(text || '', maxWidth) as string[]
  doc.text(lines, x, y)
  return y + lines.length * lineHeight
}

function attachmentLabel(att: ProjectPdfAttachment, index: number, locale: ProjectPdfLocale) {
  const name = att.note?.trim() || (locale === 'en' ? `Attachment ${index + 1}` : `附件 ${index + 1}`)
  const size =
    typeof att.size === 'number' && att.size > 0
      ? ` (${Math.max(1, Math.round(att.size / 1024))} KB)`
      : ''
  return `${name}${size}`
}

function tryEmbedImage(
  doc: jsPDF,
  fileUrl: string,
  x: number,
  y: number,
  maxW: number,
  maxH: number
): number {
  if (!fileUrl?.startsWith('data:image/')) return 0
  const isJpeg = fileUrl.startsWith('data:image/jpeg') || fileUrl.startsWith('data:image/jpg')
  const isPng = fileUrl.startsWith('data:image/png')
  if (!isJpeg && !isPng) return 0
  try {
    const format = isPng ? 'PNG' : 'JPEG'
    const props = doc.getImageProperties(fileUrl)
    const ratio = Math.min(maxW / props.width, maxH / props.height, 1)
    const w = props.width * ratio
    const h = props.height * ratio
    doc.addImage(fileUrl, format, x, y, w, h)
    return h + 4
  } catch {
    return 0
  }
}

function drawAttachments(
  doc: jsPDF,
  attachments: ProjectPdfAttachment[] | undefined,
  includeAttachments: boolean,
  x: number,
  y: number,
  maxWidth: number,
  margin: number,
  pageH: number,
  L: Labels,
  locale: ProjectPdfLocale,
  fontReg: string
) {
  if (!includeAttachments || !attachments || attachments.length === 0) return y
  y = ensureSpace(doc, y, 20, margin, pageH)
  doc.setFont(fontReg, 'bold')
  doc.setFontSize(10)
  doc.text(L.attachments, x, y)
  y += 12
  doc.setFont(fontReg, 'normal')
  doc.setFontSize(9)

  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i]
    y = ensureSpace(doc, y, 18, margin, pageH)
    const label = attachmentLabel(att, i, locale)
    const embeddedH = tryEmbedImage(doc, att.fileUrl, x, y, Math.min(120, maxWidth), 70)
    if (embeddedH > 0) {
      y += embeddedH
      y = writeWrapped(doc, `• ${label} (${L.embedded})`, x, y, maxWidth, 11)
      y += 4
    } else {
      y = writeWrapped(doc, `• ${label} (${L.listedOnly})`, x, y, maxWidth, 11)
      y += 2
    }
  }
  return y + 4
}

function drawTaskBlock(
  doc: jsPDF,
  task: ProjectPdfTask,
  includeAttachments: boolean,
  x: number,
  y: number,
  maxWidth: number,
  margin: number,
  pageH: number,
  L: Labels,
  locale: ProjectPdfLocale,
  fontReg: string,
  fontBold: string
) {
  y = ensureSpace(doc, y, 40, margin, pageH)
  const { fg, bg } = statusPalette(task.status)
  doc.setFillColor(...fg)
  doc.rect(x, y - 2, 3.5, 20, 'F')

  doc.setFont(fontBold, 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...COLORS.slate)
  y = writeWrapped(doc, task.title, x + 10, y + 2, maxWidth - 12, 14)
  y += 4

  const statusText = statusLabel(task.status, L)
  const pillW = drawStatusPill(doc, statusText, task.status, x + 10, y + 2, fontReg)
  const pct = taskPercent(task)
  doc.setFont(fontReg, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.muted)
  doc.text(`${L.taskCompletion}: ${pct}%`, x + 16 + pillW, y + 2)
  y += 10
  drawProgressBar(doc, x + 10, y, Math.min(180, maxWidth - 20), pct, fg)
  y += 12

  doc.setFont(fontReg, 'normal')
  doc.setFontSize(9)
  const meta: string[] = []
  if (task.sectionPath) meta.push(`${L.section}: ${task.sectionPath}`)
  const schedule = scheduleLabel(task, locale)
  if (schedule) meta.push(`${L.schedule}: ${schedule}`)
  if (task.assignees && task.assignees.length > 0) {
    meta.push(`${L.assignees}: ${task.assignees.join(', ')}`)
  }
  for (const line of meta) {
    y = ensureSpace(doc, y, 12, margin, pageH)
    doc.setTextColor(...COLORS.muted)
    y = writeWrapped(doc, line, x + 10, y, maxWidth - 12, 11)
  }

  y += 4
  doc.setFont(fontBold, 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...fg)
  doc.text(L.content, x + 10, y)
  y += 11
  doc.setFillColor(...bg)
  const content = task.content?.trim() || L.noContent
  const contentH = measureWrappedHeight(doc, content, maxWidth - 24, 11) + 10
  y = ensureSpace(doc, y, contentH, margin, pageH)
  roundedRect(doc, x + 8, y - 2, maxWidth - 8, contentH, 4, 'F')
  doc.setFont(fontReg, 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.slate)
  y = writeWrapped(doc, content, x + 14, y + 8, maxWidth - 24, 11)
  y += 8

  y = drawAttachments(
    doc,
    task.attachments,
    includeAttachments,
    x + 8,
    y,
    maxWidth - 8,
    margin,
    pageH,
    L,
    locale,
    fontReg
  )

  if (task.memos && task.memos.length > 0) {
    y = ensureSpace(doc, y, 16, margin, pageH)
    doc.setFont(fontBold, 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...COLORS.brandDark)
    doc.text(L.memos, x + 10, y)
    y += 12
    doc.setFont(fontReg, 'normal')
    doc.setFontSize(9)
    const memos = task.memos.slice(0, 8)
    for (const m of memos) {
      y = ensureSpace(doc, y, 16, margin, pageH)
      doc.setTextColor(...COLORS.muted)
      const head = `${m.author || '—'} · ${formatDateTime(m.createdAt, locale)}`
      y = writeWrapped(doc, head, x + 10, y, maxWidth - 12, 11)
      doc.setTextColor(...COLORS.slate)
      y = writeWrapped(doc, m.content || L.noContent, x + 16, y, maxWidth - 18, 11)
      y += 4
    }
  }

  doc.setDrawColor(...COLORS.line)
  doc.setLineWidth(0.4)
  doc.line(x + 8, y + 2, x + maxWidth, y + 2)
  return y + 10
}

function drawSectionNode(
  doc: jsPDF,
  section: ProjectPdfSectionNode,
  includeAttachments: boolean,
  x: number,
  y: number,
  maxWidth: number,
  margin: number,
  pageH: number,
  L: Labels,
  locale: ProjectPdfLocale,
  fontReg: string,
  fontBold: string,
  compactTasks = false
) {
  y = ensureSpace(doc, y, 28, margin, pageH)
  const indent = x + section.depth * 8
  const bannerW = maxWidth - section.depth * 8
  const isRoot = section.depth === 0
  const bannerH = isRoot ? 22 : 18
  doc.setFillColor(...(isRoot ? COLORS.brandSoft : COLORS.card))
  roundedRect(doc, indent, y, bannerW, bannerH, 4, 'F')
  doc.setFillColor(...(isRoot ? COLORS.brand : COLORS.brandDark))
  doc.rect(indent, y, 3, bannerH, 'F')
  doc.setFont(fontBold, 'bold')
  doc.setFontSize(isRoot ? 11 : 10)
  doc.setTextColor(...(isRoot ? COLORS.brandDark : COLORS.sectionChild))
  doc.text(
    `${L.section}  ${section.title}`,
    indent + 10,
    y + (isRoot ? 14 : 12)
  )
  y += bannerH + 6
  doc.setFont(fontReg, 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.slate)
  if (section.description?.trim()) {
    doc.setFillColor(255, 255, 255)
    const desc = section.description.trim()
    const dh = measureWrappedHeight(doc, desc, bannerW - 12, 11) + 8
    y = ensureSpace(doc, y, dh, margin, pageH)
    roundedRect(doc, indent, y, bannerW, dh, 4, 'F')
    doc.setDrawColor(...COLORS.line)
    doc.setLineWidth(0.4)
    roundedRect(doc, indent, y, bannerW, dh, 4, 'S')
    doc.setFont(fontReg, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...COLORS.muted)
    writeWrapped(doc, desc, indent + 6, y + 10, bannerW - 12, 11)
    y += dh + 6
    doc.setTextColor(...COLORS.slate)
  }

  y = drawAttachments(
    doc,
    section.attachments,
    includeAttachments,
    indent,
    y,
    maxWidth - section.depth * 8,
    margin,
    pageH,
    L,
    locale,
    fontReg
  )

  if (compactTasks) {
    for (const task of section.tasks) {
      const innerW = maxWidth - section.depth * 8 - 4
      const left = indent + 2
      doc.setFont(fontBold, 'bold')
      doc.setFontSize(10)
      const titleH = measureWrappedHeight(doc, task.title, innerW - 16, 12)
      doc.setFont(fontReg, 'normal')
      doc.setFontSize(8)
      const schedule = scheduleLabel(task, locale)
      const assignees = task.assignees?.join(', ') || ''
      const content = task.content?.trim().slice(0, 220) || ''
      const metaLine = [schedule, assignees].filter(Boolean).join('  ·  ')
      const metaH = metaLine
        ? measureWrappedHeight(doc, metaLine, innerW - 16, 10)
        : 0
      const contentH = content
        ? measureWrappedHeight(doc, content, innerW - 16, 10)
        : 0
      const pct = taskPercent(task)
      const cardH = 14 + titleH + (metaH ? metaH + 2 : 0) + (contentH ? contentH + 4 : 0) + 14
      y = ensureSpace(doc, y, cardH + 6, margin, pageH)

      const { fg, bg } = statusPalette(task.status)
      doc.setFillColor(...COLORS.white)
      doc.setDrawColor(...COLORS.line)
      doc.setLineWidth(0.6)
      roundedRect(doc, left, y, innerW, cardH, 5, 'FD')
      doc.setFillColor(...fg)
      doc.rect(left, y, 3.5, cardH, 'F')

      let cy = y + 12
      doc.setFont(fontBold, 'bold')
      doc.setFontSize(10)
      doc.setTextColor(...COLORS.slate)
      const titleLines = doc.splitTextToSize(task.title, innerW - 78) as string[]
      doc.text(titleLines, left + 10, cy)
      drawStatusPill(
        doc,
        statusLabel(task.status, L),
        task.status,
        left + innerW - 10 - (doc.getTextWidth(statusLabel(task.status, L)) + 10),
        cy,
        fontReg
      )
      cy += titleH + 2

      if (metaLine) {
        doc.setFont(fontReg, 'normal')
        doc.setFontSize(7.5)
        doc.setTextColor(...COLORS.muted)
        cy = writeWrapped(doc, metaLine, left + 10, cy, innerW - 16, 10)
        cy += 2
      }
      if (content) {
        doc.setFont(fontReg, 'normal')
        doc.setFontSize(8)
        doc.setTextColor(...COLORS.slate)
        cy = writeWrapped(doc, content, left + 10, cy, innerW - 16, 10)
        cy += 4
      }

      doc.setFont(fontReg, 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...COLORS.muted)
      doc.text(`${pct}%`, left + 10, y + cardH - 6)
      drawProgressBar(doc, left + 28, y + cardH - 11, innerW - 42, pct, fg)

      y += cardH + 6
      doc.setTextColor(...COLORS.slate)
    }
  } else {
    for (const task of section.tasks) {
      y = drawTaskBlock(
        doc,
        task,
        includeAttachments,
        indent,
        y,
        maxWidth - section.depth * 8,
        margin,
        pageH,
        L,
        locale,
        fontReg,
        fontBold
      )
    }
  }

  for (const child of section.children || []) {
    y = drawSectionNode(
      doc,
      child,
      includeAttachments,
      x,
      y,
      maxWidth,
      margin,
      pageH,
      L,
      locale,
      fontReg,
      fontBold,
      compactTasks
    )
  }
  return y
}

export function generateProjectPdf(input: GenerateProjectPdfInput): Uint8Array {
  const locale = input.locale === 'en' ? 'en' : 'zh'
  const L = labelsFor(locale)
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 36
  const maxWidth = pageW - margin * 2
  let fontReg = 'helvetica'
  let fontBold = 'helvetica'
  let cjk = false

  try {
    const fonts = loadChineseFonts()
    doc.addFileToVFS(`${fonts.regularFamily}.ttf`, toBinaryStr(fonts.regular))
    doc.addFont(`${fonts.regularFamily}.ttf`, fonts.regularFamily, 'normal')
    // Reuse regular for bold — some bold TTFs (e.g. msyh) fail jspdf registration in Node.
    doc.addFont(`${fonts.regularFamily}.ttf`, fonts.regularFamily, 'bold')
    fontReg = fonts.regularFamily
    fontBold = fonts.regularFamily
    cjk = true
  } catch (e) {
    console.error('[project-pdf] CJK font failed, fallback helvetica:', e)
    fontReg = 'helvetica'
    fontBold = 'helvetica'
    cjk = false
  }
  void cjk

  const title =
    input.mode === 'task'
      ? L.reportTitleTask
      : input.mode === 'section'
        ? L.reportTitleSection
        : input.mode === 'progress'
          ? L.reportTitleProgress
          : input.mode === 'schedule'
            ? L.reportTitleSchedule
            : input.mode === 'sectionList'
              ? L.reportTitleSectionList
              : input.mode === 'finance'
                ? L.reportTitleFinance
                : L.reportTitleProject

  const { contentTop } = drawBrandHeader(doc, {
    pageW,
    margin,
    fontReg,
    fontBold,
    reportTitle: title,
    projectTitle: input.projectTitle,
  })
  let y = contentTop
  doc.setTextColor(30, 30, 30)

  const formatDay = (value?: Date | string | null) => {
    if (!value) return ''
    const d = typeof value === 'string' ? new Date(value) : value
    if (Number.isNaN(d.getTime())) return ''
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  }

  const useRichMeta =
    input.mode === 'sectionList' ||
    input.mode === 'progress' ||
    input.mode === 'schedule' ||
    input.mode === 'finance'

  if (useRichMeta) {
    y = drawMetaSummaryCards(
      doc,
      input,
      L,
      locale,
      margin,
      pageW,
      y,
      fontReg,
      fontBold
    )
  } else {
    const headerLines = [
      `${L.project}: ${input.projectTitle}`,
      `${L.status}: ${input.projectStatus}`,
      input.ownerName ? `${L.owner}: ${input.ownerName}` : '',
      input.contactName ? `${L.contact}: ${input.contactName}` : '',
      input.contactPhone ? `${L.phone}: ${input.contactPhone}` : '',
      input.contactEmail ? `${L.email}: ${input.contactEmail}` : '',
      input.startDate ? `${L.startDate}: ${formatDay(input.startDate)}` : '',
      input.endDate ? `${L.endDate}: ${formatDay(input.endDate)}` : '',
      input.completion
        ? `${L.completion}: ${input.completion.percent}% (${input.completion.done}/${input.completion.total})`
        : '',
      input.completion
        ? `${L.completionDetail}: ${input.completion.done} / ${input.completion.doing} / ${input.completion.todo}`
        : '',
      `${L.generatedAt}: ${formatDateTime(new Date(), locale)}`,
    ].filter(Boolean)
    for (const line of headerLines) {
      y = writeWrapped(doc, line, margin, y, maxWidth, 12)
    }
    if (input.projectNote?.trim()) {
      y += 4
      doc.setFont(fontBold, 'bold')
      doc.text(L.note, margin, y)
      y += 12
      doc.setFont(fontReg, 'normal')
      y = writeWrapped(doc, input.projectNote.trim(), margin, y, maxWidth, 11)
    }
    y += 10
  }

  if (input.mode === 'schedule') {
    const tasks = sortTasksForSchedule(flattenTasks(input.sections))
    if (tasks.length === 0) {
      doc.setFont(fontReg, 'normal')
      doc.setFontSize(10)
      doc.text(L.emptyTasks, margin, y)
    } else {
      autoTable(doc, {
        startY: y,
        head: [[
          L.colStart,
          L.colEnd,
          L.colSection,
          L.colTask,
          L.colStatus,
          L.colAssignees,
          L.colContent,
        ]],
        body: tasks.map((task) => [
          formatDateTime(task.startAt, locale) || L.noSchedule,
          formatDateTime(task.dueDate, locale) || '—',
          task.sectionPath || '—',
          task.title,
          statusLabel(task.status, L),
          (task.assignees || []).join(', ') || '—',
          (task.content || '').trim().slice(0, 160) || '—',
        ]),
        styles: {
          font: fontReg,
          fontSize: 7.5,
          cellPadding: 3.5,
          overflow: 'linebreak',
          valign: 'top',
        },
        headStyles: {
          fillColor: COLORS.brand,
          textColor: 255,
          font: fontReg,
          fontStyle: 'bold',
          fontSize: 8,
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 68 },
          1: { cellWidth: 68 },
          2: { cellWidth: 72 },
          3: { cellWidth: 78 },
          4: { cellWidth: 48 },
          5: { cellWidth: 58 },
        },
        margin: { left: margin, right: margin },
        didParseCell: (data) => {
          if (data.section !== 'body' || data.column.index !== 4) return
          const raw = String(data.cell.raw || '')
          if (raw === L.statusDone) {
            data.cell.styles.textColor = COLORS.done
            data.cell.styles.fontStyle = 'bold'
          } else if (raw === L.statusDoing) {
            data.cell.styles.textColor = COLORS.doing
            data.cell.styles.fontStyle = 'bold'
          } else {
            data.cell.styles.textColor = COLORS.todo
          }
        },
      })
    }
    return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer)
  }

  if (input.mode === 'finance') {
    const ledger = input.ledger || []
    const income = ledger.filter((e) => e.type === 'INCOME').reduce((s, e) => s + e.amount, 0)
    const expense = ledger.filter((e) => e.type === 'EXPENSE').reduce((s, e) => s + e.amount, 0)
    const balance = income - expense
    const fmt = (n: number) =>
      new Intl.NumberFormat(locale === 'en' ? 'en-HK' : 'zh-HK', {
        style: 'currency',
        currency: 'HKD',
        minimumFractionDigits: 2,
      }).format(n)
    const finCards: Array<{ label: string; value: string; soft: Rgb; accent: Rgb }> = [
      { label: L.income, value: fmt(income), soft: COLORS.doneSoft, accent: COLORS.done },
      { label: L.expense, value: fmt(expense), soft: [254, 242, 242], accent: [244, 63, 94] },
      {
        label: L.balance,
        value: fmt(balance),
        soft: COLORS.brandSoft,
        accent: balance >= 0 ? COLORS.brand : [244, 63, 94],
      },
    ]
    const gap = 8
    const cardW = (maxWidth - gap * 2) / 3
    finCards.forEach((c, i) => {
      const cx = margin + i * (cardW + gap)
      doc.setFillColor(...c.soft)
      roundedRect(doc, cx, y, cardW, 34, 6, 'F')
      doc.setFillColor(...c.accent)
      doc.rect(cx, y, 3, 34, 'F')
      doc.setFont(fontReg, 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...COLORS.muted)
      doc.text(c.label, cx + 10, y + 12)
      doc.setFont(fontBold, 'bold')
      doc.setFontSize(10)
      doc.setTextColor(...COLORS.slate)
      doc.text(c.value, cx + 10, y + 26)
    })
    y += 44
    if (ledger.length === 0) {
      doc.setFont(fontReg, 'normal')
      doc.setTextColor(...COLORS.muted)
      doc.text(L.emptyLedger, margin, y)
    } else {
      const sorted = [...ledger].sort((a, b) => (timeMs(a.date) ?? 0) - (timeMs(b.date) ?? 0))
      autoTable(doc, {
        startY: y,
        head: [[L.colDate, L.colType, L.colAmount, L.note, L.colBy]],
        body: sorted.map((e) => [
          formatDay(e.date),
          e.type === 'INCOME' ? L.income : L.expense,
          fmt(e.amount),
          e.note?.trim() || '—',
          e.createdBy || '—',
        ]),
        styles: { font: fontReg, fontSize: 8, cellPadding: 3.5, overflow: 'linebreak' },
        headStyles: {
          fillColor: COLORS.brand,
          textColor: 255,
          font: fontReg,
          fontStyle: 'bold',
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: margin, right: margin },
      })
    }
    return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer)
  }

  if (input.mode === 'sectionList') {
    const sections = sortSectionTasksChronologically(input.sections || [])
    if (sections.length === 0) {
      doc.setFont(fontReg, 'normal')
      doc.text(L.emptyTasks, margin, y)
    } else {
      for (const section of sections) {
        y = drawSectionNode(
          doc,
          section,
          false,
          margin,
          y,
          maxWidth,
          margin,
          pageH,
          L,
          locale,
          fontReg,
          fontBold,
          true
        )
      }
    }
    return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer)
  }

  if (input.mode === 'task' && input.task) {
    drawTaskBlock(
      doc,
      input.task,
      input.includeAttachments,
      margin,
      y,
      maxWidth,
      margin,
      pageH,
      L,
      locale,
      fontReg,
      fontBold
    )
  } else {
    for (const section of input.sections || []) {
      y = drawSectionNode(
        doc,
        section,
        input.includeAttachments,
        margin,
        y,
        maxWidth,
        margin,
        pageH,
        L,
        locale,
        fontReg,
        fontBold,
        false
      )
    }
  }

  return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer)
}
