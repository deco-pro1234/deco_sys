'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from './auth'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'

async function checkAdmin() {
  const session = await getSession()
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  if (!session || !session.isAdmin) {
    throw new Error(t('unauthorized'))
  }
}

// 获取资金池
export async function getCapitalPools(userId?: string) {
  let where = {}
  if (userId) {
    where = {
      OR: [
        { userId: userId },
        { isReviewRequired: true },
        { userId: null } // 假设 null 的池子所有人可见，或根据业务需求调整。我们先包含 null 避免全都不见。
      ]
    }
  }

  return await prisma.capitalPool.findMany({
    where,
    include: {
      user: {
        select: { poolEnabled: true, roleName: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  })
}

// 创建资金池
export async function createCapitalPool(name: string, userId?: string, isReviewRequired: boolean = false) {
  try {
    await checkAdmin()
    const pool = await prisma.capitalPool.create({
      data: { 
        name,
        userId: userId || null,
        isReviewRequired
      }
    })
    revalidatePath('/admin')
    revalidatePath('/')
    return { success: true, pool }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// 修改资金池
export async function updateCapitalPool(id: string, name: string, userId?: string, isReviewRequired?: boolean) {
  try {
    await checkAdmin()
    const data: any = { name }
    if (userId !== undefined) data.userId = userId || null
    if (isReviewRequired !== undefined) data.isReviewRequired = isReviewRequired

    const pool = await prisma.capitalPool.update({
      where: { id },
      data
    })
    revalidatePath('/admin')
    revalidatePath('/')
    return { success: true, pool }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// 删除资金池
export async function deleteCapitalPool(id: string) {
  try {
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    await checkAdmin()
    // 检查是否有记录关联
    const [records, contracts] = await Promise.all([
      prisma.record.count({
        where: { poolId: id }
      }),
      prisma.contract.count({
        where: { poolId: id }
      })
    ])
    if (records > 0 || contracts > 0) {
      return { success: false, error: t('poolHasRecords') }
    }

    await prisma.capitalPool.delete({
      where: { id }
    })
    revalidatePath('/admin')
    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
