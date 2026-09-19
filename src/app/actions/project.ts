'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession, hashPassword } from './auth'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'
import { getPluginFlags } from './settings'
import type { ReminderBucket, ReminderItem } from './reminder'
import {
  ACCOUNT_KIND_PROJECT_TEMP,
  ACCOUNT_KIND_STANDARD,
} from '@/lib/access'
import { normalizeContactPhoneInput } from '@/lib/whatsapp/phoneSync'
import { randomUUID } from 'crypto'

export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'DONE' | 'ARCHIVED'
export type ProjectTaskStatus = 'TODO' | 'DOING' | 'DONE'
export type ProjectLedgerType = 'INCOME' | 'EXPENSE'
export type ProjectAccessMode = 'full' | 'temp'

export type TaskAccessGrantInput = {
  taskId: string
  canView: boolean
  canAddMemo: boolean
  expiresAt?: string | null
}

type TaskGrantRow = {
  id: string
  taskId: string
  userId: string
  canView: boolean
  canAddMemo: boolean
  expiresAt: Date | null
}

const taskDetailInclude = {
  createdBy: { select: { id: true, roleName: true } },
  assignee: { select: { id: true, roleName: true } },
  assignees: {
    include: { user: { select: { id: true, roleName: true, email: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  memos: {
    orderBy: { createdAt: 'desc' as const },
    include: {
      author: { select: { roleName: true } },
      attachments: {
        orderBy: { createdAt: 'desc' as const },
        include: { uploader: { select: { roleName: true } } },
      },
    },
  },
  attachments: {
    orderBy: { createdAt: 'desc' as const },
    include: { uploader: { select: { roleName: true } } },
  },
}

const projectInclude = {
  owner: { select: { id: true, roleName: true, email: true } },
  members: {
    include: {
      user: { select: { id: true, roleName: true, email: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  sections: {
    where: { parentId: null },
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    include: {
      children: {
        orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
      },
    },
  },
  tasks: {
    orderBy: [
      { sortOrder: 'asc' as const },
      { status: 'asc' as const },
      { dueDate: 'asc' as const },
      { createdAt: 'desc' as const },
    ],
    include: {
      ...taskDetailInclude,
      section: { select: { id: true, title: true, parentId: true } },
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

async function assertValidTaskSection(projectId: string, sectionId: string | null | undefined) {
  if (!sectionId) return null
  const section = await prisma.projectSection.findUnique({ where: { id: sectionId } })
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  if (!section || section.projectId !== projectId) {
    throw new Error(t('projectSectionNotFound'))
  }
  return section
}

function isGrantActive(expiresAt?: Date | null) {
  if (!expiresAt) return true
  return expiresAt.getTime() > Date.now()
}

function activeTaskAccessWhere(userId: string) {
  return {
    userId,
    canView: true,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  }
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

async function listActiveTaskGrants(projectId: string, userId: string): Promise<TaskGrantRow[]> {
  const rows = await prisma.projectTaskAccess.findMany({
    where: {
      projectId,
      ...activeTaskAccessWhere(userId),
    },
    select: {
      id: true,
      taskId: true,
      userId: true,
      canView: true,
      canAddMemo: true,
      expiresAt: true,
    },
  })
  return rows.filter((row) => isGrantActive(row.expiresAt))
}

async function assertCanViewProject(projectId: string) {
  const session = await requireSession()
  await assertProjectsEnabled()
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  if (!project) throw new Error(t('projectNotFound'))

  if (session.isAdmin) {
    return {
      session,
      project,
      role: 'ADMIN' as const,
      accessMode: 'full' as const,
      taskGrants: [] as TaskGrantRow[],
      canManageTempAccess: true,
      canManageProject: true,
    }
  }

  const membership = await getMembership(projectId, session.userId)
  const isOwner = project.ownerId === session.userId || membership?.role === 'OWNER'
  if (membership || project.ownerId === session.userId) {
    return {
      session,
      project,
      role: (membership?.role || (isOwner ? 'OWNER' : 'MEMBER')) as 'OWNER' | 'MEMBER',
      accessMode: 'full' as const,
      taskGrants: [] as TaskGrantRow[],
      canManageTempAccess: isOwner || session.isAdmin,
      canManageProject: false,
    }
  }

  const taskGrants = await listActiveTaskGrants(projectId, session.userId)
  if (taskGrants.length === 0) {
    throw new Error(t('unauthorized'))
  }

  return {
    session,
    project,
    role: 'TEMP' as const,
    accessMode: 'temp' as const,
    taskGrants,
    canManageTempAccess: false,
    canManageProject: false,
  }
}

async function assertCanManageProject(projectId: string) {
  const ctx = await assertCanViewProject(projectId)
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  if (!ctx.canManageProject) {
    throw new Error(t('adminPermissionRequired'))
  }
  return ctx
}

async function assertCanManageTempAccess(projectId: string) {
  const ctx = await assertCanViewProject(projectId)
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  if (ctx.accessMode !== 'full' || !ctx.canManageTempAccess) {
    throw new Error(t('unauthorized'))
  }
  return ctx
}

/** Full project member (not temporary task-scoped access). */
async function assertProjectMember(projectId: string) {
  const ctx = await assertCanViewProject(projectId)
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  if (ctx.accessMode !== 'full') {
    throw new Error(t('unauthorized'))
  }
  return ctx
}

async function assertCanAddTaskMemo(taskId: string) {
  const task = await prisma.projectTask.findUnique({ where: { id: taskId } })
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  if (!task) throw new Error(t('projectTaskNotFound'))

  const session = await requireSession()
  await assertProjectsEnabled()

  if (session.isAdmin) {
    return { session, task }
  }

  const membership = await getMembership(task.projectId, session.userId)
  const project = await prisma.project.findUnique({ where: { id: task.projectId } })
  if (!project) throw new Error(t('projectNotFound'))
  if (membership || project.ownerId === session.userId) {
    return { session, task }
  }

  const grant = await prisma.projectTaskAccess.findUnique({
    where: { taskId_userId: { taskId, userId: session.userId } },
  })
  if (
    !grant ||
    !grant.canView ||
    !grant.canAddMemo ||
    !isGrantActive(grant.expiresAt) ||
    grant.projectId !== task.projectId
  ) {
    throw new Error(t('unauthorized'))
  }
  return { session, task }
}

function revalidateProjects(projectId?: string) {
  revalidatePath('/projects')
  if (projectId) revalidatePath(`/projects/${projectId}`)
}

export async function getProjects() {
  const session = await getSession()
  if (!session) return []
  await assertProjectsEnabled()

  const now = new Date()
  const where = session.isAdmin
    ? {}
    : {
        OR: [
          { ownerId: session.userId },
          { members: { some: { userId: session.userId } } },
          {
            taskAccesses: {
              some: {
                userId: session.userId,
                canView: true,
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
              },
            },
          },
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
      taskAccesses: session.isAdmin
        ? false
        : {
            where: {
              userId: session.userId,
              canView: true,
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            select: { taskId: true },
          },
    },
  })

  return projects.map((p) => {
    const isFull =
      session.isAdmin ||
      p.ownerId === session.userId ||
      p.members.some((m) => m.userId === session.userId)
    const accessMode: ProjectAccessMode = isFull ? 'full' : 'temp'
    const grantedTaskIds = new Set(
      Array.isArray(p.taskAccesses) ? p.taskAccesses.map((g) => g.taskId) : []
    )

    const income = isFull
      ? p.ledger.filter((e) => e.type === 'INCOME').reduce((s, e) => s + e.amount, 0)
      : 0
    const expense = isFull
      ? p.ledger.filter((e) => e.type === 'EXPENSE').reduce((s, e) => s + e.amount, 0)
      : 0
    const { ledger: _ledger, taskAccesses: _taskAccesses, ...rest } = p
    const taskCount = isFull
      ? p._count.tasks
      : Array.isArray(p.taskAccesses)
        ? p.taskAccesses.length
        : 0
    const openTasks = isFull
      ? p.tasks
      : p.tasks.filter((task) => grantedTaskIds.has(task.id))

    return {
      ...rest,
      tasks: openTasks,
      _count: {
        tasks: taskCount,
        ledger: isFull ? p._count.ledger : 0,
      },
      members: isFull ? p.members : [],
      accessMode,
      ledgerSummary: isFull
        ? {
            incomeHkd: income,
            expenseHkd: expense,
            balanceHkd: income - expense,
          }
        : null,
    }
  })
}

export async function getProjectDetail(projectId: string) {
  const ctx = await assertCanViewProject(projectId)

  if (ctx.accessMode === 'temp') {
    const taskIds = ctx.taskGrants.map((g) => g.taskId)
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        owner: { select: { id: true, roleName: true, email: true } },
        sections: {
          where: { parentId: null },
          orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
          include: {
            children: {
              orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
            },
          },
        },
        tasks: {
          where: { id: { in: taskIds } },
          orderBy: [
            { sortOrder: 'asc' as const },
            { status: 'asc' as const },
            { dueDate: 'asc' as const },
            { createdAt: 'desc' as const },
          ],
          include: {
            ...taskDetailInclude,
            section: { select: { id: true, title: true, parentId: true } },
          },
        },
      },
    })
    if (!project) return null

    const myTaskAccess: Record<string, { canView: boolean; canAddMemo: boolean }> = {}
    for (const grant of ctx.taskGrants) {
      myTaskAccess[grant.taskId] = {
        canView: grant.canView,
        canAddMemo: grant.canAddMemo,
      }
    }

    return {
      ...project,
      members: [],
      ledger: [],
      memos: [],
      attachments: [],
      taskAccesses: [],
      accessMode: 'temp' as const,
      canManageTempAccess: false,
      canManageProject: false,
      myTaskAccess,
    }
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      ...projectInclude,
      taskAccesses: ctx.canManageTempAccess
        ? {
            orderBy: { createdAt: 'asc' as const },
            include: {
              user: { select: { id: true, roleName: true, email: true } },
              task: { select: { id: true, title: true, status: true } },
              createdBy: { select: { id: true, roleName: true } },
            },
          }
        : false,
    },
  })
  if (!project) return null

  return {
    ...project,
    taskAccesses: Array.isArray(project.taskAccesses) ? project.taskAccesses : [],
    accessMode: 'full' as const,
    canManageTempAccess: ctx.canManageTempAccess,
    canManageProject: ctx.canManageProject,
    myTaskAccess: null as Record<string, { canView: boolean; canAddMemo: boolean }> | null,
  }
}

export async function getProjectMemberCandidates() {
  const session = await requireSession()
  if (!session.isAdmin) return []
  return prisma.user.findMany({
    where: {
      accountKind: ACCOUNT_KIND_STANDARD,
      isAdmin: false,
    },
    orderBy: { roleName: 'asc' },
    select: {
      id: true,
      roleName: true,
      email: true,
      isAdmin: true,
      accountKind: true,
      loginPhone: true,
    },
  })
}

export async function getProjectTempAccountCandidates(projectId: string) {
  try {
    const session = await requireSession()
    if (!session.isAdmin) await assertCanManageTempAccess(projectId)
    else await assertProjectsEnabled()

    return prisma.user.findMany({
      where: { accountKind: ACCOUNT_KIND_PROJECT_TEMP, isAdmin: false },
      orderBy: { roleName: 'asc' },
      select: {
        id: true,
        roleName: true,
        email: true,
        isAdmin: true,
        accountKind: true,
        loginPhone: true,
      },
    })
  } catch {
    return []
  }
}

export async function createProjectTempAccount(
  projectId: string,
  input: {
    roleName: string
    password: string
    phone?: string | null
    expiresAt?: string | null
    grants: TaskAccessGrantInput[]
  }
) {
  try {
    const { session } = await assertCanManageTempAccess(projectId)
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)

    const roleName = String(input.roleName || '').trim()
    const password = String(input.password || '')
    if (!roleName) return { success: false, error: t('projectTempAccountNameRequired') }
    if (password.length < 4) return { success: false, error: t('projectTempAccountPasswordRequired') }

    const phoneNorm = normalizeContactPhoneInput(input.phone)
    if (!phoneNorm.ok) {
      return { success: false, error: phoneNorm.error || t('projectTempAccountPhoneInvalid') }
    }

    const nameTaken = await prisma.user.findFirst({
      where: { roleName: { equals: roleName, mode: 'insensitive' } },
      select: { id: true },
    })
    if (nameTaken) return { success: false, error: t('projectTempAccountNameTaken') }

    if (phoneNorm.phoneE164) {
      const phoneTaken = await prisma.user.findFirst({
        where: { loginPhone: phoneNorm.phoneE164 },
        select: { id: true },
      })
      if (phoneTaken) return { success: false, error: t('projectTempAccountPhoneTaken') }
    }

    const projectTasks = await prisma.projectTask.findMany({
      where: { projectId },
      select: { id: true },
    })
    const validTaskIds = new Set(projectTasks.map((task) => task.id))
    const defaultExpires =
      input.expiresAt && String(input.expiresAt).trim()
        ? new Date(String(input.expiresAt))
        : null
    const normalizedGrants = (input.grants || [])
      .map((grant) => {
        const taskId = String(grant.taskId || '').trim()
        const canAddMemo = Boolean(grant.canAddMemo)
        const canView = Boolean(grant.canView) || canAddMemo
        const expiresAt =
          grant.expiresAt && String(grant.expiresAt).trim()
            ? new Date(String(grant.expiresAt))
            : defaultExpires
        return {
          taskId,
          canView,
          canAddMemo,
          expiresAt:
            expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
        }
      })
      .filter((grant) => grant.taskId && validTaskIds.has(grant.taskId) && grant.canView)

    if (normalizedGrants.length === 0) {
      return { success: false, error: t('projectTempAccountGrantRequired') }
    }

    const email = `temp.${randomUUID().replace(/-/g, '')}@project-temp.local`
    const hashed = await hashPassword(password)

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          password: hashed,
          roleName,
          accountKind: ACCOUNT_KIND_PROJECT_TEMP,
          loginPhone: phoneNorm.phoneE164,
          isAdmin: false,
          poolEnabled: false,
          publicLedgerRole: 'NONE',
          ocrEnabled: false,
          privateLedgerVisibility: 'PRIVATE',
          ...(phoneNorm.phoneE164
            ? {
                profile: {
                  create: {
                    legalNameEn: roleName,
                    contactPhone: phoneNorm.phoneE164,
                  },
                },
              }
            : {}),
        },
        select: { id: true, roleName: true, loginPhone: true },
      })

      for (const grant of normalizedGrants) {
        await tx.projectTaskAccess.create({
          data: {
            projectId,
            taskId: grant.taskId,
            userId: user.id,
            canView: grant.canView,
            canAddMemo: grant.canAddMemo,
            expiresAt: grant.expiresAt,
            createdById: session.userId,
          },
        })
      }

      return user
    })

    revalidateProjects(projectId)
    return { success: true, userId: created.id }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function setUserProjectTaskAccess(
  projectId: string,
  userId: string,
  grants: TaskAccessGrantInput[]
) {
  try {
    const { session, project } = await assertCanManageTempAccess(projectId)
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)

    const targetUserId = String(userId || '').trim()
    if (!targetUserId) return { success: false, error: t('unauthorized') }

    if (targetUserId === project.ownerId) {
      return { success: false, error: t('projectTempAccessOwnerForbidden') }
    }

    const membership = await getMembership(projectId, targetUserId)
    if (membership) {
      return { success: false, error: t('projectTempAccessMemberForbidden') }
    }

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, accountKind: true, isAdmin: true },
    })
    if (!user) return { success: false, error: t('unauthorized') }
    if (user.accountKind !== ACCOUNT_KIND_PROJECT_TEMP || user.isAdmin) {
      return { success: false, error: t('projectTempAccessStaffForbidden') }
    }

    const projectTasks = await prisma.projectTask.findMany({
      where: { projectId },
      select: { id: true },
    })
    const validTaskIds = new Set(projectTasks.map((task) => task.id))

    const normalized = grants
      .map((grant) => {
        const taskId = String(grant.taskId || '').trim()
        const canAddMemo = Boolean(grant.canAddMemo)
        const canView = Boolean(grant.canView) || canAddMemo
        const expiresAt =
          grant.expiresAt && String(grant.expiresAt).trim()
            ? new Date(String(grant.expiresAt))
            : null
        return {
          taskId,
          canView,
          canAddMemo,
          expiresAt:
            expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
        }
      })
      .filter((grant) => grant.taskId && validTaskIds.has(grant.taskId) && grant.canView)

    await prisma.$transaction(async (tx) => {
      await tx.projectTaskAccess.deleteMany({
        where: { projectId, userId: targetUserId },
      })
      for (const grant of normalized) {
        await tx.projectTaskAccess.create({
          data: {
            projectId,
            taskId: grant.taskId,
            userId: targetUserId,
            canView: grant.canView,
            canAddMemo: grant.canAddMemo,
            expiresAt: grant.expiresAt,
            createdById: session.userId,
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

export async function removeUserProjectTaskAccess(projectId: string, userId: string) {
  try {
    await assertCanManageTempAccess(projectId)
    await prisma.projectTaskAccess.deleteMany({
      where: { projectId, userId },
    })
    revalidateProjects(projectId)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
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

export async function createProjectSection(
  projectId: string,
  input: { title: string; parentId?: string | null }
) {
  try {
    await assertProjectMember(projectId)
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    const title = String(input.title || '').trim()
    if (!title) return { success: false, error: t('projectSectionTitleRequired') }

    const parentId = input.parentId ? String(input.parentId) : null
    if (parentId) {
      const parent = await prisma.projectSection.findUnique({ where: { id: parentId } })
      if (!parent || parent.projectId !== projectId) {
        return { success: false, error: t('projectSectionNotFound') }
      }
      if (parent.parentId) {
        return { success: false, error: t('projectSectionDepthExceeded') }
      }
    }

    const maxSort = await prisma.projectSection.aggregate({
      where: { projectId, parentId },
      _max: { sortOrder: true },
    })

    await prisma.projectSection.create({
      data: {
        projectId,
        parentId,
        title,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    })
    revalidateProjects(projectId)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function updateProjectSection(
  sectionId: string,
  input: { title: string }
) {
  try {
    const section = await prisma.projectSection.findUnique({ where: { id: sectionId } })
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    if (!section) return { success: false, error: t('projectSectionNotFound') }
    await assertProjectMember(section.projectId)

    const title = String(input.title || '').trim()
    if (!title) return { success: false, error: t('projectSectionTitleRequired') }

    await prisma.projectSection.update({
      where: { id: sectionId },
      data: { title },
    })
    revalidateProjects(section.projectId)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function deleteProjectSection(sectionId: string) {
  try {
    const section = await prisma.projectSection.findUnique({
      where: { id: sectionId },
      include: { _count: { select: { children: true } } },
    })
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    if (!section) return { success: false, error: t('projectSectionNotFound') }
    await assertProjectMember(section.projectId)

    if (section._count.children > 0) {
      return { success: false, error: t('projectSectionHasChildren') }
    }

    await prisma.$transaction(async (tx) => {
      await tx.projectTask.updateMany({
        where: { sectionId },
        data: { sectionId: null },
      })
      await tx.projectSection.delete({ where: { id: sectionId } })
    })
    revalidateProjects(section.projectId)
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
    sectionId?: string | null
    assigneeId?: string | null
    assigneeIds?: string[]
  }
) {
  try {
    const { session } = await assertProjectMember(projectId)
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    const title = String(input.title || '').trim()
    if (!title) return { success: false, error: t('projectTaskTitleRequired') }

    const sectionId =
      input.sectionId === undefined ? null : input.sectionId ? String(input.sectionId) : null
    await assertValidTaskSection(projectId, sectionId)

    const assigneeIds = Array.from(
      new Set(
        [
          ...(input.assigneeIds || []),
          ...(input.assigneeId ? [input.assigneeId] : []),
        ].filter(Boolean)
      )
    )

    await prisma.$transaction(async (tx) => {
      const created = await tx.projectTask.create({
        data: {
          projectId,
          sectionId,
          title,
          status: input.status || 'TODO',
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          reminderDays: Number(input.reminderDays ?? 7) || 7,
          note: input.note?.trim() || null,
          assigneeId: assigneeIds[0] || null,
          createdById: session.userId,
        },
      })

      if (assigneeIds.length > 0) {
        await tx.projectTaskAssignee.createMany({
          data: assigneeIds.map((userId) => ({
            taskId: created.id,
            userId,
          })),
          skipDuplicates: true,
        })
      }
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
    sectionId?: string | null
    assigneeId?: string | null
    assigneeIds?: string[]
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

    if (input.sectionId !== undefined) {
      await assertValidTaskSection(
        task.projectId,
        input.sectionId ? String(input.sectionId) : null
      )
    }

    const assigneeIds =
      input.assigneeIds !== undefined
        ? Array.from(new Set(input.assigneeIds.filter(Boolean)))
        : input.assigneeId
          ? [input.assigneeId]
          : undefined

    await prisma.$transaction(async (tx) => {
      await tx.projectTask.update({
        where: { id: taskId },
        data: {
          title,
          status: input.status,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          reminderDays: Number(input.reminderDays ?? 7) || 7,
          note: input.note?.trim() || null,
          ...(input.sectionId !== undefined
            ? { sectionId: input.sectionId ? String(input.sectionId) : null }
            : {}),
          ...(assigneeIds
            ? { assigneeId: assigneeIds[0] || null }
            : input.assigneeId !== undefined
              ? { assigneeId: input.assigneeId || null }
              : {}),
        },
      })

      if (assigneeIds) {
        if (assigneeIds.length === 0) {
          await tx.projectTaskAssignee.deleteMany({ where: { taskId } })
        } else {
          await tx.projectTaskAssignee.deleteMany({
            where: {
              taskId,
              userId: { notIn: assigneeIds },
            },
          })
          for (const userId of assigneeIds) {
            await tx.projectTaskAssignee.upsert({
              where: { taskId_userId: { taskId, userId } },
              update: {},
              create: { taskId, userId },
            })
          }
        }
      }
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

type AttachmentPayload = {
  url: string
  size: number
  note?: string
}

export async function addProjectTaskMemo(
  taskId: string,
  input: {
    content: string
    attachments?: AttachmentPayload[]
  }
) {
  try {
    const { session, task } = await assertCanAddTaskMemo(taskId)
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)

    const text = String(input.content || '').trim()
    const attachments = input.attachments || []
    if (!text && attachments.length === 0) {
      return { success: false, error: t('memoRequired') }
    }

    await prisma.$transaction(async (tx) => {
      const memo = await tx.memo.create({
        data: {
          content: text || t('projectTaskAttachmentMemo'),
          authorId: session.userId,
          projectId: task.projectId,
          projectTaskId: taskId,
        },
      })

      for (const item of attachments) {
        if (!item?.url) continue
        await tx.attachment.create({
          data: {
            fileUrl: item.url,
            size: Number(item.size) || 0,
            note: item.note || null,
            uploaderId: session.userId,
            projectId: task.projectId,
            projectTaskId: taskId,
            memoId: memo.id,
          },
        })
      }
    })

    revalidateProjects(task.projectId)
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

    const now = new Date()
    const where = session.isAdmin
      ? {}
      : {
          OR: [
            { ownerId: session.userId },
            { members: { some: { userId: session.userId } } },
            {
              taskAccesses: {
                some: {
                  userId: session.userId,
                  canView: true,
                  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                },
              },
            },
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
        ownerId: true,
        members: {
          where: { userId: session.userId },
          select: { userId: true },
        },
        taskAccesses: session.isAdmin
          ? false
          : {
              where: {
                userId: session.userId,
                canView: true,
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
              },
              select: { taskId: true },
            },
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
      const isFull =
        session.isAdmin ||
        project.ownerId === session.userId ||
        project.members.length > 0
      const grantedTaskIds = new Set(
        Array.isArray(project.taskAccesses)
          ? project.taskAccesses.map((g) => g.taskId)
          : []
      )

      if (isFull && project.endDate) {
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
        if (!isFull && !grantedTaskIds.has(task.id)) continue
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
