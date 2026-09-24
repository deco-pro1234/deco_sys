import type { ReminderBucket, ReminderItem } from '@/app/actions/reminder'

export type ReminderUrgencyFilter = 'action' | 'upcoming' | 'all'

export type ProjectReminderGroup = {
  projectId: string
  projectTitle: string
  href: string
  items: ReminderItem[]
  counts: { overdue: number; today: number; upcoming: number; total: number }
}

const BUCKET_ORDER: Record<ReminderBucket, number> = {
  overdue: 0,
  today: 1,
  upcoming: 2,
}

export function filterRemindersByUrgency(
  items: ReminderItem[],
  filter: ReminderUrgencyFilter
): ReminderItem[] {
  if (filter === 'all') return items
  if (filter === 'action') {
    return items.filter((i) => i.bucket === 'overdue' || i.bucket === 'today')
  }
  return items.filter((i) => i.bucket === 'upcoming')
}

export function countReminderBuckets(items: ReminderItem[]) {
  return {
    overdue: items.filter((i) => i.bucket === 'overdue').length,
    today: items.filter((i) => i.bucket === 'today').length,
    upcoming: items.filter((i) => i.bucket === 'upcoming').length,
    action: items.filter((i) => i.bucket === 'overdue' || i.bucket === 'today').length,
    total: items.length,
  }
}

function sortItems(items: ReminderItem[]) {
  return [...items].sort((a, b) => {
    if (BUCKET_ORDER[a.bucket] !== BUCKET_ORDER[b.bucket]) {
      return BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket]
    }
    return a.daysDiff - b.daysDiff
  })
}

/** Group project reminders by projectId (fallback: parse from href). */
export function groupProjectReminders(items: ReminderItem[]): ProjectReminderGroup[] {
  const map = new Map<string, ProjectReminderGroup>()

  for (const item of items) {
    const fromHref = item.href.match(/^\/projects\/([^/?#]+)/)?.[1]
    const projectId = item.projectId || fromHref || 'unknown'
    const projectTitle =
      item.projectTitle ||
      (item.kind === 'project_start' || item.kind === 'project_end'
        ? item.title
        : item.title.includes(' · ')
          ? item.title.split(' · ')[0]
          : item.title)

    let group = map.get(projectId)
    if (!group) {
      group = {
        projectId,
        projectTitle,
        href: `/projects/${projectId}`,
        items: [],
        counts: { overdue: 0, today: 0, upcoming: 0, total: 0 },
      }
      map.set(projectId, group)
    }
    group.items.push(item)
  }

  const groups = Array.from(map.values()).map((g) => {
    const items = sortItems(g.items)
    const counts = {
      overdue: items.filter((i) => i.bucket === 'overdue').length,
      today: items.filter((i) => i.bucket === 'today').length,
      upcoming: items.filter((i) => i.bucket === 'upcoming').length,
      total: items.length,
    }
    return { ...g, items, counts }
  })

  return groups.sort((a, b) => {
    const aScore = a.counts.overdue * 1000 + a.counts.today * 10 + a.counts.upcoming
    const bScore = b.counts.overdue * 1000 + b.counts.today * 10 + b.counts.upcoming
    if (aScore !== bScore) return bScore - aScore
    return a.projectTitle.localeCompare(b.projectTitle, 'zh-HK')
  })
}
