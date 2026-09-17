'use server'

import prisma from '@/lib/prisma'
import { getSession } from './auth'
import { getPluginFlags } from './settings'
import { getRecurringReminderItems } from './recurring'

export type ReminderBucket = 'overdue' | 'today' | 'upcoming'

export type ReminderItem = {
  id: string
  title: string
  targetDate: string
  bucket: ReminderBucket
  daysDiff: number
  reminderDays: number
  href: string
}

function getDaysDiff(dateValue: Date) {
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const target = new Date(dateValue)
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  return Math.ceil((targetDay.getTime() - startOfToday.getTime()) / 86400000)
}

function getReminderBucket(daysDiff: number, reminderDays: number): ReminderBucket | null {
  if (daysDiff < 0) return 'overdue'
  if (daysDiff === 0) return 'today'
  if (daysDiff <= reminderDays) return 'upcoming'
  return null
}

function sortReminderItems(items: ReminderItem[]) {
  const bucketOrder: Record<ReminderBucket, number> = {
    overdue: 0,
    today: 1,
    upcoming: 2,
  }

  return items.sort((a, b) => {
    if (bucketOrder[a.bucket] !== bucketOrder[b.bucket]) {
      return bucketOrder[a.bucket] - bucketOrder[b.bucket]
    }
    return a.daysDiff - b.daysDiff
  })
}

export async function getContractReminderItems() {
  try {
    const session = await getSession()
    if (!session?.isAdmin) return []

    const flags = await getPluginFlags()
    if (!flags.contracts) return []

    const contracts = await prisma.contract.findMany({
      orderBy: [{ expiryDate: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        expiryDate: true,
        reminderDays: true,
      },
    })

    const items = contracts
      .map((contract) => {
        const daysDiff = getDaysDiff(contract.expiryDate)
        const bucket = getReminderBucket(daysDiff, contract.reminderDays)
        if (!bucket) return null

        return {
          id: contract.id,
          title: contract.title,
          targetDate: contract.expiryDate.toISOString(),
          bucket,
          daysDiff,
          reminderDays: contract.reminderDays,
          href: '/contracts',
        } satisfies ReminderItem
      })
      .filter(Boolean) as ReminderItem[]

    return sortReminderItems(items)
  } catch (_e) {
    // Graceful degradation: if the DB is missing the new column (reminderDays) because
    // migration hasn't been applied yet, return an empty list instead of crashing SSR.
    return []
  }
}

export async function getActivityReminderItems() {
  try {
    const session = await getSession()
    if (!session) return []

    const flags = await getPluginFlags()
    if (!flags.matters) return []

    const activities = await prisma.activity.findMany({
      where: {
        OR: [{ visibility: 'PUBLIC' }, { userId: session.userId }],
      },
      orderBy: [{ eventDate: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        eventDate: true,
        reminderDays: true,
      },
    })

    const items = activities
      .map((activity) => {
        const daysDiff = getDaysDiff(activity.eventDate)
        const bucket = getReminderBucket(daysDiff, activity.reminderDays)
        if (!bucket) return null

        return {
          id: activity.id,
          title: activity.title,
          targetDate: activity.eventDate.toISOString(),
          bucket,
          daysDiff,
          reminderDays: activity.reminderDays,
          href: '/activities',
        } satisfies ReminderItem
      })
      .filter(Boolean) as ReminderItem[]

    return sortReminderItems(items)
  } catch (_e) {
    // Graceful degradation: see note in getContractReminderItems.
    return []
  }
}

export async function getReminderOverview() {
  try {
    const flags = await getPluginFlags()
    const [contracts, activities, recurring] = await Promise.all([
      flags.contracts ? getContractReminderItems() : Promise.resolve([] as ReminderItem[]),
      flags.matters ? getActivityReminderItems() : Promise.resolve([] as ReminderItem[]),
      flags.recurring ? getRecurringReminderItems() : Promise.resolve([] as ReminderItem[]),
    ])

    return {
      contracts,
      activities,
      recurring: recurring as ReminderItem[],
      contractCount: contracts.length,
      activityCount: activities.length,
      recurringCount: (recurring as ReminderItem[]).length,
    }
  } catch (_e) {
    return {
      contracts: [],
      activities: [],
      recurring: [],
      contractCount: 0,
      activityCount: 0,
      recurringCount: 0,
    }
  }
}
