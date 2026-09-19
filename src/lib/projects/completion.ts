/** Task status → display completion percent. Project is complete only when all are DONE. */
export function taskCompletionPercent(status: string): number {
  if (status === 'DONE') return 100
  if (status === 'DOING') return 50
  return 0
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
}

export function computeProjectCompletion(
  tasks: Array<{ status: string }>
): ProjectCompletionStats {
  const total = tasks.length
  let done = 0
  let doing = 0
  let todo = 0
  let sum = 0
  for (const task of tasks) {
    const p = taskCompletionPercent(task.status)
    sum += p
    if (task.status === 'DONE') done += 1
    else if (task.status === 'DOING') doing += 1
    else todo += 1
  }
  const percent = total === 0 ? 0 : Math.round(sum / total)
  return {
    total,
    done,
    doing,
    todo,
    percent,
    isComplete: total > 0 && done === total,
  }
}
