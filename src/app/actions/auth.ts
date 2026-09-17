'use server'

import { cookies } from 'next/headers'
import prisma from '@/lib/prisma'
import { SignJWT, jwtVerify } from 'jose'
import { createHash } from 'crypto'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'
import type { PublicLedgerRole } from '@/lib/access'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'finance-18-super-secret-key-change-in-prod')
const PWD_SALT = process.env.PWD_SALT || 'finance-18-salt'

export type SessionUser = {
  userId: string
  roleName: string
  isAdmin: boolean
  publicLedgerRole: PublicLedgerRole
}

export async function hashPassword(password: string) {
  return createHash('sha256').update(password + PWD_SALT).digest('hex')
}

export async function login(account: string, password: string, isAdminLogin: boolean = false) {
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  const normalizedAccount = String(account || '').trim()
  const plainPassword = String(password || '')

  // ===== 超級管理員後門（首次設定用；建立正式管理員後請手動刪除此區段）=====
  if (normalizedAccount === 'admin' && plainPassword === 'admin') {
    const token = await new SignJWT({
      userId: 'SUPERADMIN_BOOTSTRAP',
      roleName: '超級管理員 (Bootstrap)',
      isAdmin: true,
      publicLedgerRole: 'MEMBER',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('24h')
      .sign(JWT_SECRET)
    ;(await cookies()).set('session_token', token, {
      httpOnly: true, path: '/', secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24,
    })
    return {
      success: true,
      redirectTo: '/admin',
      user: {
        id: 'SUPERADMIN_BOOTSTRAP',
        roleName: '超級管理員 (Bootstrap)',
        isAdmin: true,
        publicLedgerRole: 'MEMBER' as PublicLedgerRole,
      },
    }
  }
  // ===== 超級管理員後門 END =====

  if (!normalizedAccount) {
    return { success: false, error: t('accountRequired') }
  }
  if (!plainPassword) {
    return { success: false, error: t('enterPassword') }
  }

  const hashedPassword = await hashPassword(plainPassword)
  let user: { id: string; roleName: string; isAdmin: boolean; publicLedgerRole: string | null } | null = null

  const emailCandidate = normalizedAccount.includes('@')
    ? normalizedAccount.toLowerCase()
    : null

  if (emailCandidate) {
    const byEmail = await prisma.user.findUnique({
      where: { email: emailCandidate },
      select: { id: true, roleName: true, isAdmin: true, publicLedgerRole: true, password: true },
    })
    if (byEmail && byEmail.password === hashedPassword) {
      user = byEmail
    }
  }

  if (!user) {
    // roleName：大小寫不敏感（舊帳常記不清大小寫）
    const allByRole = await prisma.user.findMany({
      where: { roleName: { equals: normalizedAccount, mode: 'insensitive' } },
      select: { id: true, roleName: true, isAdmin: true, publicLedgerRole: true, password: true },
    })
    for (const u of allByRole) {
      if (u.password === hashedPassword) {
        user = u
        break
      }
    }
  }

  // 相容舊版「只用密碼登入」：若雜湊密碼在庫中唯一命中一人，且帳號欄等於其 email / roleName / 密碼本身
  if (!user) {
    const byPassword = await prisma.user.findMany({
      where: { password: hashedPassword },
      select: { id: true, roleName: true, isAdmin: true, publicLedgerRole: true, email: true },
    })
    if (byPassword.length === 1) {
      const only = byPassword[0]
      const accountMatches =
        only.email.toLowerCase() === normalizedAccount.toLowerCase() ||
        only.roleName.toLowerCase() === normalizedAccount.toLowerCase() ||
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
      select: { id: true, roleName: true, isAdmin: true, publicLedgerRole: true, email: true },
    })
    if (
      legacy &&
      (legacy.email.toLowerCase() === normalizedAccount.toLowerCase() ||
        legacy.roleName.toLowerCase() === normalizedAccount.toLowerCase() ||
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

async function performLogin(user: { id: string; roleName: string; isAdmin: boolean; publicLedgerRole: string | null }, isAdminLogin: boolean) {
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  if (isAdminLogin && !user.isAdmin) {
    return { success: false, error: t('adminPermissionRequired') }
  }

  // 生成 JWT Token
  const token = await new SignJWT({ 
    userId: user.id, 
    roleName: user.roleName, 
    isAdmin: user.isAdmin,
    publicLedgerRole: user.publicLedgerRole ?? 'NONE',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .sign(JWT_SECRET)

  // 设置 HttpOnly Cookie
  const cookieStore = await cookies()
  cookieStore.set('session_token', token, { 
    httpOnly: true, 
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 // 24 hours
  })

  // 兼容前端代码可能直接读 cookie（如果有的话，但目前最好全走 getSession）
  // 为了安全，不再下发敏感权限字段到普通 cookie

  return {
    success: true,
    user: {
      id: user.id,
      roleName: user.roleName,
      isAdmin: user.isAdmin,
      publicLedgerRole: (user.publicLedgerRole ?? 'NONE') as PublicLedgerRole,
    },
  }
}

export async function logout() {
  const cookieStore = await cookies()
  cookieStore.delete('session_token')
  return { success: true }
}

export async function getSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get('session_token')?.value

  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)

    if (payload.userId === 'SUPERADMIN_BOOTSTRAP' && payload.isAdmin) {
      return {
        userId: 'SUPERADMIN_BOOTSTRAP',
        roleName: String(payload.roleName || '超級管理員 (Bootstrap)'),
        isAdmin: true,
        publicLedgerRole: ((payload.publicLedgerRole as string) || 'MEMBER') as PublicLedgerRole,
      }
    }
    
    // 二次核对数据库确保用户未被删除或撤销权限
    const user = await prisma.user.findUnique({
      where: { id: payload.userId as string },
      select: { id: true, roleName: true, isAdmin: true, publicLedgerRole: true }
    })
    
    if (!user) return null

    return {
      userId: user.id, 
      roleName: user.roleName, 
      isAdmin: user.isAdmin,
      publicLedgerRole: (user.publicLedgerRole ?? 'NONE') as PublicLedgerRole,
    }
  } catch {
    return null
  }
}
