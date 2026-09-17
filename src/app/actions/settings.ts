'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from './auth'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'
import {
  DEFAULT_OCR_SYSTEM_PROMPT,
  DEFAULT_OCR_USER_PROMPT,
  OCR_SETTING_KEYS,
} from '@/lib/ocr'
import {
  DEFAULT_PLUGIN_FLAGS,
  PLUGIN_SETTING_KEYS,
  type PluginFlags,
  type PluginId,
} from '@/lib/plugins'

export type AISettings = {
  enabled: boolean
  model: string
  systemPrompt: string
  userPrompt: string
}

function getDefaultAISettings(): AISettings {
  return {
    enabled: (process.env.OCR_ENABLED || 'true') !== 'false',
    model: process.env.OCR_MODEL || 'gpt-4.1-mini',
    systemPrompt: DEFAULT_OCR_SYSTEM_PROMPT,
    userPrompt: DEFAULT_OCR_USER_PROMPT,
  }
}

async function assertAdmin() {
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  const session = await getSession()

  if (!session || !session.isAdmin) {
    throw new Error(t('unauthorized'))
  }
}

export async function getAISettings() {
  const defaults = getDefaultAISettings()

  const settings = await prisma.systemSetting.findMany({
    where: {
      key: {
        in: Object.values(OCR_SETTING_KEYS),
      },
    },
  })

  const map = new Map(settings.map((item) => [item.key, item.value]))

  return {
    enabled: map.get(OCR_SETTING_KEYS.enabled)
      ? map.get(OCR_SETTING_KEYS.enabled) === 'true'
      : defaults.enabled,
    model: map.get(OCR_SETTING_KEYS.model) || defaults.model,
    systemPrompt: map.get(OCR_SETTING_KEYS.systemPrompt) || defaults.systemPrompt,
    userPrompt: map.get(OCR_SETTING_KEYS.userPrompt) || defaults.userPrompt,
  } satisfies AISettings
}

export async function updateAISettings(input: AISettings) {
  try {
    await assertAdmin()

    const entries: Array<[string, string]> = [
      [OCR_SETTING_KEYS.enabled, String(input.enabled)],
      [OCR_SETTING_KEYS.model, input.model.trim()],
      [OCR_SETTING_KEYS.systemPrompt, input.systemPrompt.trim()],
      [OCR_SETTING_KEYS.userPrompt, input.userPrompt.trim()],
    ]

    await prisma.$transaction(
      entries.map(([key, value]) =>
        prisma.systemSetting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        })
      )
    )

    revalidatePath('/admin')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function getPluginFlags(): Promise<PluginFlags> {
  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: Object.values(PLUGIN_SETTING_KEYS) } },
  })
  const map = new Map(settings.map((item) => [item.key, item.value]))
  const flags = { ...DEFAULT_PLUGIN_FLAGS }
  ;(Object.keys(PLUGIN_SETTING_KEYS) as PluginId[]).forEach((id) => {
    const key = PLUGIN_SETTING_KEYS[id]
    if (map.has(key)) {
      flags[id] = map.get(key) === 'true'
    }
  })
  return flags
}

export async function updatePluginFlags(input: PluginFlags) {
  try {
    await assertAdmin()
    const entries = (Object.keys(PLUGIN_SETTING_KEYS) as PluginId[]).map((id) => [
      PLUGIN_SETTING_KEYS[id],
      String(Boolean(input[id])),
    ] as [string, string])

    await prisma.$transaction(
      entries.map(([key, value]) =>
        prisma.systemSetting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        })
      )
    )

    revalidatePath('/')
    revalidatePath('/admin')
    revalidatePath('/activities')
    revalidatePath('/contracts')
    revalidatePath('/admin/payroll')
    revalidatePath('/recurring')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
