'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from './auth'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'
import { hasPublicLedgerAccess } from '@/lib/access'
import { getPluginFlags } from './settings'
import { addMonthsClamped, normalizeDueDate, preferredDayOfMonth } from '@/lib/recurring'
import { createRecord } from './record'

type AttachmentPayload = {
  url: string
  size: number
  note?: string
}

async function assertRecurringAccess() {
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  const session = await getSession()
  if (!session) throw new Error(t('notLoggedIn'))
  if (!hasPublicLedgerAccess(session)) throw new Error(t('unauthorized'))

  const flags = await getPluginFlags()
  if (!flags.recurring) throw new Error(t('pluginDisabled'))

  return { session, t, locale }
}

async function ensureOpenInstance(template: {
  id: string
  nextDueDate: Date
  amount: number
  note: string | null
  userId: string
  reminderDays: number
}) {
  const dueDate = normalizeDueDate(template.nextDueDate)
  const existing = await prisma.recurringInstance.findUnique({
    where: {
      templateId_dueDate: {
        templateId: template.id,
        dueDate,
      },
    },
  })
  if (existing) return existing

  return prisma.recurringInstance.create({
    data: {
      templateId: template.id,
      userId: template.userId,
      dueDate,
      amount: template.amount,
      note: template.note,
      status: 'OPEN',
    },
  })
}

export async function listRecurringTemplates() {
  try {
    await assertRecurringAccess()
    const templates = await prisma.recurringTemplate.findMany({
      orderBy: [{ nextDueDate: 'asc' }, { createdAt: 'desc' }],
      include: {
        category: true,
        subCategory: true,
        thirdCategory: true,
        pool: true,
        instances: {
          where: { status: 'OPEN' },
          orderBy: { dueDate: 'asc' },
          take: 1,
          include: { attachments: true },
        },
      },
    })

    // Ensure open instance exists for each template's next due
    for (const template of templates) {
      if (template.instances.length === 0) {
        await ensureOpenInstance(template)
      }
    }

    const refreshed = await prisma.recurringTemplate.findMany({
      orderBy: [{ nextDueDate: 'asc' }, { createdAt: 'desc' }],
      include: {
        category: true,
        subCategory: true,
        thirdCategory: true,
        pool: true,
        instances: {
          where: { status: 'OPEN' },
          orderBy: { dueDate: 'asc' },
          take: 1,
          include: { attachments: true },
        },
      },
    })

    return { success: true, templates: refreshed }
  } catch (error: any) {
    return { success: false, error: error.message, templates: [] }
  }
}

export async function createRecurringTemplate(input: {
  type: 'INCOME' | 'EXPENSE'
  title: string
  note?: string
  amount: number
  intervalMonths: number
  nextDueDate: string // YYYY-MM-DD
  reminderDays?: number
  categoryId: string
  subCategoryId?: string
  thirdCategoryId?: string
  poolId?: string
  sourceContractId?: string
}) {
  try {
    const { session, t } = await assertRecurringAccess()
    if (!input.title.trim()) throw new Error(t('fillRequiredFields'))
    if (!input.categoryId || !input.poolId) throw new Error(t('fillRequiredFields'))
    if (!Number.isFinite(input.amount) || input.amount === 0) throw new Error(t('fillRequiredFields'))
    const intervalMonths = Math.max(1, Math.floor(input.intervalMonths || 1))
    const nextDue = normalizeDueDate(new Date(input.nextDueDate))
    if (Number.isNaN(nextDue.getTime())) throw new Error(t('fillRequiredFields'))

    const signedAmount =
      input.type === 'EXPENSE' ? -Math.abs(input.amount) : Math.abs(input.amount)

    const template = await prisma.recurringTemplate.create({
      data: {
        type: input.type,
        title: input.title.trim(),
        note: input.note?.trim() || null,
        amount: signedAmount,
        intervalMonths,
        dayOfMonth: preferredDayOfMonth(nextDue),
        nextDueDate: nextDue,
        reminderDays: input.reminderDays ?? 15,
        userId: session.userId,
        categoryId: input.categoryId,
        subCategoryId: input.subCategoryId || null,
        thirdCategoryId: input.thirdCategoryId || null,
        poolId: input.poolId,
        sourceContractId: input.sourceContractId || null,
      },
    })

    await ensureOpenInstance({
      id: template.id,
      nextDueDate: template.nextDueDate,
      amount: template.amount,
      note: template.note,
      userId: template.userId,
      reminderDays: template.reminderDays,
    })

    revalidatePath('/recurring')
    revalidatePath('/')
    return { success: true, template }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function deleteRecurringTemplate(templateId: string) {
  try {
    await assertRecurringAccess()
    await prisma.recurringTemplate.delete({ where: { id: templateId } })
    revalidatePath('/recurring')
    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function updateRecurringTemplate(input: {
  templateId: string
  type: 'INCOME' | 'EXPENSE'
  title: string
  note?: string
  amount: number
  intervalMonths: number
  nextDueDate: string
  reminderDays?: number
  categoryId: string
  subCategoryId?: string
  thirdCategoryId?: string
  poolId?: string
}) {
  try {
    const { t } = await assertRecurringAccess()
    if (!input.templateId) throw new Error(t('fillRequiredFields'))
    if (!input.title.trim()) throw new Error(t('fillRequiredFields'))
    if (!input.categoryId || !input.poolId) throw new Error(t('fillRequiredFields'))
    if (!Number.isFinite(input.amount) || input.amount === 0) throw new Error(t('fillRequiredFields'))

    const existing = await prisma.recurringTemplate.findUnique({
      where: { id: input.templateId },
      include: {
        instances: { where: { status: 'OPEN' }, orderBy: { dueDate: 'asc' }, take: 1 },
      },
    })
    if (!existing) throw new Error(t('recurringNotFound'))

    const intervalMonths = Math.max(1, Math.floor(input.intervalMonths || 1))
    const nextDue = normalizeDueDate(new Date(input.nextDueDate))
    if (Number.isNaN(nextDue.getTime())) throw new Error(t('fillRequiredFields'))

    const signedAmount =
      input.type === 'EXPENSE' ? -Math.abs(input.amount) : Math.abs(input.amount)

    const template = await prisma.recurringTemplate.update({
      where: { id: input.templateId },
      data: {
        type: input.type,
        title: input.title.trim(),
        note: input.note?.trim() || null,
        amount: signedAmount,
        intervalMonths,
        dayOfMonth: preferredDayOfMonth(nextDue),
        nextDueDate: nextDue,
        reminderDays: input.reminderDays ?? 15,
        categoryId: input.categoryId,
        subCategoryId: input.subCategoryId || null,
        thirdCategoryId: input.thirdCategoryId || null,
        poolId: input.poolId,
      },
    })

    const open = existing.instances[0]
    const oldDueKey = normalizeDueDate(existing.nextDueDate).getTime()
    const newDueKey = nextDue.getTime()

    if (open) {
      if (oldDueKey !== newDueKey) {
        // Move open instance to the new due date when possible
        const clash = await prisma.recurringInstance.findUnique({
          where: {
            templateId_dueDate: {
              templateId: template.id,
              dueDate: nextDue,
            },
          },
        })
        if (clash && clash.id !== open.id) {
          await prisma.recurringInstance.update({
            where: { id: open.id },
            data: {
              status: 'SKIPPED',
              processedAt: new Date(),
            },
          })
          if (clash.status === 'OPEN') {
            await prisma.recurringInstance.update({
              where: { id: clash.id },
              data: {
                amount: signedAmount,
                note: template.note,
              },
            })
          }
        } else {
          await prisma.recurringInstance.update({
            where: { id: open.id },
            data: {
              dueDate: nextDue,
              amount: signedAmount,
              note: template.note,
            },
          })
        }
      } else {
        await prisma.recurringInstance.update({
          where: { id: open.id },
          data: {
            amount: signedAmount,
            note: template.note,
          },
        })
      }
    } else {
      await ensureOpenInstance({
        id: template.id,
        nextDueDate: template.nextDueDate,
        amount: template.amount,
        note: template.note,
        userId: template.userId,
        reminderDays: template.reminderDays,
      })
    }

    revalidatePath('/recurring')
    revalidatePath('/')
    return { success: true, template }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function updateOpenInstance(input: {
  instanceId: string
  amount: number
  note?: string
  attachment?: AttachmentPayload
}) {
  try {
    const { session, t } = await assertRecurringAccess()
    const instance = await prisma.recurringInstance.findUnique({
      where: { id: input.instanceId },
      include: { template: true },
    })
    if (!instance || instance.status !== 'OPEN') throw new Error(t('recurringInstanceNotFound'))

    const signedAmount =
      instance.template.type === 'EXPENSE'
        ? -Math.abs(input.amount)
        : Math.abs(input.amount)

    await prisma.recurringInstance.update({
      where: { id: instance.id },
      data: {
        amount: signedAmount,
        note: input.note?.trim() || null,
      },
    })

    if (input.attachment) {
      await prisma.attachment.create({
        data: {
          fileUrl: input.attachment.url,
          size: input.attachment.size,
          note: input.attachment.note,
          uploaderId: session.userId,
          categoryId: instance.template.categoryId,
          recurringInstanceId: instance.id,
        },
      })
    }

    revalidatePath('/recurring')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

async function advanceTemplate(templateId: string) {
  const template = await prisma.recurringTemplate.findUnique({ where: { id: templateId } })
  if (!template) return
  const nextDueDate = addMonthsClamped(
    template.nextDueDate,
    template.intervalMonths,
    template.dayOfMonth
  )
  await prisma.recurringTemplate.update({
    where: { id: templateId },
    data: { nextDueDate },
  })
  await ensureOpenInstance({
    id: template.id,
    nextDueDate,
    amount: template.amount,
    note: template.note,
    userId: template.userId,
    reminderDays: template.reminderDays,
  })
}

/** Skip this period — no public ledger record; advance cycle by rule A. */
export async function skipRecurringInstance(instanceId: string) {
  try {
    const { t } = await assertRecurringAccess()
    const instance = await prisma.recurringInstance.findUnique({
      where: { id: instanceId },
    })
    if (!instance || instance.status !== 'OPEN') throw new Error(t('recurringInstanceNotFound'))

    await prisma.recurringInstance.update({
      where: { id: instanceId },
      data: { status: 'SKIPPED', processedAt: new Date() },
    })
    await advanceTemplate(instance.templateId)

    revalidatePath('/recurring')
    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/** Convert this period into a public ledger record, then detach (no link kept). */
export async function convertRecurringInstanceToRecord(input: {
  instanceId: string
  amount?: number
  note?: string
  date?: string
  attachment?: AttachmentPayload
}) {
  try {
    const { t } = await assertRecurringAccess()
    const instance = await prisma.recurringInstance.findUnique({
      where: { id: input.instanceId },
      include: { template: true, attachments: true },
    })
    if (!instance || instance.status !== 'OPEN') throw new Error(t('recurringInstanceNotFound'))

    const template = instance.template
    const amountValue =
      input.amount !== undefined && Number.isFinite(input.amount)
        ? input.amount
        : instance.amount ?? template.amount
    const signedAmount =
      template.type === 'EXPENSE' ? -Math.abs(amountValue) : Math.abs(amountValue)

    const recordDate = input.date
      ? normalizeDueDate(new Date(input.date))
      : normalizeDueDate(new Date())

    const attachment =
      input.attachment ||
      (instance.attachments[0]
        ? {
            url: instance.attachments[0].fileUrl,
            size: instance.attachments[0].size,
            note: instance.attachments[0].note || undefined,
          }
        : undefined)

    const created = await createRecord({
      type: template.type as 'INCOME' | 'EXPENSE',
      date: recordDate,
      note: (input.note ?? instance.note ?? template.note) || undefined,
      amount: signedAmount,
      categoryId: template.categoryId,
      subCategoryId: template.subCategoryId || undefined,
      thirdCategoryId: template.thirdCategoryId || undefined,
      poolId: template.poolId || undefined,
      attachment,
    })

    if (!created.success) {
      throw new Error(created.error || t('submitFailed'))
    }

    // Detach: mark converted with no linkedRecordId (by design)
    await prisma.recurringInstance.update({
      where: { id: instance.id },
      data: {
        status: 'CONVERTED',
        processedAt: new Date(),
        amount: signedAmount,
        note: (input.note ?? instance.note) || null,
      },
    })
    await advanceTemplate(template.id)

    revalidatePath('/recurring')
    revalidatePath('/')
    revalidatePath('/report')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function getRecurringReminderItems() {
  try {
    const session = await getSession()
    if (!session) return []
    if (!hasPublicLedgerAccess(session)) return []

    const flags = await getPluginFlags()
    if (!flags.recurring) return []

    const templates = await prisma.recurringTemplate.findMany({
      select: {
        id: true,
        title: true,
        nextDueDate: true,
        reminderDays: true,
      },
      orderBy: { nextDueDate: 'asc' },
    })

    const today = new Date()
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())

    const items = templates
      .map((template) => {
        const target = normalizeDueDate(template.nextDueDate)
        const daysDiff = Math.ceil((target.getTime() - startOfToday.getTime()) / 86400000)
        let bucket: 'overdue' | 'today' | 'upcoming' | null = null
        if (daysDiff < 0) bucket = 'overdue'
        else if (daysDiff === 0) bucket = 'today'
        else if (daysDiff <= template.reminderDays) bucket = 'upcoming'
        if (!bucket) return null
        return {
          id: template.id,
          title: template.title,
          targetDate: target.toISOString(),
          bucket,
          daysDiff,
          reminderDays: template.reminderDays,
          href: '/recurring',
        }
      })
      .filter(Boolean)

    return items as any[]
  } catch {
    return []
  }
}
