'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from './auth'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'
import { getPluginFlags } from './settings'
import {
  FRAMEWORK_LIMITS,
  normalizeFrameworkDraft,
  validateFrameworkDraft,
  type FrameworkDraft,
} from '@/lib/projects/frameworkDraft'
import { generateFrameworkDraft, type FrameworkAiSource } from '@/lib/projects/frameworkAi'

function revalidateProjects(projectId?: string) {
  revalidatePath('/projects')
  if (projectId) revalidatePath(`/projects/${projectId}`)
}

async function assertAdminCanUseFrameworkAi() {
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  const session = await getSession()
  if (!session) throw new Error(t('notLoggedIn'))

  const flags = await getPluginFlags()
  if (!flags.projects) throw new Error(t('pluginDisabled'))
  if (!session.isAdmin) throw new Error(t('adminPermissionRequired'))

  return { session, t, locale }
}

export async function suggestProjectFramework(description: string): Promise<{
  success: boolean
  error?: string
  draft?: FrameworkDraft
  source?: FrameworkAiSource
  model?: string
}> {
  try {
    const { t } = await assertAdminCanUseFrameworkAi()
    const text = String(description || '').trim()
    if (!text) return { success: false, error: t('projectAiDescriptionRequired') }
    if (text.length > FRAMEWORK_LIMITS.maxPromptLen) {
      return { success: false, error: t('projectAiDescriptionTooLong') }
    }

    const { draft, source, model } = await generateFrameworkDraft(text)
    const invalid = validateFrameworkDraft(draft)
    if (invalid) {
      return { success: false, error: t('projectAiDraftInvalid') }
    }

    return { success: true, draft, source, model }
  } catch (e: any) {
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    const msg = String(e?.message || '')
    if (msg === 'PROJECT_AI_API_KEY_MISSING') {
      return { success: false, error: t('projectAiApiKeyMissing') }
    }
    if (e?.name === 'AbortError') {
      return { success: false, error: t('projectAiTimeout') }
    }
    return { success: false, error: msg || t('projectAiRequestFailed') }
  }
}

export async function commitProjectFramework(
  draftInput: FrameworkDraft,
  options?: { memberIds?: string[] }
): Promise<{ success: boolean; error?: string; id?: string }> {
  try {
    const { session, t } = await assertAdminCanUseFrameworkAi()
    const draft = normalizeFrameworkDraft(draftInput)
    const invalid = validateFrameworkDraft(draft)
    if (invalid) return { success: false, error: t('projectAiDraftInvalid') }

    const memberIds = Array.from(
      new Set([session.userId, ...(options?.memberIds || []).filter(Boolean)])
    )

    const projectId = await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          title: draft.title,
          status: draft.status,
          note: draft.note,
          ownerId: session.userId,
          reminderDays: 15,
        },
      })

      await tx.projectMember.createMany({
        data: memberIds.map((userId) => ({
          projectId: project.id,
          userId,
          role: userId === session.userId ? 'OWNER' : 'MEMBER',
        })),
        skipDuplicates: true,
      })

      let rootSort = 0
      for (const root of draft.sections) {
        const rootSection = await tx.projectSection.create({
          data: {
            projectId: project.id,
            title: root.title,
            description: root.description,
            sortOrder: rootSort++,
          },
        })

        let taskSort = 0
        for (const task of root.tasks) {
          await tx.projectTask.create({
            data: {
              projectId: project.id,
              sectionId: rootSection.id,
              title: task.title,
              content: task.content,
              status: 'TODO',
              sortOrder: taskSort++,
              createdById: session.userId,
              reminderDays: 15,
            },
          })
        }

        let childSort = 0
        for (const child of root.children) {
          const childSection = await tx.projectSection.create({
            data: {
              projectId: project.id,
              parentId: rootSection.id,
              title: child.title,
              description: child.description,
              sortOrder: childSort++,
            },
          })
          let childTaskSort = 0
          for (const task of child.tasks) {
            await tx.projectTask.create({
              data: {
                projectId: project.id,
                sectionId: childSection.id,
                title: task.title,
                content: task.content,
                status: 'TODO',
                sortOrder: childTaskSort++,
                createdById: session.userId,
                reminderDays: 15,
              },
            })
          }
        }
      }

      let uncSort = 0
      for (const task of draft.uncategorizedTasks) {
        await tx.projectTask.create({
          data: {
            projectId: project.id,
            sectionId: null,
            title: task.title,
            content: task.content,
            status: 'TODO',
            sortOrder: uncSort++,
            createdById: session.userId,
            reminderDays: 15,
          },
        })
      }

      return project.id
    })

    revalidateProjects(projectId)
    return { success: true, id: projectId }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}
