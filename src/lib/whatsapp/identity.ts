import prisma from '@/lib/prisma'
import { hasPublicLedgerAccess, type PublicLedgerRole } from '@/lib/access'
import { getWhatsAppConfig } from './config'
import { normalizePhoneE164, phonesMatch } from './phone'

export type WhatsAppActor = {
  userId: string
  roleName: string
  isAdmin: boolean
  publicLedgerRole: PublicLedgerRole
  phoneE164: string
}

/**
 * 將 WhatsApp 來電號碼解析為系統用戶。
 * 優先：WhatsAppBinding → UserProfile.contactPhone → 環境變數 WHATSAPP_USER_MAP
 * 格式：WHATSAPP_USER_MAP="85291111111:uuid,85292222222:uuid"
 */
export async function resolveWhatsAppActor(fromPhone: string): Promise<{
  actor: WhatsAppActor | null
  reason?: string
}> {
  const phoneE164 = normalizePhoneE164(fromPhone)
  if (!phoneE164) return { actor: null, reason: '無法識別電話號碼' }

  const config = getWhatsAppConfig()
  if (config?.allowedPhones && !config.allowedPhones.has(phoneE164)) {
    // 也允許尾碼比對（防止清單寫成較短形式）
    const allowed = [...config.allowedPhones].some((p) => phonesMatch(p, phoneE164))
    if (!allowed) {
      return { actor: null, reason: '此電話未在允許清單（WHATSAPP_ALLOWED_PHONES）' }
    }
  }

  // 1) 明確綁定表
  const binding = await prisma.whatsAppBinding.findUnique({
    where: { phoneE164 },
    include: {
      user: {
        select: {
          id: true,
          roleName: true,
          isAdmin: true,
          publicLedgerRole: true,
        },
      },
    },
  })
  if (binding?.enabled && binding.user) {
    return {
      actor: {
        userId: binding.user.id,
        roleName: binding.user.roleName,
        isAdmin: binding.user.isAdmin,
        publicLedgerRole: (binding.user.publicLedgerRole as PublicLedgerRole) || 'NONE',
        phoneE164,
      },
    }
  }

  // 2) 個人資料 contactPhone
  const profiles = await prisma.userProfile.findMany({
    where: { contactPhone: { not: null } },
    select: {
      contactPhone: true,
      user: {
        select: {
          id: true,
          roleName: true,
          isAdmin: true,
          publicLedgerRole: true,
        },
      },
    },
  })
  const byProfile = profiles.find((p) => phonesMatch(p.contactPhone || '', phoneE164))
  if (byProfile?.user) {
    return {
      actor: {
        userId: byProfile.user.id,
        roleName: byProfile.user.roleName,
        isAdmin: byProfile.user.isAdmin,
        publicLedgerRole: (byProfile.user.publicLedgerRole as PublicLedgerRole) || 'NONE',
        phoneE164,
      },
    }
  }

  // 3) 環境變數對照
  const mapRaw = process.env.WHATSAPP_USER_MAP || ''
  for (const part of mapRaw.split(/[,;]+/)) {
    const [phone, userId] = part.split(':').map((s) => s.trim())
    if (!phone || !userId) continue
    if (!phonesMatch(phone, phoneE164)) continue
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, roleName: true, isAdmin: true, publicLedgerRole: true },
    })
    if (user) {
      return {
        actor: {
          userId: user.id,
          roleName: user.roleName,
          isAdmin: user.isAdmin,
          publicLedgerRole: (user.publicLedgerRole as PublicLedgerRole) || 'NONE',
          phoneE164,
        },
      }
    }
  }

  return {
    actor: null,
    reason:
      '尚未綁定 WhatsApp。請在個人資料或管理後台填寫含國碼的聯絡電話並儲存，或於 WhatsApp 分頁手動綁定。',
  }
}

export function actorCanUsePublicLedger(actor: WhatsAppActor) {
  return hasPublicLedgerAccess(actor)
}
