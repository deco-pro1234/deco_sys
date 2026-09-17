'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession, hashPassword } from './auth'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'
import type { PublicLedgerRole } from '@/lib/access'
import type { UserProfileSnapshotInput } from '@/lib/payroll/calc'
import {
  normalizeContactPhoneInput,
  syncWhatsAppBindingForUser,
} from '@/lib/whatsapp/phoneSync'

async function checkAdmin() {
  const session = await getSession()
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  if (!session || !session.isAdmin) {
    throw new Error(t('unauthorized'))
  }
}

// 获取所有用户 (仅管理员可调用所有，非管理员只能获取自己)
export async function getUsers() {
  const session = await getSession()
  if (!session) return []
  if (session.isAdmin) {
    return await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        profile: { select: { contactPhone: true } },
        whatsappBindings: {
          where: { enabled: true },
          select: { phoneE164: true },
          take: 1,
        },
      },
    })
  } else {
    return await prisma.user.findMany({
      where: { id: session.userId },
      include: {
        profile: { select: { contactPhone: true } },
        whatsappBindings: {
          where: { enabled: true },
          select: { phoneE164: true },
          take: 1,
        },
      },
    })
  }
}

type CreateUserPayload = {
  email: string
  password: string
  roleName: string
  isAdmin: boolean
  publicLedgerRole?: PublicLedgerRole
  ocrEnabled?: boolean
  profile?: UserProfileSnapshotInput & { emergencyName?: string | null; emergencyPhone?: string | null }
}

// 创建用户（管理员用；含 email + roleName + 可選個人資料一次性存）
export async function createUser(data: CreateUserPayload) {
  try {
    await checkAdmin()
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)

    const email = String(data.email || '').trim().toLowerCase()
    const roleName = String(data.roleName || '').trim()
    const password = String(data.password || '')

    if (!email) return { success: false, error: t('accountRequired') }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, error: t('emailInvalid') }
    if (!password) return { success: false, error: t('enterPassword') }
    if (!roleName) return { success: false, error: t('roleNamePlaceholder') }

    const saved = await prisma.$transaction(async tx => {
      const emailConflict = await tx.user.findUnique({ where: { email }, select: { id: true } })
      if (emailConflict) {
        throw new Error(t('accountExists'))
      }

      const user = await tx.user.create({
        data: {
          email,
          password: await hashPassword(password),
          roleName,
          isAdmin: data.isAdmin,
          poolEnabled: false,
          publicLedgerRole: data.isAdmin ? 'MEMBER' : (data.publicLedgerRole ?? 'NONE'),
          ocrEnabled: data.ocrEnabled ?? true,
        },
      })

      if (
        data.profile &&
        (data.profile.legalNameEn ||
          data.profile.jobTitle ||
          data.profile.defaultBaseSalaryHkd ||
          data.profile.contactPhone)
      ) {
        const p = data.profile
        const phoneNorm = normalizeContactPhoneInput(p.contactPhone)
        if (!phoneNorm.ok) {
          throw new Error(phoneNorm.error)
        }
        await tx.userProfile.create({
          data: {
            userId: user.id,
            legalNameEn: p.legalNameEn?.trim() || roleName,
            legalNameZh: p.legalNameZh || null,
            hkid: p.hkid || null,
            passportNo: p.passportNo || null,
            dateOfBirth: p.dateOfBirth ? new Date(p.dateOfBirth as string) : null,
            jobTitle: p.jobTitle || null,
            department: p.department || null,
            dateJoined: p.dateJoined ? new Date(p.dateJoined as string) : null,
            defaultBaseSalaryHkd: Number(p.defaultBaseSalaryHkd) || 0,
            bankName: p.bankName || null,
            bankAccountNo: p.bankAccountNo || null,
            mpfAccountNo: p.mpfAccountNo || null,
            addressLine1: p.addressLine1 || null,
            addressLine2: p.addressLine2 || null,
            contactPhone: phoneNorm.phoneE164,
            contactEmail: p.contactEmail || null,
            emergencyName: (p as any).emergencyName || null,
            emergencyPhone: (p as any).emergencyPhone || null,
          },
        })
        return { user, contactPhone: phoneNorm.phoneE164 }
      }

      return { user, contactPhone: null as string | null }
    })

    if (saved.contactPhone) {
      await syncWhatsAppBindingForUser(saved.user.id, saved.contactPhone)
    }

    revalidatePath('/admin')
    revalidatePath('/admin/payroll')
    return { success: true, user: saved.user }
  } catch (error: any) {
    return { success: false, error: error.message || '建立失敗' }
  }
}

// 更新用户（支援 email / password / roleName / 公開帳本 / OCR）
export async function updateUser(id: string, data: { email?: string; password?: string; roleName?: string; isAdmin?: boolean; publicLedgerRole?: PublicLedgerRole; ocrEnabled?: boolean }) {
  try {
    await checkAdmin()
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)

    const updateData: any = { ...data }
    if (data.email) {
      const email = String(data.email).trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, error: t('emailInvalid') }
      const conflict = await prisma.user.findUnique({ where: { email }, select: { id: true } })
      if (conflict && conflict.id !== id) return { success: false, error: t('accountExists') }
      updateData.email = email
    }
    if (data.password) {
      updateData.password = await hashPassword(data.password)
    }
    if (data.isAdmin) {
      updateData.publicLedgerRole = 'MEMBER'
    }

    const user = await prisma.$transaction(async tx => {
      const updated = await tx.user.update({
        where: { id },
        data: updateData,
      })
      if ((data.roleName || data.email) && updated.poolEnabled) {
        await tx.capitalPool.updateMany({
          where: { userId: id },
          data: { name: updated.roleName },
        })
      }
      return updated
    })

    revalidatePath('/admin')
    revalidatePath('/')
    revalidatePath('/admin/payroll')
    return { success: true, user }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// 删除用户（先刪 UserProfile 避免 FK 卡住）
export async function deleteUser(id: string) {
  try {
    await checkAdmin()
    await prisma.$transaction([
      prisma.userProfile.deleteMany({ where: { userId: id } }),
      prisma.user.delete({ where: { id } }),
    ])
    revalidatePath('/admin')
    revalidatePath('/admin/payroll')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// 切换资金池状态
export async function toggleUserPool(id: string, enabled: boolean) {
  try {
    await checkAdmin()
    const user = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id },
        data: { poolEnabled: enabled }
      })

      if (enabled) {
        // 启用：如果不存在对应的资金池，则创建一个
        const existingPool = await tx.capitalPool.findFirst({
          where: { userId: id }
        })
        if (!existingPool) {
          await tx.capitalPool.create({
            data: {
              name: updatedUser.roleName,
              userId: updatedUser.id
            }
          })
        }
      }
      return updatedUser
    })
    // 如果禁用，在页面上资金池置灰即可，不删除历史数据
    revalidatePath('/admin')
    return { success: true, user }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
