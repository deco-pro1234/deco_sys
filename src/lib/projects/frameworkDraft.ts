export type FrameworkTaskDraft = {
  title: string
  content?: string | null
}

export type FrameworkChildSectionDraft = {
  title: string
  description?: string | null
  tasks: FrameworkTaskDraft[]
}

export type FrameworkRootSectionDraft = {
  title: string
  description?: string | null
  tasks: FrameworkTaskDraft[]
  children: FrameworkChildSectionDraft[]
}

export type FrameworkDraft = {
  title: string
  note?: string | null
  status: 'PLANNING' | 'ACTIVE'
  sections: FrameworkRootSectionDraft[]
  uncategorizedTasks: FrameworkTaskDraft[]
}

export const FRAMEWORK_LIMITS = {
  maxRoots: 8,
  maxChildrenPerRoot: 10,
  maxTasksTotal: 50,
  maxTitleLen: 120,
  maxContentLen: 2000,
  maxDescriptionLen: 1000,
  maxPromptLen: 4000,
} as const

function clip(text: unknown, max: number) {
  return String(text ?? '')
    .trim()
    .slice(0, max)
}

function normalizeTask(raw: any): FrameworkTaskDraft | null {
  const title = clip(raw?.title, FRAMEWORK_LIMITS.maxTitleLen)
  if (!title) return null
  const content = clip(raw?.content, FRAMEWORK_LIMITS.maxContentLen)
  return { title, content: content || null }
}

function normalizeChild(raw: any): FrameworkChildSectionDraft | null {
  const title = clip(raw?.title, FRAMEWORK_LIMITS.maxTitleLen)
  if (!title) return null
  const description = clip(raw?.description, FRAMEWORK_LIMITS.maxDescriptionLen)
  const tasks = (Array.isArray(raw?.tasks) ? raw.tasks : [])
    .map(normalizeTask)
    .filter(Boolean) as FrameworkTaskDraft[]
  return {
    title,
    description: description || null,
    tasks: tasks.slice(0, FRAMEWORK_LIMITS.maxChildrenPerRoot),
  }
}

/** Strict normalize + enforce depth/count limits. Drops invalid nodes. */
export function normalizeFrameworkDraft(raw: any): FrameworkDraft {
  const title = clip(raw?.title, FRAMEWORK_LIMITS.maxTitleLen) || '未命名項目'
  const note = clip(raw?.note, FRAMEWORK_LIMITS.maxDescriptionLen)
  const statusRaw = String(raw?.status || 'PLANNING').toUpperCase()
  const status: 'PLANNING' | 'ACTIVE' = statusRaw === 'ACTIVE' ? 'ACTIVE' : 'PLANNING'

  const sectionsIn = Array.isArray(raw?.sections) ? raw.sections : []
  const sections: FrameworkRootSectionDraft[] = []
  let taskCount = 0

  for (const sec of sectionsIn.slice(0, FRAMEWORK_LIMITS.maxRoots)) {
    const rootTitle = clip(sec?.title, FRAMEWORK_LIMITS.maxTitleLen)
    if (!rootTitle) continue
    const description = clip(sec?.description, FRAMEWORK_LIMITS.maxDescriptionLen)
    const rootTasks: FrameworkTaskDraft[] = []
    for (const task of Array.isArray(sec?.tasks) ? sec.tasks : []) {
      if (taskCount >= FRAMEWORK_LIMITS.maxTasksTotal) break
      const normalized = normalizeTask(task)
      if (!normalized) continue
      rootTasks.push(normalized)
      taskCount += 1
    }

    const children: FrameworkChildSectionDraft[] = []
    for (const child of (Array.isArray(sec?.children) ? sec.children : []).slice(
      0,
      FRAMEWORK_LIMITS.maxChildrenPerRoot
    )) {
      const normalizedChild = normalizeChild(child)
      if (!normalizedChild) continue
      const keptTasks: FrameworkTaskDraft[] = []
      for (const task of normalizedChild.tasks) {
        if (taskCount >= FRAMEWORK_LIMITS.maxTasksTotal) break
        keptTasks.push(task)
        taskCount += 1
      }
      children.push({ ...normalizedChild, tasks: keptTasks })
    }

    sections.push({
      title: rootTitle,
      description: description || null,
      tasks: rootTasks,
      children,
    })
  }

  const uncategorizedTasks: FrameworkTaskDraft[] = []
  for (const task of Array.isArray(raw?.uncategorizedTasks) ? raw.uncategorizedTasks : []) {
    if (taskCount >= FRAMEWORK_LIMITS.maxTasksTotal) break
    const normalized = normalizeTask(task)
    if (!normalized) continue
    uncategorizedTasks.push(normalized)
    taskCount += 1
  }

  return {
    title,
    note: note || null,
    status,
    sections,
    uncategorizedTasks,
  }
}

export function countFrameworkTasks(draft: FrameworkDraft) {
  let n = draft.uncategorizedTasks.length
  for (const root of draft.sections) {
    n += root.tasks.length
    for (const child of root.children) n += child.tasks.length
  }
  return n
}

export function validateFrameworkDraft(draft: FrameworkDraft): string | null {
  if (!draft.title.trim()) return 'title'
  if (draft.sections.length > FRAMEWORK_LIMITS.maxRoots) return 'roots'
  for (const root of draft.sections) {
    if (!root.title.trim()) return 'sectionTitle'
    if (root.children.length > FRAMEWORK_LIMITS.maxChildrenPerRoot) return 'children'
    for (const child of root.children) {
      if (!child.title.trim()) return 'childTitle'
      for (const task of child.tasks) {
        if (!task.title.trim()) return 'taskTitle'
      }
    }
    for (const task of root.tasks) {
      if (!task.title.trim()) return 'taskTitle'
    }
  }
  for (const task of draft.uncategorizedTasks) {
    if (!task.title.trim()) return 'taskTitle'
  }
  if (countFrameworkTasks(draft) > FRAMEWORK_LIMITS.maxTasksTotal) return 'tasks'
  return null
}

export const FRAMEWORK_JSON_SCHEMA_HINT = `{
  "title": "string",
  "note": "string|null",
  "status": "PLANNING|ACTIVE",
  "sections": [
    {
      "title": "string",
      "description": "string|null",
      "tasks": [{ "title": "string", "content": "string|null" }],
      "children": [
        {
          "title": "string",
          "description": "string|null",
          "tasks": [{ "title": "string", "content": "string|null" }]
        }
      ]
    }
  ],
  "uncategorizedTasks": [{ "title": "string", "content": "string|null" }]
}`
