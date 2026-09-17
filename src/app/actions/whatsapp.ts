'use server'

import prisma from '@/lib/prisma'
import { getSession } from './auth'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'
import { normalizePhoneE164 } from '@/lib/whatsapp/phone'
import { mirrorPhoneToUserProfile } from '@/lib/whatsapp/phoneSync'

/**
 * 管理員：綁定／更新 WhatsApp 電話與用戶。
 */
export async function upsertWhatsAppBinding(userId: string, phone: string, enabled = true) {
  const session = await getSession()
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  if (!session?.isAdmin) {
    return { success: false as const, error: t('unauthorized') }
  }

  const phoneE164 = normalizePhoneE164(phone)
  if (!phoneE164 || phoneE164.length < 8) {
    return { success: false as const, error: '電話格式無效（請含國碼，如 85291234567）' }
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) return { success: false as const, error: '用戶不存在' }

  // 若電話已被其他人綁定，先解除
  const existing = await prisma.whatsAppBinding.findUnique({ where: { phoneE164 } })
  if (existing && existing.userId !== userId) {
    await prisma.whatsAppBinding.delete({ where: { id: existing.id } })
  }

  // 一人一號：清掉該用戶其他綁定
  await prisma.whatsAppBinding.deleteMany({
    where: { userId, phoneE164: { not: phoneE164 } },
  })

  const binding = await prisma.whatsAppBinding.upsert({
    where: { phoneE164 },
    create: { phoneE164, userId, enabled },
    update: { userId, enabled },
  })

  // 反寫個人資料聯絡電話，方便身份識別與列表顯示
  if (enabled) {
    await mirrorPhoneToUserProfile(userId, phoneE164)
  }

  return { success: true as const, binding }
}

export async function listWhatsAppBindings() {
  const session = await getSession()
  if (!session?.isAdmin) return []

  try {
    return await prisma.whatsAppBinding.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        user: { select: { id: true, roleName: true, email: true, isAdmin: true } },
      },
    })
  } catch {
    // 遷移尚未套用時避免管理頁崩潰
    return []
  }
}

export async function removeWhatsAppBinding(bindingId: string) {
  const session = await getSession()
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  if (!session?.isAdmin) {
    return { success: false as const, error: t('unauthorized') }
  }

  await prisma.whatsAppBinding.delete({ where: { id: bindingId } })
  return { success: true as const }
}
