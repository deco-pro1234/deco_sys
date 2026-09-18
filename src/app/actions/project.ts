'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from './auth'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'
import { getPluginFlags } from './settings'
import type { ReminderBucket, ReminderItem } from './reminder'

export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'DONE' | 'ARCHIVED'
export type ProjectTaskStatus = 'TODO' | 'DOING' | 'DONE'
export type ProjectLedgerType = 'INCOME' | 'EXPENSE'

const projectInclude = {
  owner: { select: { id: true, roleName: true, email: true } },
  members: {
    include: {
      user: { select: { id: true, roleName: true, email: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  tasks: {
    orderBy: [{ status: 'asc' as const }, { dueDate: 'asc' as const }, { createdAt: 'desc' as const }],
    include: {
      createdBy: { select: { id: true, roleName: true } },
      assignee: { select: { id: true, roleName: true } },
    },
  },
  ledger: {
    orderBy: [{ date: 'desc' as const }, { createdAt: 'desc' as const }],
    include: {
      createdBy: { select: { id: true, roleName: true } },
    },
  },
  memos: {
    orderBy: { createdAt: 'desc' as const },
    include: { author: { select: { roleName: true } } },
  },
  attachments: {
    orderBy: { createdAt: 'desc' as const },
    include: { uploader: { select: { roleName: true } } },
  },
}

async function assertProjectsEnabled() {
  const flags = await getPluginFlags()
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  if (!flags.projects) {
    throw new Error(t('pluginDisabled'))
  }
}

async function requireSession() {
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  const session = await getSession()
  if (!session) throw new Error(t('notLoggedIn'))
  return session
}

async function getMembership(projectId: string, userId: string) {
  return prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  })
}

async function assertCanViewProject(projectId: string) {
  const session = await requireSession()
  await assertProjectsEnabled()
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  if (!project) throw new Error(t('projectNotFound'))

  if (session.isAdmin) return { session, project, role: 'ADMIN' as const }

  const membership = await getMembership(projectId, session.userId)
  if (!membership && project.ownerId !== session.userId) {
    throw new Error(t('unauthorized'))
  }
  return {
    session,
    project,
    role: (membership?.role || (project.ownerId === session.userId ? 'OWNER' : 'MEMBER')) as
      | 'OWNER'
      | 'MEMBER',
  }
}

async function assertCanManageProject(projectId: string) {
  const ctx = await assertCanViewProject(projectId)
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  if (!ctx.session.isAdmin) {
    throw new Error(t('adminPermissionRequired'))
  }
  return ctx
}

async function assertProjectMember(projectId: string) {
  const ctx = await assertCanViewProject(projectId)
  return ctx
}

function revalidateProjects(projectId?: string) {
  revalidatePath('/projects')
  if (projectId) revalidatePath(`/projects/${projectId}`)
}

export async function getProjects() {
  const session = await getSession()
  if (!session) return []
  await assertProjectsEnabled()

  const where = session.isAdmin
    ? {}
    : {
        OR: [
          { ownerId: session.userId },
          { members: { some: { userId: session.userId } } },
        ],
      }

  const projects = await prisma.project.findMany({
    where,
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    include: {
      owner: { select: { id: true, roleName: true } },
      members: {
        include: { user: { select: { id: true, roleName: true } } },
      },
      _count: { select: { tasks: true, ledger: true } },
      ledger: { select: { type: true, amount: true } },
      tasks: {
        where: { status: { not: 'DONE' } },
        select: { id: true, dueDate: true, reminderDays: true, status: true },
      },
    },
  })

  return projects.map((p) => {
    const income = p.ledger
      .filter((e) => e.type === 'INCOME')
      .reduce((s, e) => s + e.amount, 0)
    const expense = p.ledger
      .filter((e) => e.type === 'EXPENSE')
      .reduce((s, e) => s + e.amount, 0)
    const { ledger: _ledger, ...rest } = p
    return {
      ...rest,
      ledgerSummary: {
        incomeHkd: income,
        expenseHkd: expense,
        balanceHkd: income - expense,
      },
    }
  })
}

export async function getProjectDetail(projectId: string) {
  await assertCanViewProject(projectId)
  return prisma.project.findUnique({
    where: { id: projectId },
    include: projectInclude,
  })
}

export async function getProjectMemberCandidates() {
  const session = await requireSession()
  if (!session.isAdmin) return []
  return prisma.user.findMany({
    orderBy: { roleName: 'asc' },
    select: { id: true, roleName: true, email: true, isAdmin: true },
  })
}

export async function createProject(input: {
  title: string
  status?: ProjectStatus
  startDate?: string | null
  endDate?: string | null
  reminderDays?: number
  note?: string
  memberIds?: string[]
}) {
  try {
    const session = await requireSession()
    await assertProjectsEnabled()
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    if (!session.isAdmin) return { success: false, error: t('adminPermissionRequired') }

    const title = String(input.title || '').trim()
    if (!title) return { success: false, error: t('projectTitleRequired') }

    const memberIds = Array.from(
      new Set([session.userId, ...(input.memberIds || []).filter(Boolean)])
    )

    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          title,
          status: input.status || 'PLANNING',
          startDate: input.startDate ? new Date(input.startDate) : null,
          endDate: input.endDate ? new Date(input.endDate) : null,
          reminderDays: Number(input.reminderDays ?? 15) || 15,
          note: input.note?.trim() || null,
          ownerId: session.userId,
        },
      })

      await tx.projectMember.createMany({
        data: memberIds.map((userId) => ({
          projectId: created.id,
          userId,
          role: userId === session.userId ? 'OWNER' : 'MEMBER',
        })),
        skipDuplicates: true,
      })

      return created
    })

    revalidateProjects(project.id)
    return { success: true, id: project.id }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function updateProject(
  projectId: string,
  input: {
    title: string
    status: ProjectStatus
    startDate?: string | null
    endDate?: string | null
    reminderDays?: number
    note?: string
  }
) {
  try {
    await assertCanManageProject(projectId)
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    const title = String(input.title || '').trim()
    if (!title) return { success: false, error: t('projectTitleRequired') }

    await prisma.project.update({
      where: { id: projectId },
      data: {
        title,
        status: input.status,
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
        reminderDays: Number(input.reminderDays ?? 15) || 15,
        note: input.note?.trim() || null,
      },
    })
    revalidateProjects(projectId)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function deleteProject(projectId: string) {
  try {
    await assertCanManageProject(projectId)
    await prisma.project.delete({ where: { id: projectId } })
    revalidateProjects()
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function setProjectMembers(projectId: string, memberIds: string[]) {
  try {
    const { project } = await assertCanManageProject(projectId)
    const unique = Array.from(new Set([project.ownerId, ...memberIds.filter(Boolean)]))

    await prisma.$transaction(async (tx) => {
      await tx.projectMember.deleteMany({
        where: {
          projectId,
          userId: { notIn: unique },
        },
      })
      for (const userId of unique) {
        await tx.projectMember.upsert({
          where: { projectId_userId: { projectId, userId } },
          update: { role: userId === project.ownerId ? 'OWNER' : 'MEMBER' },
          create: {
            projectId,
            userId,
            role: userId === project.ownerId ? 'OWNER' : 'MEMBER',
          },
        })
      }
    })

    revalidateProjects(projectId)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function createProjectTask(
  projectId: string,
  input: {
    title: string
    status?: ProjectTaskStatus
    dueDate?: string | null
    reminderDays?: number
    note?: string
    assigneeId?: string | null
  }
) {
  try {
    const { session } = await assertProjectMember(projectId)
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    const title = String(input.title || '').trim()
    if (!title) return { success: false, error: t('projectTaskTitleRequired') }

    await prisma.projectTask.create({
      data: {
        projectId,
        title,
        status: input.status || 'TODO',
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        reminderDays: Number(input.reminderDays ?? 7) || 7,
        note: input.note?.trim() || null,
        assigneeId: input.assigneeId || null,
        createdById: session.userId,
      },
    })
    revalidateProjects(projectId)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function updateProjectTask(
  taskId: string,
  input: {
    title: string
    status: ProjectTaskStatus
    dueDate?: string | null
    reminderDays?: number
    note?: string
    assigneeId?: string | null
  }
) {
  try {
    const task = await prisma.projectTask.findUnique({ where: { id: taskId } })
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    if (!task) return { success: false, error: t('projectTaskNotFound') }
    await assertProjectMember(task.projectId)

    const title = String(input.title || '').trim()
    if (!title) return { success: false, error: t('projectTaskTitleRequired') }

    await prisma.projectTask.update({
      where: { id: taskId },
      data: {
        title,
        status: input.status,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        reminderDays: Number(input.reminderDays ?? 7) || 7,
        note: input.note?.trim() || null,
        assigneeId: input.assigneeId || null,
      },
    })
    revalidateProjects(task.projectId)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function deleteProjectTask(taskId: string) {
  try {
    const task = await prisma.projectTask.findUnique({ where: { id: taskId } })
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    if (!task) return { success: false, error: t('projectTaskNotFound') }
    await assertProjectMember(task.projectId)
    await prisma.projectTask.delete({ where: { id: taskId } })
    revalidateProjects(task.projectId)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function createProjectLedgerEntry(
  projectId: string,
  input: {
    type: ProjectLedgerType
    amount: number
    date: string
    note?: string
  }
) {
  try {
    const { session } = await assertProjectMember(projectId)
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    const amount = Math.abs(Number(input.amount))
    if (!amount || Number.isNaN(amount)) {
      return { success: false, error: t('projectLedgerAmountRequired') }
    }
    if (input.type !== 'INCOME' && input.type !== 'EXPENSE') {
      return { success: false, error: t('projectLedgerTypeInvalid') }
    }

    await prisma.projectLedgerEntry.create({
      data: {
        projectId,
        type: input.type,
        amount,
        date: new Date(input.date),
        note: input.note?.trim() || null,
        createdById: session.userId,
      },
    })
    revalidateProjects(projectId)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function deleteProjectLedgerEntry(entryId: string) {
  try {
    const entry = await prisma.projectLedgerEntry.findUnique({ where: { id: entryId } })
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    if (!entry) return { success: false, error: t('projectLedgerNotFound') }
    await assertProjectMember(entry.projectId)
    await prisma.projectLedgerEntry.delete({ where: { id: entryId } })
    revalidateProjects(entry.projectId)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function addProjectMemo(projectId: string, content: string) {
  try {
    const { session } = await assertProjectMember(projectId)
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    const text = String(content || '').trim()
    if (!text) return { success: false, error: t('memoRequired') }

    await prisma.memo.create({
      data: {
        content: text,
        authorId: session.userId,
        projectId,
      },
    })
    revalidateProjects(projectId)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
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

export async function getProjectReminderItems(): Promise<ReminderItem[]> {
  try {
    const session = await getSession()
    if (!session) return []
    const flags = await getPluginFlags()
    if (!flags.projects) return []

    const where = session.isAdmin
      ? {}
      : {
          OR: [
            { ownerId: session.userId },
            { members: { some: { userId: session.userId } } },
          ],
        }

    const projects = await prisma.project.findMany({
      where: {
        ...where,
        status: { in: ['PLANNING', 'ACTIVE'] },
      },
      select: {
        id: true,
        title: true,
        endDate: true,
        reminderDays: true,
        tasks: {
          where: { status: { not: 'DONE' }, dueDate: { not: null } },
          select: {
            id: true,
            title: true,
            dueDate: true,
            reminderDays: true,
          },
        },
      },
    })

    const items: ReminderItem[] = []

    for (const project of projects) {
      if (project.endDate) {
        const daysDiff = getDaysDiff(project.endDate)
        const bucket = getReminderBucket(daysDiff, project.reminderDays)
        if (bucket) {
          items.push({
            id: `project-${project.id}`,
            title: project.title,
            targetDate: project.endDate.toISOString(),
            bucket,
            daysDiff,
            reminderDays: project.reminderDays,
            href: `/projects/${project.id}`,
          })
        }
      }
      for (const task of project.tasks) {
        if (!task.dueDate) continue
        const daysDiff = getDaysDiff(task.dueDate)
        const bucket = getReminderBucket(daysDiff, task.reminderDays)
        if (!bucket) continue
        items.push({
          id: `task-${task.id}`,
          title: `${project.title} · ${task.title}`,
          targetDate: task.dueDate.toISOString(),
          bucket,
          daysDiff,
          reminderDays: task.reminderDays,
          href: `/projects/${project.id}`,
        })
      }
    }

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
  } catch {
    return []
  }
}
