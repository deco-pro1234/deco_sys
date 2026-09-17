import prisma from '@/lib/prisma'
import { normalizePhoneE164 } from './phone'

/**
 * 將聯絡電話正規化成 E.164 純數字；空字串回 null。
 * 無效（過短）時回傳 { ok:false }。
 */
export function normalizeContactPhoneInput(raw: string | null | undefined): {
  ok: true
  phoneE164: string | null
} | {
  ok: false
  error: string
} {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return { ok: true, phoneE164: null }
  const phoneE164 = normalizePhoneE164(trimmed)
  if (!phoneE164 || phoneE164.length < 8) {
    return {
      ok: false,
      error: '電話格式無效，請含國碼（如 85291234567 或 +852 9123 4567）',
    }
  }
  return { ok: true, phoneE164 }
}

/**
 * 以聯絡電話同步 WhatsAppBinding：
 * - 有號碼：upsert 綁定到此 user（若號碼屬他人則改掛到此 user）
 * - 清空號碼：停用／刪除此 user 名下綁定（僅當綁定號碼等於舊正規化號碼時較安全；此處刪除此 user 全部綁定）
 *
 * 用於個人資料儲存後，讓「用戶資料電話」即可作為 WhatsApp 身份。
 */
export async function syncWhatsAppBindingForUser(
  userId: string,
  phoneE164: string | null,
) {
  if (!phoneE164) {
    await prisma.whatsAppBinding.deleteMany({ where: { userId } })
    return
  }

  const existing = await prisma.whatsAppBinding.findUnique({ where: { phoneE164 } })
  if (existing && existing.userId !== userId) {
    await prisma.whatsAppBinding.delete({ where: { id: existing.id } })
  }

  // 移除此用戶其他舊號碼綁定，保持一人一號
  await prisma.whatsAppBinding.deleteMany({
    where: { userId, phoneE164: { not: phoneE164 } },
  })

  await prisma.whatsAppBinding.upsert({
    where: { phoneE164 },
    create: { phoneE164, userId, enabled: true },
    update: { userId, enabled: true },
  })
}

/**
 * 綁定表寫入時，反寫 UserProfile.contactPhone（方便用戶列表／個人資料一致）。
 */
export async function mirrorPhoneToUserProfile(userId: string, phoneE164: string) {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { userId: true, legalNameEn: true },
  })
  if (profile) {
    await prisma.userProfile.update({
      where: { userId },
      data: { contactPhone: phoneE164 },
    })
    return
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { roleName: true },
  })
  if (!user) return

  await prisma.userProfile.create({
    data: {
      userId,
      legalNameEn: user.roleName || 'User',
      contactPhone: phoneE164,
    },
  })
}
