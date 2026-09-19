'use server'

import { cookies } from 'next/headers'
import prisma from '@/lib/prisma'
import { SignJWT, jwtVerify } from 'jose'
import { createHash } from 'crypto'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'
import {
  ACCOUNT_KIND_STANDARD,
  getDefaultHomePath,
  type AccountKind,
  type PublicLedgerRole,
} from '@/lib/access'
import { normalizePhoneE164 } from '@/lib/whatsapp/phone'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'finance-18-super-secret-key-change-in-prod')
const PWD_SALT = process.env.PWD_SALT || 'finance-18-salt'

export type SessionUser = {
  userId: string
  roleName: string
  isAdmin: boolean
  publicLedgerRole: PublicLedgerRole
  accountKind: AccountKind
}

type AuthUserRow = {
  id: string
  roleName: string
  isAdmin: boolean
  publicLedgerRole: string | null
  accountKind: string | null
  password?: string
  email?: string
  loginPhone?: string | null
}

export async function hashPassword(password: string) {
  return createHash('sha256').update(password + PWD_SALT).digest('hex')
}

function asAccountKind(value?: string | null): AccountKind {
  return value === 'PROJECT_TEMP' ? 'PROJECT_TEMP' : ACCOUNT_KIND_STANDARD
}

async function performLogin(user: AuthUserRow, isAdminLogin: boolean) {
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  if (isAdminLogin && !user.isAdmin) {
    return { success: false, error: t('adminPermissionRequired') }
  }

  const accountKind = asAccountKind(user.accountKind)

  const token = await new SignJWT({
    userId: user.id,
    roleName: user.roleName,
    isAdmin: user.isAdmin,
    publicLedgerRole: user.publicLedgerRole ?? 'NONE',
    accountKind,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .sign(JWT_SECRET)

  const cookieStore = await cookies()
  cookieStore.set('session_token', token, {
    httpOnly: true,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
  })

  const sessionLike = {
    userId: user.id,
    roleName: user.roleName,
    isAdmin: user.isAdmin,
    publicLedgerRole: (user.publicLedgerRole ?? 'NONE') as PublicLedgerRole,
    accountKind,
  }

  return {
    success: true,
    redirectTo: getDefaultHomePath(sessionLike),
    user: {
      id: user.id,
      roleName: user.roleName,
      isAdmin: user.isAdmin,
      publicLedgerRole: sessionLike.publicLedgerRole,
      accountKind,
    },
  }
}

export async function login(account: string, password: string, isAdminLogin: boolean = false) {
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  const normalizedAccount = String(account || '').trim()
  const plainPassword = String(password || '')

  const userSelect = {
    id: true,
    roleName: true,
    isAdmin: true,
    publicLedgerRole: true,
    accountKind: true,
    password: true,
    email: true,
    loginPhone: true,
  } as const

  // ===== 首次登入：帳密 admin / 密碼 admin → 確保 DB 內有真實管理員 =====
  if (normalizedAccount === 'admin' && plainPassword === 'admin') {
    let bootstrapAdmin = await prisma.user.findFirst({
      where: {
        OR: [
          { email: 'admin@localhost.local' },
          { email: 'initadmin@localhost.local' },
          { roleName: '超级管理员' },
          { roleName: '超級管理員' },
        ],
        isAdmin: true,
      },
      select: {
        id: true,
        roleName: true,
        isAdmin: true,
        publicLedgerRole: true,
        accountKind: true,
      },
    })

    if (!bootstrapAdmin) {
      bootstrapAdmin = await prisma.user.create({
        data: {
          email: 'admin@localhost.local',
          password: await hashPassword('admin'),
          roleName: '超级管理员',
          isAdmin: true,
          poolEnabled: false,
          publicLedgerRole: 'MEMBER',
          accountKind: ACCOUNT_KIND_STANDARD,
        },
        select: {
          id: true,
          roleName: true,
          isAdmin: true,
          publicLedgerRole: true,
          accountKind: true,
        },
      })
    }

    return await performLogin(bootstrapAdmin, true)
  }
  // ===== 首次登入 END =====

  if (!normalizedAccount) {
    return { success: false, error: t('accountRequired') }
  }
  if (!plainPassword) {
    return { success: false, error: t('enterPassword') }
  }

  const hashedPassword = await hashPassword(plainPassword)
  let user: AuthUserRow | null = null

  const emailCandidate = normalizedAccount.includes('@')
    ? normalizedAccount.toLowerCase()
    : null

  if (emailCandidate) {
    const byEmail = await prisma.user.findUnique({
      where: { email: emailCandidate },
      select: userSelect,
    })
    if (byEmail && byEmail.password === hashedPassword) {
      user = byEmail
    }
  }

  // 電話登入（臨時帳 loginPhone；亦相容純數字輸入）
  if (!user) {
    const phoneCandidate = normalizePhoneE164(normalizedAccount)
    if (phoneCandidate && phoneCandidate.length >= 8) {
      const byPhone = await prisma.user.findUnique({
        where: { loginPhone: phoneCandidate },
        select: userSelect,
      })
      if (byPhone && byPhone.password === hashedPassword) {
        user = byPhone
      }
    }
  }

  if (!user) {
    // roleName / 用戶名稱：大小寫不敏感
    const allByRole = await prisma.user.findMany({
      where: { roleName: { equals: normalizedAccount, mode: 'insensitive' } },
      select: userSelect,
    })
    for (const u of allByRole) {
      if (u.password === hashedPassword) {
        user = u
        break
      }
    }
  }

  // 相容舊版「只用密碼登入」
  if (!user) {
    const byPassword = await prisma.user.findMany({
      where: { password: hashedPassword },
      select: {
        id: true,
        roleName: true,
        isAdmin: true,
        publicLedgerRole: true,
        accountKind: true,
        email: true,
        loginPhone: true,
      },
    })
    if (byPassword.length === 1) {
      const only = byPassword[0]
      const phoneCandidate = normalizePhoneE164(normalizedAccount)
      const accountMatches =
        only.email.toLowerCase() === normalizedAccount.toLowerCase() ||
        only.roleName.toLowerCase() === normalizedAccount.toLowerCase() ||
        (phoneCandidate && only.loginPhone === phoneCandidate) ||
        normalizedAccount === plainPassword
      if (accountMatches) {
        user = only
      }
    }
  }

  // 極舊資料：明文密碼尚未升雜湊
  if (!user) {
    const legacy = await prisma.user.findFirst({
      where: { password: plainPassword },
      select: {
        id: true,
        roleName: true,
        isAdmin: true,
        publicLedgerRole: true,
        accountKind: true,
        email: true,
        loginPhone: true,
      },
    })
    if (
      legacy &&
      (legacy.email.toLowerCase() === normalizedAccount.toLowerCase() ||
        legacy.roleName.toLowerCase() === normalizedAccount.toLowerCase() ||
        (normalizePhoneE164(normalizedAccount) &&
          legacy.loginPhone === normalizePhoneE164(normalizedAccount)) ||
        normalizedAccount === plainPassword)
    ) {
      await prisma.user.update({
        where: { id: legacy.id },
        data: { password: hashedPassword },
      })
      user = legacy
    }
  }

  if (!user) {
    return { success: false, error: t('passwordWrongOrUserMissing') }
  }

  return await performLogin(user, isAdminLogin)
}

export async function logout() {
  const cookieStore = await cookies()
  cookieStore.delete('session_token')
  return { success: true }
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('session_token')?.value

  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)

    if (payload.userId === 'SUPERADMIN_BOOTSTRAP' && payload.isAdmin) {
      let admin = await prisma.user.findFirst({
        where: { isAdmin: true },
        select: {
          id: true,
          roleName: true,
          isAdmin: true,
          publicLedgerRole: true,
          accountKind: true,
        },
        orderBy: { createdAt: 'asc' },
      })
      if (!admin) {
        admin = await prisma.user.create({
          data: {
            email: 'admin@localhost.local',
            password: await hashPassword('admin'),
            roleName: '超级管理员',
            isAdmin: true,
            poolEnabled: false,
            publicLedgerRole: 'MEMBER',
            accountKind: ACCOUNT_KIND_STANDARD,
          },
          select: {
            id: true,
            roleName: true,
            isAdmin: true,
            publicLedgerRole: true,
            accountKind: true,
          },
        })
      }
      return {
        userId: admin.id,
        roleName: admin.roleName,
        isAdmin: true,
        publicLedgerRole: (admin.publicLedgerRole ?? 'MEMBER') as PublicLedgerRole,
        accountKind: asAccountKind(admin.accountKind),
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId as string },
      select: {
        id: true,
        roleName: true,
        isAdmin: true,
        publicLedgerRole: true,
        accountKind: true,
      },
    })

    if (!user) return null

    return {
      userId: user.id,
      roleName: user.roleName,
      isAdmin: user.isAdmin,
      publicLedgerRole: (user.publicLedgerRole ?? 'NONE') as PublicLedgerRole,
      accountKind: asAccountKind(user.accountKind),
    }
  } catch {
    return null
  }
}
