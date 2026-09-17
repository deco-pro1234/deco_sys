'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from './auth'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'
import { maybeSendReminderCatchUp } from '@/lib/reminders/emailReminders'

type AttachmentPayload = {
  url: string
  size: number
  note?: string
}

export type CreateActivityInput = {
  title: string
  note?: string
  eventDate: Date
  reminderDays: number
  visibility: 'PUBLIC' | 'PRIVATE'
  attachment?: AttachmentPayload
  attachments?: AttachmentPayload[]
  initialMemo?: string
}

export type UpdateActivityInput = {
  title: string
  note?: string
  eventDate: Date
  reminderDays: number
  visibility: 'PUBLIC' | 'PRIVATE'
}

async function assertActivityPermission(activityId: string) {
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  const session = await getSession()

  if (!session) {
    throw new Error(t('notLoggedIn'))
  }

  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
  })

  if (!activity) {
    throw new Error(t('activityNotFound'))
  }

  if (activity.userId !== session.userId && !session.isAdmin) {
    throw new Error(t('canOnlyModifyOwnActivity'))
  }

  return { session, activity }
}

export async function getActivities() {
  const session = await getSession()
  if (!session) return []

  return prisma.activity.findMany({
    where: {
      OR: [
        { visibility: 'PUBLIC' },
        { userId: session.userId },
      ],
    },
    orderBy: [
      { eventDate: 'asc' },
      { createdAt: 'desc' },
    ],
    include: {
      user: { select: { roleName: true } },
      attachments: {
        orderBy: { createdAt: 'desc' },
        include: {
          uploader: { select: { roleName: true } },
        },
      },
      memos: {
        orderBy: { createdAt: 'desc' },
        include: {
          author: { select: { roleName: true } },
        },
      },
    },
  })
}

export async function createActivity(data: CreateActivityInput) {
  try {
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    const session = await getSession()
    if (!session) {
      throw new Error(t('notLoggedIn'))
    }

    const activity = await prisma.$transaction(async (tx) => {
      const created = await tx.activity.create({
        data: {
          title: data.title,
          note: data.note,
          eventDate: data.eventDate,
          reminderDays: data.reminderDays,
          visibility: data.visibility,
          userId: session.userId,
        },
      })

      const attachmentList =
        data.attachments && data.attachments.length > 0
          ? data.attachments
          : data.attachment
            ? [data.attachment]
            : []

      for (const item of attachmentList) {
        await tx.attachment.create({
          data: {
            fileUrl: item.url,
            size: item.size,
            note: item.note,
            uploaderId: session.userId,
            activityId: created.id,
          },
        })
      }

      if (data.initialMemo?.trim()) {
        await tx.memo.create({
          data: {
            content: data.initialMemo.trim(),
            authorId: session.userId,
            activityId: created.id,
          },
        })
      }

      return created
    })

    // If create day is a trigger day (30/15/7/3/1/due/…), send immediately.
    if (activity.visibility === 'PUBLIC') {
      try {
        await maybeSendReminderCatchUp({
          entityType: 'ACTIVITY',
          entityId: activity.id,
          title: activity.title,
          targetDate: activity.eventDate,
          reminderDays: activity.reminderDays,
          eligible: true,
        })
      } catch (e) {
        console.error('[createActivity] reminder catch-up failed', e)
      }
    }

    revalidatePath('/activities')
    return { success: true, activity }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function updateActivity(activityId: string, data: UpdateActivityInput) {
  try {
    await assertActivityPermission(activityId)

    const activity = await prisma.activity.update({
      where: { id: activityId },
      data: {
        title: data.title,
        note: data.note,
        eventDate: data.eventDate,
        reminderDays: data.reminderDays,
        visibility: data.visibility,
      },
    })

    if (activity.visibility === 'PUBLIC') {
      try {
        await maybeSendReminderCatchUp({
          entityType: 'ACTIVITY',
          entityId: activity.id,
          title: activity.title,
          targetDate: activity.eventDate,
          reminderDays: activity.reminderDays,
          eligible: true,
        })
      } catch (e) {
        console.error('[updateActivity] reminder catch-up failed', e)
      }
    }

    revalidatePath('/activities')
    return { success: true, activity }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function addActivityAttachment(activityId: string, attachment: AttachmentPayload) {
  try {
    const { session } = await assertActivityPermission(activityId)

    await prisma.attachment.create({
      data: {
        fileUrl: attachment.url,
        size: attachment.size,
        note: attachment.note,
        uploaderId: session.userId,
        activityId,
      },
    })

    revalidatePath('/activities')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function addActivityMemo(activityId: string, content: string) {
  try {
    const { session } = await assertActivityPermission(activityId)

    await prisma.memo.create({
      data: {
        content,
        authorId: session.userId,
        activityId,
      },
    })

    revalidatePath('/activities')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function appendActivityNoteKeywords(activityId: string, noteText: string) {
  try {
    const { session, activity } = await assertActivityPermission(activityId)
    const addition = noteText.trim()
    if (!addition) return { success: true }

    const nextNote = activity.note?.trim() ? `${activity.note.trim()}\n${addition}` : addition
    await prisma.$transaction(async (tx) => {
      await tx.activity.update({
        where: { id: activityId },
        data: { note: nextNote },
      })
      await tx.memo.create({
        data: {
          content: addition.startsWith('OCR') || addition.startsWith('圖像辨識')
            ? addition
            : `圖像辨識: ${addition}`,
          authorId: session.userId,
          activityId,
        },
      })
    })

    revalidatePath('/activities')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function deleteActivity(activityId: string) {
  try {
    await assertActivityPermission(activityId)

    await prisma.$transaction(async (tx) => {
      await tx.memo.deleteMany({ where: { activityId } })
      await tx.attachment.deleteMany({ where: { activityId } })
      await tx.activity.delete({ where: { id: activityId } })
    })

    revalidatePath('/activities')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
