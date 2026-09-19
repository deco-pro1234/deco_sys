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
import { computeProjectCompletion, taskCompletionPercent } from '@/lib/projects/completion'
import { normalizeContactPhoneInput } from '@/lib/whatsapp/phoneSync'
import { randomUUID } from 'crypto'

export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'DONE' | 'ARCHIVED'
export type ProjectTaskStatus = 'TODO' | 'DOING' | 'DONE'
export type ProjectLedgerType = 'INCOME' | 'EXPENSE'

type AttachmentPayload = {
  url: string
  size: number
  note?: string
}
export type ProjectAccessMode = 'full' | 'temp'
/** Project roster role (not system admin). */
export type ProjectMemberRole = 'OWNER' | 'MANAGER' | 'MEMBER'

/** Section-scoped temp grant. Empty sectionId = uncategorized bucket. View is always implied. */
export type SectionAccessGrantInput = {
  sectionId?: string | null
  canAddMemo: boolean
  expiresAt?: string | null
}

const UNCATEGORIZED_SCOPE_KEY = '__uncategorized__'

type TaskGrantRow = {
  id: string
  taskId: string
  userId: string
  canView: boolean
  canAddMemo: boolean
  expiresAt: Date | null
}

function scopeKeyForSectionId(sectionId?: string | null) {
  return sectionId ? String(sectionId) : UNCATEGORIZED_SCOPE_KEY
}

function activeSectionAccessWhere(userId: string) {
  return {
    userId,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  }
}

const contactUserSelect = {
  id: true,
  roleName: true,
  email: true,
  loginPhone: true,
  accountKind: true,
  profile: {
    select: {
      contactPhone: true,
      contactEmail: true,
      jobTitle: true,
      department: true,
    },
  },
} as const

const taskDetailInclude = {
  createdBy: { select: { id: true, roleName: true } },
  assignee: { select: contactUserSelect },
  assignees: {
    include: { user: { select: contactUserSelect } },
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
  /** Direct task document bucket (exclude memo-thread attachments). */
  attachments: {
    where: { memoId: null },
    orderBy: { createdAt: 'desc' as const },
    include: { uploader: { select: { roleName: true } } },
  },
}

const sectionAttachmentInclude = {
  orderBy: { createdAt: 'desc' as const },
  include: { uploader: { select: { roleName: true } } },
}

const projectInclude = {
  owner: { select: contactUserSelect },
  contactUser: { select: contactUserSelect },
  members: {
    include: {
      user: { select: contactUserSelect },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  sections: {
    where: { parentId: null },
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    include: {
      attachments: sectionAttachmentInclude,
      children: {
        orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
        include: { attachments: sectionAttachmentInclude },
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
      attachments: {
        orderBy: { createdAt: 'asc' as const },
        include: { uploader: { select: { roleName: true } } },
      },
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

/**
 * Keep project.status aligned with task completion:
 * - all tasks DONE → DONE (unless ARCHIVED)
 * - any incomplete task while status was DONE → ACTIVE
 */
async function syncProjectCompletionFromTasks(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      status: true,
      tasks: { select: { status: true } },
    },
  })
  if (!project) return
  if (project.status === 'ARCHIVED') return

  const stats = computeProjectCompletion(project.tasks)
  if (stats.isComplete && project.status !== 'DONE') {
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'DONE' },
    })
  } else if (!stats.isComplete && project.status === 'DONE') {
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'ACTIVE' },
    })
  }
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
  const sectionAccesses = await prisma.projectSectionAccess.findMany({
    where: {
      projectId,
      ...activeSectionAccessWhere(userId),
    },
    select: {
      id: true,
      sectionId: true,
      scopeKey: true,
      canAddMemo: true,
      expiresAt: true,
      userId: true,
    },
  })
  const activeSections = sectionAccesses.filter((row) => isGrantActive(row.expiresAt))
  if (activeSections.length === 0) return []

  const [sections, tasks] = await Promise.all([
    prisma.projectSection.findMany({
      where: { projectId },
      select: { id: true, parentId: true },
    }),
    prisma.projectTask.findMany({
      where: { projectId },
      select: { id: true, sectionId: true },
    }),
  ])

  const childrenByParent = new Map<string, string[]>()
  for (const section of sections) {
    if (!section.parentId) continue
    const list = childrenByParent.get(section.parentId) || []
    list.push(section.id)
    childrenByParent.set(section.parentId, list)
  }

  const grantByTask = new Map<
    string,
    { canAddMemo: boolean; expiresAt: Date | null; accessId: string }
  >()

  for (const access of activeSections) {
    let coveredSectionIds: Set<string | null>
    if (access.scopeKey === UNCATEGORIZED_SCOPE_KEY || !access.sectionId) {
      coveredSectionIds = new Set([null])
    } else {
      coveredSectionIds = new Set([access.sectionId])
      const meta = sections.find((s) => s.id === access.sectionId)
      if (meta && !meta.parentId) {
        for (const childId of childrenByParent.get(access.sectionId) || []) {
          coveredSectionIds.add(childId)
        }
      }
    }

    for (const task of tasks) {
      const taskSection = task.sectionId || null
      if (!coveredSectionIds.has(taskSection)) continue
      const prev = grantByTask.get(task.id)
      grantByTask.set(task.id, {
        accessId: access.id,
        canAddMemo: Boolean(prev?.canAddMemo || access.canAddMemo),
        expiresAt: access.expiresAt ?? prev?.expiresAt ?? null,
      })
    }
  }

  return Array.from(grantByTask.entries()).map(([taskId, grant]) => ({
    id: grant.accessId,
    taskId,
    userId,
    canView: true,
    canAddMemo: grant.canAddMemo,
    expiresAt: grant.expiresAt,
  }))
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
      memberRole: 'OWNER' as ProjectMemberRole,
      accessMode: 'full' as const,
      taskGrants: [] as TaskGrantRow[],
      canManageTempAccess: true,
      canManageProject: true,
      canViewFullLedger: true,
    }
  }

  const membership = await getMembership(projectId, session.userId)
  const isOwner = project.ownerId === session.userId || membership?.role === 'OWNER'
  if (membership || project.ownerId === session.userId) {
    const memberRole: ProjectMemberRole = isOwner
      ? 'OWNER'
      : membership?.role === 'MANAGER'
        ? 'MANAGER'
        : 'MEMBER'
    const canManageProject = memberRole === 'OWNER'
    const canManageTempAccess = memberRole === 'OWNER' || memberRole === 'MANAGER'
    const canViewFullLedger = memberRole === 'OWNER' || memberRole === 'MANAGER'
    return {
      session,
      project,
      role: memberRole,
      memberRole,
      accessMode: 'full' as const,
      taskGrants: [] as TaskGrantRow[],
      canManageTempAccess,
      canManageProject,
      canViewFullLedger,
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
    memberRole: null as ProjectMemberRole | null,
    accessMode: 'temp' as const,
    taskGrants,
    canManageTempAccess: false,
    canManageProject: false,
    canViewFullLedger: false,
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

  const grants = await listActiveTaskGrants(task.projectId, session.userId)
  const grant = grants.find((g) => g.taskId === taskId)
  if (!grant || !grant.canAddMemo) {
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
            sectionAccesses: {
              some: {
                userId: session.userId,
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
      contactUser: { select: { id: true, roleName: true } },
      members: {
        include: { user: { select: { id: true, roleName: true } } },
      },
      _count: { select: { tasks: true, ledger: true } },
      ledger: { select: { type: true, amount: true, createdById: true } },
      tasks: {
        select: { id: true, dueDate: true, reminderDays: true, status: true },
      },
      sectionAccesses: session.isAdmin
        ? false
        : {
            where: {
              userId: session.userId,
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            select: { id: true },
          },
    },
  })

  return Promise.all(
    projects.map(async (p) => {
      const myMembership = p.members.find((m) => m.userId === session.userId)
      const isOwner = session.isAdmin || p.ownerId === session.userId || myMembership?.role === 'OWNER'
      const isManager = myMembership?.role === 'MANAGER'
      const isFull =
        session.isAdmin ||
        p.ownerId === session.userId ||
        Boolean(myMembership)
      const accessMode: ProjectAccessMode = isFull ? 'full' : 'temp'
      const canViewFullLedger = isOwner || isManager
      const grantedTaskIds = new Set(
        isFull
          ? []
          : (await listActiveTaskGrants(p.id, session.userId)).map((g) => g.taskId)
      )

      const visibleLedger = !isFull
        ? []
        : canViewFullLedger
          ? p.ledger
          : p.ledger.filter((e) => e.createdById === session.userId)

      const income = visibleLedger
        .filter((e) => e.type === 'INCOME')
        .reduce((s, e) => s + e.amount, 0)
      const expense = visibleLedger
        .filter((e) => e.type === 'EXPENSE')
        .reduce((s, e) => s + e.amount, 0)
      const { ledger: _ledger, sectionAccesses: _sectionAccesses, tasks: allTasks, ...rest } = p
      const scopedTasks = isFull
        ? allTasks
        : allTasks.filter((task) => grantedTaskIds.has(task.id))
      const completion = computeProjectCompletion(scopedTasks)
      const openTasks = scopedTasks.filter((task) => task.status !== 'DONE')
      const taskCount = scopedTasks.length

      return {
        ...rest,
        tasks: openTasks,
        completion,
        memberRole: isOwner
          ? ('OWNER' as const)
          : isManager
            ? ('MANAGER' as const)
            : isFull
              ? ('MEMBER' as const)
              : null,
        canViewFullLedger,
        _count: {
          tasks: taskCount,
          ledger: isFull ? (canViewFullLedger ? p._count.ledger : visibleLedger.length) : 0,
        },
        members: isFull ? p.members : [],
        accessMode,
        ledgerSummary: isFull
          ? {
              incomeHkd: income,
              expenseHkd: expense,
              balanceHkd: income - expense,
              scoped: !canViewFullLedger,
            }
          : null,
      }
    })
  )
}

export async function getProjectDetail(projectId: string) {
  const ctx = await assertCanViewProject(projectId)

  if (ctx.accessMode === 'temp') {
    const taskIds = ctx.taskGrants.map((g) => g.taskId)
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        owner: { select: contactUserSelect },
        contactUser: { select: contactUserSelect },
        sections: {
          where: { parentId: null },
          orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
          include: {
            attachments: sectionAttachmentInclude,
            children: {
              orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
              include: { attachments: sectionAttachmentInclude },
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

    // Task assignees may see fellow members on their matters (including other temps).
    const assignedSectionIds = new Set<string | null>()
    for (const task of project.tasks) {
      const assigneeIds =
        task.assignees && task.assignees.length > 0
          ? task.assignees.map((a) => a.userId)
          : task.assigneeId
            ? [task.assigneeId]
            : []
      if (!assigneeIds.includes(ctx.session.userId)) continue
      assignedSectionIds.add(task.sectionId || null)
      if (task.section?.parentId) {
        // Parent root grant also covers this child-section task
        assignedSectionIds.add(task.section.parentId)
      }
    }

    let sectionAccesses: Array<{
      id: string
      userId: string
      sectionId: string | null
      scopeKey: string
      canAddMemo: boolean
      expiresAt: Date | null
      user: {
        id: string
        roleName: string | null
        email: string | null
        loginPhone: string | null
        accountKind: string
        profile: {
          contactPhone: string | null
          contactEmail: string | null
          jobTitle: string | null
          department: string | null
        } | null
      } | null
      section: {
        id: string
        title: string
        parentId: string | null
        parent: { id: string; title: string } | null
      } | null
    }> = []
    if (assignedSectionIds.size > 0) {
      const orFilters: Array<{
        sectionId?: string | null
        scopeKey?: string
      }> = []
      for (const sid of assignedSectionIds) {
        if (sid) orFilters.push({ sectionId: sid })
        else {
          orFilters.push({ sectionId: null })
          orFilters.push({ scopeKey: UNCATEGORIZED_SCOPE_KEY })
        }
      }
      sectionAccesses = await prisma.projectSectionAccess.findMany({
        where: {
          projectId,
          AND: [
            { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            { OR: orFilters },
          ],
        },
        orderBy: { createdAt: 'asc' },
        include: {
          user: { select: contactUserSelect },
          section: {
            select: {
              id: true,
              title: true,
              parentId: true,
              parent: { select: { id: true, title: true } },
            },
          },
        },
      })
    }

    return {
      ...project,
      members: [],
      ledger: [],
      memos: [],
      attachments: [],
      taskAccesses: [],
      sectionAccesses,
      accessMode: 'temp' as const,
      canManageTempAccess: false,
      canManageProject: false,
      canViewFullLedger: false,
      memberRole: null as ProjectMemberRole | null,
      myTaskAccess,
      completion: computeProjectCompletion(project.tasks),
    }
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      ...projectInclude,
      sectionAccesses: ctx.canManageTempAccess
        ? {
            orderBy: { createdAt: 'asc' as const },
            include: {
              user: { select: contactUserSelect },
              section: {
                select: {
                  id: true,
                  title: true,
                  parentId: true,
                  parent: { select: { id: true, title: true } },
                },
              },
              createdBy: { select: { id: true, roleName: true } },
            },
          }
        : {
            where: {
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            include: {
              user: { select: contactUserSelect },
              section: {
                select: {
                  id: true,
                  title: true,
                  parentId: true,
                  parent: { select: { id: true, title: true } },
                },
              },
            },
          },
    },
  })
  if (!project) return null

  const ledger = ctx.canViewFullLedger
    ? project.ledger
    : project.ledger.filter((e) => e.createdById === ctx.session.userId)

  return {
    ...project,
    ledger,
    taskAccesses: [],
    sectionAccesses: Array.isArray(project.sectionAccesses) ? project.sectionAccesses : [],
    accessMode: 'full' as const,
    canManageTempAccess: ctx.canManageTempAccess,
    canManageProject: ctx.canManageProject,
    canViewFullLedger: ctx.canViewFullLedger,
    memberRole: ctx.memberRole,
    myTaskAccess: null as Record<string, { canView: boolean; canAddMemo: boolean }> | null,
    completion: computeProjectCompletion(project.tasks),
  }
}

export async function getProjectMemberCandidates(projectId?: string) {
  const session = await requireSession()
  if (!session.isAdmin) {
    if (!projectId) return []
    try {
      await assertCanManageProject(projectId)
    } catch {
      return []
    }
  }
  return prisma.user.findMany({
    where: {
      accountKind: ACCOUNT_KIND_STANDARD,
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

/** Expand query for HK lookalike chars (廸/迪) and digit-only phone forms. */
function memberSearchQueryVariants(raw: string): { texts: string[]; digits: string } {
  const query = String(raw || '').trim()
  const texts = new Set<string>()
  if (query) {
    texts.add(query)
    const toDi = query.replace(/廸/g, '迪')
    const toDiVariant = query.replace(/迪/g, '廸')
    if (toDi !== query) texts.add(toDi)
    if (toDiVariant !== query) texts.add(toDiVariant)
  }
  const digits = query.replace(/\D/g, '')
  return { texts: Array.from(texts), digits }
}

/** Search standard users to add as project members (name / email / phone). */
export async function searchProjectMemberCandidates(input: {
  query: string
  projectId?: string
  excludeIds?: string[]
  limit?: number
}): Promise<{
  success: boolean
  error?: string
  users?: Array<{
    id: string
    roleName: string
    email: string
    loginPhone: string | null
    isAdmin: boolean
    accountKind: string
  }>
}> {
  try {
    const session = await requireSession()
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    await assertProjectsEnabled()

    if (!session.isAdmin) {
      if (!input.projectId) {
        return { success: false, error: t('adminPermissionRequired') }
      }
      await assertCanManageProject(input.projectId)
    }

    const query = String(input.query || '').trim()
    if (query.length < 1) {
      return { success: true, users: [] }
    }

    const limit = Math.min(Math.max(Number(input.limit) || 12, 1), 30)
    const excludeIds = Array.from(new Set((input.excludeIds || []).filter(Boolean)))
    const { texts, digits } = memberSearchQueryVariants(query)

    const textOr = texts.flatMap((q) => [
      { roleName: { contains: q, mode: 'insensitive' as const } },
      { email: { contains: q, mode: 'insensitive' as const } },
      { loginPhone: { contains: q } },
      {
        profile: {
          is: {
            OR: [
              { legalNameZh: { contains: q, mode: 'insensitive' as const } },
              { legalNameEn: { contains: q, mode: 'insensitive' as const } },
              { contactPhone: { contains: q } },
              { contactEmail: { contains: q, mode: 'insensitive' as const } },
            ],
          },
        },
      },
    ])

    const phoneOr =
      digits.length >= 4
        ? [
            { loginPhone: { contains: digits } },
            {
              profile: {
                is: { contactPhone: { contains: digits } },
              },
            },
            {
              whatsappBindings: {
                some: { phoneE164: { contains: digits } },
              },
            },
          ]
        : []

    const users = await prisma.user.findMany({
      where: {
        accountKind: ACCOUNT_KIND_STANDARD,
        // Admins may also join projects as members/managers.
        ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
        OR: [...textOr, ...phoneOr],
      },
      orderBy: { roleName: 'asc' },
      take: limit,
      select: {
        id: true,
        roleName: true,
        email: true,
        loginPhone: true,
        isAdmin: true,
        accountKind: true,
        profile: { select: { contactPhone: true } },
        whatsappBindings: {
          where: { enabled: true },
          take: 1,
          select: { phoneE164: true },
        },
      },
    })

    return {
      success: true,
      users: users.map((u) => ({
        id: u.id,
        roleName: u.roleName,
        email: u.email,
        loginPhone:
          u.loginPhone ||
          u.profile?.contactPhone ||
          u.whatsappBindings[0]?.phoneE164 ||
          null,
        isAdmin: u.isAdmin,
        accountKind: u.accountKind,
      })),
    }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
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
    grants: SectionAccessGrantInput[]
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

    const projectSections = await prisma.projectSection.findMany({
      where: { projectId },
      select: { id: true },
    })
    const validSectionIds = new Set(projectSections.map((s) => s.id))
    const defaultExpires =
      input.expiresAt && String(input.expiresAt).trim()
        ? new Date(String(input.expiresAt))
        : null
    const normalizedGrants = (input.grants || [])
      .map((grant) => {
        const rawSectionId = grant.sectionId ? String(grant.sectionId).trim() : ''
        const sectionId = rawSectionId || null
        const canAddMemo = Boolean(grant.canAddMemo)
        const expiresAt =
          grant.expiresAt && String(grant.expiresAt).trim()
            ? new Date(String(grant.expiresAt))
            : defaultExpires
        return {
          sectionId,
          scopeKey: scopeKeyForSectionId(sectionId),
          canAddMemo,
          expiresAt:
            expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
        }
      })
      .filter(
        (grant) =>
          grant.scopeKey === UNCATEGORIZED_SCOPE_KEY ||
          (grant.sectionId && validSectionIds.has(grant.sectionId))
      )

    // de-dupe by scopeKey (last wins)
    const byScope = new Map<string, (typeof normalizedGrants)[number]>()
    for (const grant of normalizedGrants) byScope.set(grant.scopeKey, grant)
    const uniqueGrants = Array.from(byScope.values())

    if (uniqueGrants.length === 0) {
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

      for (const grant of uniqueGrants) {
        await tx.projectSectionAccess.create({
          data: {
            projectId,
            sectionId: grant.sectionId,
            scopeKey: grant.scopeKey,
            userId: user.id,
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

export async function setUserProjectSectionAccess(
  projectId: string,
  userId: string,
  grants: SectionAccessGrantInput[]
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

    const projectSections = await prisma.projectSection.findMany({
      where: { projectId },
      select: { id: true },
    })
    const validSectionIds = new Set(projectSections.map((s) => s.id))

    const normalized = grants
      .map((grant) => {
        const rawSectionId = grant.sectionId ? String(grant.sectionId).trim() : ''
        const sectionId = rawSectionId || null
        const canAddMemo = Boolean(grant.canAddMemo)
        const expiresAt =
          grant.expiresAt && String(grant.expiresAt).trim()
            ? new Date(String(grant.expiresAt))
            : null
        return {
          sectionId,
          scopeKey: scopeKeyForSectionId(sectionId),
          canAddMemo,
          expiresAt:
            expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
        }
      })
      .filter(
        (grant) =>
          grant.scopeKey === UNCATEGORIZED_SCOPE_KEY ||
          (grant.sectionId && validSectionIds.has(grant.sectionId))
      )

    const byScope = new Map<string, (typeof normalized)[number]>()
    for (const grant of normalized) byScope.set(grant.scopeKey, grant)
    const uniqueGrants = Array.from(byScope.values())

    await prisma.$transaction(async (tx) => {
      await tx.projectSectionAccess.deleteMany({
        where: { projectId, userId: targetUserId },
      })
      await tx.projectTaskAccess.deleteMany({
        where: { projectId, userId: targetUserId },
      })
      for (const grant of uniqueGrants) {
        await tx.projectSectionAccess.create({
          data: {
            projectId,
            sectionId: grant.sectionId,
            scopeKey: grant.scopeKey,
            userId: targetUserId,
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

/** @deprecated Use setUserProjectSectionAccess */
export async function setUserProjectTaskAccess(
  projectId: string,
  userId: string,
  grants: SectionAccessGrantInput[]
) {
  return setUserProjectSectionAccess(projectId, userId, grants)
}

export async function removeUserProjectTaskAccess(projectId: string, userId: string) {
  try {
    await assertCanManageTempAccess(projectId)
    await prisma.$transaction([
      prisma.projectSectionAccess.deleteMany({ where: { projectId, userId } }),
      prisma.projectTaskAccess.deleteMany({ where: { projectId, userId } }),
    ])
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
  contactUserId?: string | null
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
    const contactUserId = input.contactUserId?.trim() || null
    if (contactUserId && !memberIds.includes(contactUserId)) {
      memberIds.push(contactUserId)
    }

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
          contactUserId,
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
    contactUserId?: string | null
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
        startDate:
          input.startDate !== undefined
            ? input.startDate
              ? new Date(input.startDate)
              : null
            : undefined,
        endDate:
          input.endDate !== undefined
            ? input.endDate
              ? new Date(input.endDate)
              : null
            : undefined,
        reminderDays: Number(input.reminderDays ?? 15) || 15,
        note: input.note?.trim() || null,
        ...(input.contactUserId !== undefined
          ? { contactUserId: input.contactUserId?.trim() || null }
          : {}),
      },
    })

    // If manager manually set ARCHIVED/PLANNING, leave it; otherwise sync from tasks
    if (input.status !== 'ARCHIVED') {
      await syncProjectCompletionFromTasks(projectId)
    }

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

export async function setProjectMembers(
  projectId: string,
  members: Array<{ userId: string; role?: 'MANAGER' | 'MEMBER' }> | string[]
) {
  try {
    const { project } = await assertCanManageProject(projectId)
    const normalized = (Array.isArray(members) ? members : []).map((m) =>
      typeof m === 'string'
        ? { userId: m, role: 'MEMBER' as const }
        : {
            userId: m.userId,
            role: m.role === 'MANAGER' ? ('MANAGER' as const) : ('MEMBER' as const),
          }
    )
    const uniqueIds = Array.from(
      new Set([project.ownerId, ...normalized.map((m) => m.userId).filter(Boolean)])
    )
    const roleByUser = new Map<string, 'MANAGER' | 'MEMBER'>()
    for (const row of normalized) {
      if (row.userId && row.userId !== project.ownerId) {
        roleByUser.set(row.userId, row.role)
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.projectMember.deleteMany({
        where: {
          projectId,
          userId: { notIn: uniqueIds },
        },
      })
      for (const userId of uniqueIds) {
        const role =
          userId === project.ownerId ? 'OWNER' : roleByUser.get(userId) || 'MEMBER'
        await tx.projectMember.upsert({
          where: { projectId_userId: { projectId, userId } },
          update: { role },
          create: {
            projectId,
            userId,
            role,
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
  input: { title: string; parentId?: string | null; description?: string | null }
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
        description: input.description?.trim() || null,
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
  input: { title?: string; description?: string | null }
) {
  try {
    const section = await prisma.projectSection.findUnique({ where: { id: sectionId } })
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    if (!section) return { success: false, error: t('projectSectionNotFound') }
    await assertProjectMember(section.projectId)

    const data: { title?: string; description?: string | null } = {}
    if (input.title !== undefined) {
      const title = String(input.title || '').trim()
      if (!title) return { success: false, error: t('projectSectionTitleRequired') }
      data.title = title
    }
    if (input.description !== undefined) {
      data.description = input.description?.trim() || null
    }
    if (Object.keys(data).length === 0) {
      return { success: false, error: t('projectSectionTitleRequired') }
    }

    await prisma.projectSection.update({
      where: { id: sectionId },
      data,
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
    content?: string | null
    status?: ProjectTaskStatus
    startAt?: string | null
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

    const startAt = input.startAt ? new Date(input.startAt) : null
    const dueDate = input.dueDate ? new Date(input.dueDate) : null
    if (startAt && Number.isNaN(startAt.getTime())) {
      return { success: false, error: t('projectTaskTimeInvalid') }
    }
    if (dueDate && Number.isNaN(dueDate.getTime())) {
      return { success: false, error: t('projectTaskTimeInvalid') }
    }
    if (startAt && dueDate && startAt.getTime() > dueDate.getTime()) {
      return { success: false, error: t('projectTaskTimeRangeInvalid') }
    }

    const assigneeIds = Array.from(
      new Set(
        [
          ...(input.assigneeIds || []),
          ...(input.assigneeId ? [input.assigneeId] : []),
        ].filter(Boolean)
      )
    )

    const content =
      input.content !== undefined
        ? input.content?.trim() || null
        : input.note?.trim() || null

    await prisma.$transaction(async (tx) => {
      const created = await tx.projectTask.create({
        data: {
          projectId,
          sectionId,
          title,
          content,
          status: input.status || 'TODO',
          startAt,
          dueDate,
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
    await syncProjectCompletionFromTasks(projectId)
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
    content?: string | null
    status: ProjectTaskStatus
    startAt?: string | null
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

    const nextStartAt =
      input.startAt !== undefined
        ? input.startAt
          ? new Date(input.startAt)
          : null
        : task.startAt
    const nextDueDate =
      input.dueDate !== undefined
        ? input.dueDate
          ? new Date(input.dueDate)
          : null
        : task.dueDate
    if (nextStartAt && Number.isNaN(nextStartAt.getTime())) {
      return { success: false, error: t('projectTaskTimeInvalid') }
    }
    if (nextDueDate && Number.isNaN(nextDueDate.getTime())) {
      return { success: false, error: t('projectTaskTimeInvalid') }
    }
    if (nextStartAt && nextDueDate && nextStartAt.getTime() > nextDueDate.getTime()) {
      return { success: false, error: t('projectTaskTimeRangeInvalid') }
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
          reminderDays: Number(input.reminderDays ?? 7) || 7,
          ...(input.startAt !== undefined ? { startAt: nextStartAt } : {}),
          ...(input.dueDate !== undefined ? { dueDate: nextDueDate } : {}),
          ...(input.content !== undefined
            ? { content: input.content?.trim() || null }
            : {}),
          ...(input.note !== undefined ? { note: input.note?.trim() || null } : {}),
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
    await syncProjectCompletionFromTasks(task.projectId)
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
    await syncProjectCompletionFromTasks(task.projectId)
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
    content?: string
    note?: string
    attachments?: AttachmentPayload[]
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

    const attachmentList = (input.attachments || []).filter((item) => item?.url)
    await prisma.$transaction(async (tx) => {
      const created = await tx.projectLedgerEntry.create({
        data: {
          projectId,
          type: input.type,
          amount,
          date: new Date(input.date),
          content: input.content?.trim() || null,
          note: input.note?.trim() || null,
          createdById: session.userId,
        },
      })

      for (const item of attachmentList) {
        await tx.attachment.create({
          data: {
            fileUrl: item.url,
            size: Number(item.size) || 0,
            note: item.note || null,
            uploaderId: session.userId,
            projectId,
            projectLedgerEntryId: created.id,
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

export async function deleteProjectLedgerEntry(entryId: string) {
  try {
    const entry = await prisma.projectLedgerEntry.findUnique({ where: { id: entryId } })
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    if (!entry) return { success: false, error: t('projectLedgerNotFound') }
    const ctx = await assertProjectMember(entry.projectId)
    const canDeleteOthers = ctx.canViewFullLedger
    if (!canDeleteOthers && entry.createdById !== ctx.session.userId) {
      return { success: false, error: t('unauthorized') }
    }
    await prisma.projectLedgerEntry.delete({ where: { id: entryId } })
    revalidateProjects(entry.projectId)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function addProjectLedgerAttachment(
  entryId: string,
  input: AttachmentPayload
) {
  try {
    const entry = await prisma.projectLedgerEntry.findUnique({ where: { id: entryId } })
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    if (!entry) return { success: false, error: t('projectLedgerNotFound') }
    const ctx = await assertProjectMember(entry.projectId)
    const canEditOthers = ctx.canViewFullLedger
    if (!canEditOthers && entry.createdById !== ctx.session.userId) {
      return { success: false, error: t('unauthorized') }
    }
    if (!input?.url) return { success: false, error: t('ocrSelectAttachmentFirst') }

    await prisma.attachment.create({
      data: {
        fileUrl: input.url,
        size: Number(input.size) || 0,
        note: input.note || null,
        uploaderId: ctx.session.userId,
        projectId: entry.projectId,
        projectLedgerEntryId: entryId,
      },
    })
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

export async function addProjectTaskAttachment(
  taskId: string,
  input: AttachmentPayload
) {
  try {
    const task = await prisma.projectTask.findUnique({ where: { id: taskId } })
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    if (!task) return { success: false, error: t('projectTaskNotFound') }
    const { session } = await assertProjectMember(task.projectId)
    if (!input?.url) return { success: false, error: t('ocrSelectAttachmentFirst') }

    await prisma.attachment.create({
      data: {
        fileUrl: input.url,
        size: Number(input.size) || 0,
        note: input.note || null,
        uploaderId: session.userId,
        projectId: task.projectId,
        projectTaskId: taskId,
      },
    })
    revalidateProjects(task.projectId)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function addProjectSectionAttachment(
  sectionId: string,
  input: AttachmentPayload
) {
  try {
    const section = await prisma.projectSection.findUnique({ where: { id: sectionId } })
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    if (!section) return { success: false, error: t('projectSectionNotFound') }
    const { session } = await assertProjectMember(section.projectId)
    if (!input?.url) return { success: false, error: t('ocrSelectAttachmentFirst') }

    await prisma.attachment.create({
      data: {
        fileUrl: input.url,
        size: Number(input.size) || 0,
        note: input.note || null,
        uploaderId: session.userId,
        projectId: section.projectId,
        projectSectionId: sectionId,
      },
    })
    revalidateProjects(section.projectId)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
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
              sectionAccesses: {
                some: {
                  userId: session.userId,
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
        startDate: true,
        endDate: true,
        reminderDays: true,
        ownerId: true,
        members: {
          where: { userId: session.userId },
          select: { userId: true },
        },
        tasks: {
          where: {
            status: { not: 'DONE' },
            OR: [{ dueDate: { not: null } }, { startAt: { not: null } }],
          },
          select: {
            id: true,
            title: true,
            startAt: true,
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
        isFull
          ? []
          : (await listActiveTaskGrants(project.id, session.userId)).map((g) => g.taskId)
      )

      if (isFull && project.startDate) {
        const daysDiff = getDaysDiff(project.startDate)
        const bucket = getReminderBucket(daysDiff, project.reminderDays)
        if (bucket) {
          items.push({
            id: `project-${project.id}-start`,
            title: project.title,
            targetDate: project.startDate.toISOString(),
            bucket,
            daysDiff,
            reminderDays: project.reminderDays,
            href: `/projects/${project.id}`,
            kind: 'project_start',
          })
        }
      }

      if (isFull && project.endDate) {
        const daysDiff = getDaysDiff(project.endDate)
        const bucket = getReminderBucket(daysDiff, project.reminderDays)
        if (bucket) {
          items.push({
            id: `project-${project.id}-end`,
            title: project.title,
            targetDate: project.endDate.toISOString(),
            bucket,
            daysDiff,
            reminderDays: project.reminderDays,
            href: `/projects/${project.id}`,
            kind: 'project_end',
          })
        }
      }

      for (const task of project.tasks) {
        if (!isFull && !grantedTaskIds.has(task.id)) continue
        const taskTitle = `${project.title} · ${task.title}`

        if (task.startAt) {
          const daysDiff = getDaysDiff(task.startAt)
          const bucket = getReminderBucket(daysDiff, task.reminderDays)
          if (bucket) {
            items.push({
              id: `task-${task.id}-start`,
              title: taskTitle,
              targetDate: task.startAt.toISOString(),
              bucket,
              daysDiff,
              reminderDays: task.reminderDays,
              href: `/projects/${project.id}`,
              kind: 'project_task_start',
            })
          }
        }

        if (task.dueDate) {
          const daysDiff = getDaysDiff(task.dueDate)
          const bucket = getReminderBucket(daysDiff, task.reminderDays)
          if (bucket) {
            items.push({
              id: `task-${task.id}-due`,
              title: taskTitle,
              targetDate: task.dueDate.toISOString(),
              bucket,
              daysDiff,
              reminderDays: task.reminderDays,
              href: `/projects/${project.id}`,
              kind: 'project_task_due',
            })
          }
        }
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

type ProjectPdfExportOptions = {
  locale?: 'zh' | 'en'
  includeAttachments?: boolean
  /** Progress report: include completion summary and per-task percents. */
  progressReport?: boolean
  /**
   * Deterministic document templates.
   * `progress` / legacy `progressReport` both map to progress mode.
   */
  documentType?: 'project' | 'progress' | 'schedule' | 'sectionList' | 'finance'
}

function mapTaskForPdf(
  task: {
    title: string
    content?: string | null
    status: string
    startAt?: Date | null
    dueDate?: Date | null
    assignees?: Array<{
      user?: {
        roleName?: string | null
        accountKind?: string | null
        loginPhone?: string | null
        email?: string | null
        profile?: { contactPhone?: string | null; contactEmail?: string | null } | null
      } | null
    }>
    assignee?: { roleName?: string | null; accountKind?: string | null } | null
    attachments?: Array<{ note?: string | null; fileUrl: string; size?: number | null }>
    memos?: Array<{
      content: string
      createdAt: Date
      author?: { roleName?: string | null } | null
    }>
    section?: { title: string; parent?: { title: string } | null } | null
  },
  sectionPath?: string,
  locale: 'zh' | 'en' = 'zh'
) {
  const tempTag = locale === 'en' ? 'temp' : '臨時'
  const assigneeRows =
    task.assignees && task.assignees.length > 0
      ? task.assignees
          .map((a) => {
            const u = a.user
            if (!u?.roleName) return null
            const isTemp = u.accountKind === ACCOUNT_KIND_PROJECT_TEMP
            const phone = u.profile?.contactPhone || u.loginPhone || ''
            const email = u.profile?.contactEmail || u.email || ''
            const bits = [isTemp ? `${u.roleName}（${tempTag}）` : u.roleName]
            if (phone) bits.push(phone)
            if (email) bits.push(email)
            return {
              name: u.roleName,
              isTemp,
              phone: phone || null,
              email: email || null,
              label: bits.filter(Boolean).join(' · '),
            }
          })
          .filter(Boolean)
      : task.assignee?.roleName
        ? [
            {
              name: task.assignee.roleName,
              isTemp: task.assignee.accountKind === ACCOUNT_KIND_PROJECT_TEMP,
              phone: null as string | null,
              email: null as string | null,
              label:
                task.assignee.accountKind === ACCOUNT_KIND_PROJECT_TEMP
                  ? `${task.assignee.roleName}（${tempTag}）`
                  : task.assignee.roleName,
            },
          ]
        : []

  const path =
    sectionPath ||
    (task.section?.parent
      ? `${task.section.parent.title} / ${task.section.title}`
      : task.section?.title || undefined)
  return {
    title: task.title,
    content: task.content,
    status: task.status,
    completionPercent: taskCompletionPercent(task.status),
    startAt: task.startAt,
    dueDate: task.dueDate,
    assignees: assigneeRows.map((a) => a!.label),
    assigneeDetails: assigneeRows.map((a) => ({
      name: a!.name,
      isTemp: a!.isTemp,
      phone: a!.phone,
      email: a!.email,
    })),
    sectionPath: path,
    attachments: (task.attachments || []).map((a) => ({
      note: a.note,
      fileUrl: a.fileUrl,
      size: a.size || 0,
    })),
    memos: (task.memos || []).map((m) => ({
      author: m.author?.roleName || '—',
      content: m.content,
      createdAt: m.createdAt,
    })),
  }
}

function projectStatusLabelForPdf(status: string, locale: 'zh' | 'en') {
  const zh: Record<string, string> = {
    PLANNING: '規劃中',
    ACTIVE: '進行中',
    DONE: '已完成',
    ARCHIVED: '已歸檔',
  }
  const en: Record<string, string> = {
    PLANNING: 'Planning',
    ACTIVE: 'Active',
    DONE: 'Done',
    ARCHIVED: 'Archived',
  }
  return (locale === 'en' ? en : zh)[status] || status
}

export async function exportProjectTaskPdf(
  taskId: string,
  options: ProjectPdfExportOptions = {}
) {
  try {
    const locale = options.locale === 'en' ? 'en' : 'zh'
    const includeAttachments = Boolean(options.includeAttachments)
    const task = await prisma.projectTask.findUnique({
      where: { id: taskId },
      include: {
        project: { include: { owner: { select: { roleName: true } } } },
        section: { include: { parent: { select: { title: true } } } },
        assignee: { select: { roleName: true } },
        assignees: { include: { user: { select: { roleName: true } } } },
        attachments: { where: { memoId: null }, orderBy: { createdAt: 'desc' } },
        memos: {
          orderBy: { createdAt: 'desc' },
          take: 8,
          include: { author: { select: { roleName: true } } },
        },
      },
    })
    const t = createTranslator(await getCurrentLocale())
    if (!task) return { success: false as const, error: t('projectTaskNotFound') }
    await assertProjectMember(task.projectId)

    const { generateProjectPdf } = await import('@/lib/projects/pdf')
    const bytes = generateProjectPdf({
      projectTitle: task.project.title,
      projectStatus: projectStatusLabelForPdf(task.project.status, locale),
      projectNote: task.project.note,
      ownerName: task.project.owner?.roleName,
      mode: 'task',
      task: mapTaskForPdf(task),
      includeAttachments,
      locale,
    })

    const safeTitle = task.title.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 40)
    const stamp = new Date().toISOString().slice(0, 10)
    return {
      success: true as const,
      filename:
        locale === 'en'
          ? `Task_${safeTitle}_${stamp}.pdf`
          : `事項_${safeTitle}_${stamp}.pdf`,
      bytes,
    }
  } catch (e: any) {
    return { success: false as const, error: e.message }
  }
}

export async function exportProjectSectionPdf(
  sectionId: string,
  options: ProjectPdfExportOptions = {}
) {
  try {
    const locale = options.locale === 'en' ? 'en' : 'zh'
    const includeAttachments = Boolean(options.includeAttachments)
    const section = await prisma.projectSection.findUnique({
      where: { id: sectionId },
      include: {
        project: { include: { owner: { select: { roleName: true } } } },
        parent: { select: { id: true, title: true } },
        attachments: { orderBy: { createdAt: 'desc' } },
        children: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: {
            attachments: { orderBy: { createdAt: 'desc' } },
            tasks: {
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
              include: {
                assignee: { select: { roleName: true } },
                assignees: { include: { user: { select: { roleName: true } } } },
                attachments: { where: { memoId: null }, orderBy: { createdAt: 'desc' } },
                memos: {
                  orderBy: { createdAt: 'desc' },
                  take: 5,
                  include: { author: { select: { roleName: true } } },
                },
              },
            },
          },
        },
        tasks: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
          include: {
            assignee: { select: { roleName: true } },
            assignees: { include: { user: { select: { roleName: true } } } },
            attachments: { where: { memoId: null }, orderBy: { createdAt: 'desc' } },
            memos: {
              orderBy: { createdAt: 'desc' },
              take: 5,
              include: { author: { select: { roleName: true } } },
            },
          },
        },
      },
    })
    const t = createTranslator(await getCurrentLocale())
    if (!section) return { success: false as const, error: t('projectSectionNotFound') }
    await assertProjectMember(section.projectId)

    const pathPrefix = section.parent ? `${section.parent.title} / ${section.title}` : section.title
    const { generateProjectPdf } = await import('@/lib/projects/pdf')
    const documentType =
      options.documentType === 'schedule' || options.documentType === 'sectionList'
        ? options.documentType
        : 'section'
    const mode = documentType === 'schedule' ? 'schedule' : documentType === 'sectionList' ? 'sectionList' : 'section'
    const bytes = generateProjectPdf({
      projectTitle: section.project.title,
      projectStatus: projectStatusLabelForPdf(section.project.status, locale),
      projectNote: section.project.note,
      ownerName: section.project.owner?.roleName,
      mode,
      sections: [
        {
          title: section.title,
          description: section.description,
          depth: section.parentId ? 1 : 0,
          attachments: section.attachments.map((a) => ({
            note: a.note,
            fileUrl: a.fileUrl,
            size: a.size,
          })),
          tasks: section.tasks.map((task) => mapTaskForPdf(task, pathPrefix)),
          children: section.children.map((child) => ({
            title: child.title,
            description: child.description,
            depth: 1,
            attachments: child.attachments.map((a) => ({
              note: a.note,
              fileUrl: a.fileUrl,
              size: a.size,
            })),
            tasks: child.tasks.map((task) =>
              mapTaskForPdf(task, `${section.title} / ${child.title}`)
            ),
          })),
        },
      ],
      includeAttachments: mode === 'section' ? includeAttachments : false,
      locale,
    })

    const safeTitle = section.title.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 40)
    const stamp = new Date().toISOString().slice(0, 10)
    const prefix =
      mode === 'schedule'
        ? locale === 'en'
          ? 'Schedule'
          : '工作排程'
        : mode === 'sectionList'
          ? locale === 'en'
            ? 'SectionList'
            : '分組事項列表'
          : locale === 'en'
            ? 'Section'
            : '分組'
    return {
      success: true as const,
      filename: `${prefix}_${safeTitle}_${stamp}.pdf`,
      bytes,
    }
  } catch (e: any) {
    return { success: false as const, error: e.message }
  }
}

export async function exportProjectPdf(
  projectId: string,
  options: ProjectPdfExportOptions = {}
) {
  try {
    const locale = options.locale === 'en' ? 'en' : 'zh'
    const includeAttachments = Boolean(options.includeAttachments)
    await assertProjectMember(projectId)
    const assigneeInclude = {
      include: { user: { select: contactUserSelect } },
    }
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        owner: { select: contactUserSelect },
        contactUser: { select: contactUserSelect },
        sections: {
          where: { parentId: null },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: {
            attachments: { orderBy: { createdAt: 'desc' } },
            children: {
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
              include: {
                attachments: { orderBy: { createdAt: 'desc' } },
                tasks: {
                  orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
                  include: {
                    assignee: { select: contactUserSelect },
                    assignees: assigneeInclude,
                    attachments: {
                      where: { memoId: null },
                      orderBy: { createdAt: 'desc' },
                    },
                    memos: {
                      orderBy: { createdAt: 'desc' },
                      take: 5,
                      include: { author: { select: { roleName: true } } },
                    },
                  },
                },
              },
            },
            tasks: {
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
              include: {
                assignee: { select: contactUserSelect },
                assignees: assigneeInclude,
                attachments: { where: { memoId: null }, orderBy: { createdAt: 'desc' } },
                memos: {
                  orderBy: { createdAt: 'desc' },
                  take: 5,
                  include: { author: { select: { roleName: true } } },
                },
              },
            },
          },
        },
        tasks: {
          where: { sectionId: null },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
          include: {
            assignee: { select: contactUserSelect },
            assignees: assigneeInclude,
            attachments: { where: { memoId: null }, orderBy: { createdAt: 'desc' } },
            memos: {
              orderBy: { createdAt: 'desc' },
              take: 5,
              include: { author: { select: { roleName: true } } },
            },
          },
        },
        ledger: {
          orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
          include: { createdBy: { select: { roleName: true } } },
        },
        sectionAccesses: {
          where: {
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          include: {
            user: { select: contactUserSelect },
            section: { select: { id: true, title: true, parentId: true } },
          },
        },
      },
    })
    const t = createTranslator(await getCurrentLocale())
    if (!project) return { success: false as const, error: t('projectNotFound') }

    const uncategorizedLabel = locale === 'en' ? 'Uncategorized' : '未分類'
    const allTasksFlat = [
      ...project.sections.flatMap((root) => [
        ...root.tasks,
        ...root.children.flatMap((c) => c.tasks),
      ]),
      ...project.tasks,
    ]
    const completion = computeProjectCompletion(allTasksFlat)

    const formatContact = (u?: {
      roleName?: string | null
      email?: string | null
      loginPhone?: string | null
      accountKind?: string | null
      profile?: { contactPhone?: string | null; contactEmail?: string | null } | null
    } | null) => {
      if (!u?.roleName) return null
      const phone = u.profile?.contactPhone || u.loginPhone || ''
      const email = u.profile?.contactEmail || u.email || ''
      const temp =
        u.accountKind === ACCOUNT_KIND_PROJECT_TEMP
          ? locale === 'en'
            ? ' (temp)'
            : '（臨時）'
          : ''
      return {
        name: `${u.roleName}${temp}`,
        phone: phone || null,
        email: email || null,
      }
    }

    const sections = project.sections.map((root) => ({
      title: root.title,
      description: root.description,
      depth: 0 as const,
      attachments: root.attachments.map((a) => ({
        note: a.note,
        fileUrl: a.fileUrl,
        size: a.size,
      })),
      tasks: root.tasks.map((task) => mapTaskForPdf(task, root.title, locale)),
      children: root.children.map((child) => ({
        title: child.title,
        description: child.description,
        depth: 1 as const,
        attachments: child.attachments.map((a) => ({
          note: a.note,
          fileUrl: a.fileUrl,
          size: a.size,
        })),
        tasks: child.tasks.map((task) =>
          mapTaskForPdf(task, `${root.title} / ${child.title}`, locale)
        ),
      })),
    }))

    if (project.tasks.length > 0) {
      sections.push({
        title: uncategorizedLabel,
        description: null,
        depth: 0 as const,
        attachments: [],
        tasks: project.tasks.map((task) => mapTaskForPdf(task, uncategorizedLabel, locale)),
        children: [],
      })
    }

    const { generateProjectPdf } = await import('@/lib/projects/pdf')
    const documentType =
      options.documentType ||
      (options.progressReport ? 'progress' : 'project')
    const mode =
      documentType === 'progress'
        ? 'progress'
        : documentType === 'schedule'
          ? 'schedule'
          : documentType === 'sectionList'
            ? 'sectionList'
            : documentType === 'finance'
              ? 'finance'
              : 'project'
    const bytes = generateProjectPdf({
      projectTitle: project.title,
      projectStatus: projectStatusLabelForPdf(project.status, locale),
      projectNote: project.note,
      ownerName: project.owner?.roleName,
      contactName: formatContact(project.contactUser)?.name || formatContact(project.owner)?.name,
      contactPhone:
        formatContact(project.contactUser)?.phone || formatContact(project.owner)?.phone,
      contactEmail:
        formatContact(project.contactUser)?.email || formatContact(project.owner)?.email,
      startDate: project.startDate,
      endDate: project.endDate,
      completion,
      mode,
      sections,
      ledger:
        mode === 'finance'
          ? project.ledger.map((e) => ({
              type: e.type,
              amount: e.amount,
              date: e.date,
              content: e.content,
              note: e.note,
              createdBy: e.createdBy?.roleName || null,
            }))
          : undefined,
      includeAttachments: mode === 'project' || mode === 'progress' ? includeAttachments : false,
      locale,
    })

    const safeTitle = project.title.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 40)
    const stamp = new Date().toISOString().slice(0, 10)
    const prefixMapZh: Record<string, string> = {
      progress: '進度',
      schedule: '工作排程',
      sectionList: '分組事項列表',
      finance: '項目財務',
      project: '項目',
    }
    const prefixMapEn: Record<string, string> = {
      progress: 'Progress',
      schedule: 'Schedule',
      sectionList: 'SectionList',
      finance: 'Finance',
      project: 'Project',
    }
    const prefix =
      locale === 'en'
        ? prefixMapEn[documentType] || 'Project'
        : prefixMapZh[documentType] || '項目'
    return {
      success: true as const,
      filename: `${prefix}_${safeTitle}_${stamp}.pdf`,
      bytes,
    }
  } catch (e: any) {
    return { success: false as const, error: e.message }
  }
}
