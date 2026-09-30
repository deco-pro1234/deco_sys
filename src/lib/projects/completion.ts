export type ChecklistDoneFlag = { done: boolean }

/** Checklist → display completion percent (0 when empty). */
export function checklistCompletionPercent(items: ChecklistDoneFlag[]): number {
  const total = items.length
  if (total === 0) return 0
  const done = items.filter((item) => item.done).length
  return Math.round((done / total) * 100)
}

export function statusFromChecklistPercent(percent: number): 'TODO' | 'DOING' | 'DONE' {
  if (percent >= 100) return 'DONE'
  if (percent > 0) return 'DOING'
  return 'TODO'
}

export type TaskCompletionInput = {
  status: string
  checklistItems?: ChecklistDoneFlag[] | null
}

/**
 * Prefer checklist ratio when the task has items; otherwise fall back to
 * legacy status mapping (TODO 0 / DOING 50 / DONE 100).
 */
export function taskCompletionPercent(task: TaskCompletionInput | string): number {
  if (typeof task === 'string') {
    if (task === 'DONE') return 100
    if (task === 'DOING') return 50
    return 0
  }
  const items = task.checklistItems
  if (items && items.length > 0) {
    return checklistCompletionPercent(items)
  }
  if (task.status === 'DONE') return 100
  if (task.status === 'DOING') return 50
  return 0
}

export function deriveTaskStatusFromChecklist(
  items: ChecklistDoneFlag[],
  fallbackStatus: string
): 'TODO' | 'DOING' | 'DONE' {
  if (items.length === 0) {
    if (fallbackStatus === 'DONE' || fallbackStatus === 'DOING' || fallbackStatus === 'TODO') {
      return fallbackStatus
    }
    return 'TODO'
  }
  return statusFromChecklistPercent(checklistCompletionPercent(items))
}

export type ProjectCompletionStats = {
  total: number
  done: number
  doing: number
  todo: number
  /** Average of per-task percents (0–100). */
  percent: number
  /** True when every task is DONE (and there is at least one task). */
  isComplete: boolean
  checklistTotal?: number
  checklistDone?: number
  checklistPercent?: number
}

export function computeProjectCompletion(
  tasks: Array<TaskCompletionInput>,
  projectChecklist?: ChecklistDoneFlag[] | null
): ProjectCompletionStats {
  const total = tasks.length
  let done = 0
  let doing = 0
  let todo = 0
  let sum = 0
  for (const task of tasks) {
    const p = taskCompletionPercent(task)
    sum += p
    const status =
      task.checklistItems && task.checklistItems.length > 0
        ? statusFromChecklistPercent(p)
        : task.status
    if (status === 'DONE') done += 1
    else if (status === 'DOING') doing += 1
    else todo += 1
  }

  const checklist = projectChecklist || []
  const checklistTotal = checklist.length
  const checklistDone = checklist.filter((item) => item.done).length
  const checklistPercent = checklistCompletionPercent(checklist)

  // When the project has its own checklist, fold it into the average as one more unit.
  const units = total + (checklistTotal > 0 ? 1 : 0)
  const percent =
    units === 0
      ? 0
      : Math.round((sum + (checklistTotal > 0 ? checklistPercent : 0)) / units)

  const tasksComplete = total > 0 && done === total
  const checklistComplete = checklistTotal === 0 || checklistDone === checklistTotal
  const isComplete =
    (total > 0 || checklistTotal > 0) &&
    (total === 0 || tasksComplete) &&
    checklistComplete

  return {
    total,
    done,
    doing,
    todo,
    percent,
    isComplete,
    checklistTotal,
    checklistDone,
    checklistPercent,
  }
}
