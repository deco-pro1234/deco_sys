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
  y = ensureSpace(doc, y, 28, margin, pageH)
  doc.setFont(fontBold, 'bold')
  doc.setFontSize(12)
  y = writeWrapped(doc, `${L.task}: ${task.title}`, x, y, maxWidth, 14)
  y += 4
  doc.setFont(fontReg, 'normal')
  doc.setFontSize(9)

  const meta: string[] = [
    `${L.status}: ${statusLabel(task.status, L)}`,
  ]
  const pct =
    typeof task.completionPercent === 'number'
      ? task.completionPercent
      : task.status === 'DONE'
        ? 100
        : task.status === 'DOING'
          ? 50
          : 0
  meta.push(`${L.taskCompletion}: ${pct}%`)
  if (task.sectionPath) meta.push(`${L.section}: ${task.sectionPath}`)
  const schedule = scheduleLabel(task, locale)
  if (schedule) meta.push(`${L.schedule}: ${schedule}`)
  if (task.assignees && task.assignees.length > 0) {
    meta.push(`${L.assignees}: ${task.assignees.join(', ')}`)
  }
  for (const line of meta) {
    y = ensureSpace(doc, y, 12, margin, pageH)
    y = writeWrapped(doc, line, x, y, maxWidth, 11)
  }

  y += 4
  doc.setFont(fontBold, 'bold')
  doc.text(L.content, x, y)
  y += 11
  doc.setFont(fontReg, 'normal')
  y = writeWrapped(doc, task.content?.trim() || L.noContent, x, y, maxWidth, 11)
  y += 6

  y = drawAttachments(
    doc,
    task.attachments,
    includeAttachments,
    x,
    y,
    maxWidth,
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
    doc.text(L.memos, x, y)
    y += 12
    doc.setFont(fontReg, 'normal')
    doc.setFontSize(9)
    const memos = task.memos.slice(0, 8)
    for (const m of memos) {
      y = ensureSpace(doc, y, 16, margin, pageH)
      const head = `${m.author || '—'} · ${formatDateTime(m.createdAt, locale)}`
      y = writeWrapped(doc, head, x, y, maxWidth, 11)
      y = writeWrapped(doc, m.content || L.noContent, x + 6, y, maxWidth - 6, 11)
      y += 4
    }
  }

  return y + 8
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
  y = ensureSpace(doc, y, 24, margin, pageH)
  doc.setFont(fontBold, 'bold')
  doc.setFontSize(section.depth === 0 ? 13 : 11)
  const indent = x + section.depth * 8
  y = writeWrapped(doc, `${L.section}: ${section.title}`, indent, y, maxWidth - section.depth * 8, 14)
  y += 2
  doc.setFont(fontReg, 'normal')
  doc.setFontSize(9)
  if (section.description?.trim()) {
    doc.setFont(fontBold, 'bold')
    doc.text(L.description, indent, y)
    y += 11
    doc.setFont(fontReg, 'normal')
    y = writeWrapped(doc, section.description.trim(), indent, y, maxWidth - section.depth * 8, 11)
    y += 4
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
      y = ensureSpace(doc, y, 16, margin, pageH)
      doc.setFont(fontBold, 'bold')
      doc.setFontSize(10)
      y = writeWrapped(doc, `• ${task.title}`, indent + 4, y, maxWidth - section.depth * 8 - 4, 12)
      doc.setFont(fontReg, 'normal')
      doc.setFontSize(8)
      const bits = [
        statusLabel(task.status, L),
        scheduleLabel(task, locale),
        task.assignees?.join(', ') || '',
      ].filter(Boolean)
      if (bits.length) {
        y = writeWrapped(doc, bits.join(' · '), indent + 10, y, maxWidth - section.depth * 8 - 10, 10)
      }
      if (task.content?.trim()) {
        y = writeWrapped(
          doc,
          task.content.trim().slice(0, 280),
          indent + 10,
          y,
          maxWidth - section.depth * 8 - 10,
          10
        )
      }
      y += 6
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
  if (
    input.projectNote?.trim() &&
    input.mode !== 'finance' &&
    input.mode !== 'schedule'
  ) {
    y += 4
    doc.setFont(fontBold, 'bold')
    doc.text(L.note, margin, y)
    y += 12
    doc.setFont(fontReg, 'normal')
    y = writeWrapped(doc, input.projectNote.trim(), margin, y, maxWidth, 11)
  }
  y += 10

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
          cellPadding: 3,
          overflow: 'linebreak',
          valign: 'top',
        },
        headStyles: {
          fillColor: [0, 122, 255],
          textColor: 255,
          font: fontReg,
          fontStyle: 'bold',
          fontSize: 8,
        },
        columnStyles: {
          0: { cellWidth: 68 },
          1: { cellWidth: 68 },
          2: { cellWidth: 72 },
          3: { cellWidth: 78 },
          4: { cellWidth: 42 },
          5: { cellWidth: 58 },
        },
        margin: { left: margin, right: margin },
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
    doc.setFont(fontBold, 'bold')
    doc.setFontSize(10)
    doc.text(`${L.income}: ${fmt(income)}`, margin, y)
    doc.text(`${L.expense}: ${fmt(expense)}`, margin + 150, y)
    doc.text(`${L.balance}: ${fmt(balance)}`, margin + 300, y)
    y += 14
    if (ledger.length === 0) {
      doc.setFont(fontReg, 'normal')
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
        styles: { font: fontReg, fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
        headStyles: {
          fillColor: [0, 122, 255],
          textColor: 255,
          font: fontReg,
          fontStyle: 'bold',
        },
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
