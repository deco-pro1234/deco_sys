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

async function getCategoryDepth(categoryId: string) {
  let depth = 0
  let current = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { parentId: true }
  })

  while (current?.parentId) {
    depth += 1
    current = await prisma.category.findUnique({
      where: { id: current.parentId },
      select: { parentId: true }
    })
  }

  return depth
}

// 获取所有分类（包含最多三级结构）
export async function getCategories() {
  return await prisma.category.findMany({
    where: { parentId: null },
    include: {
      children: {
        include: {
          children: true
        }
      }
    },
    orderBy: { createdAt: 'asc' }
  })
}

// 获取平面分类列表
export async function getFlatCategories() {
  return await prisma.category.findMany({
    orderBy: { createdAt: 'asc' }
  })
}

// 确保存在“未分类”
async function ensureUncategorized(type: 'INCOME' | 'EXPENSE' = 'EXPENSE') {
  let uncategorized = await prisma.category.findFirst({
    where: { name: '未分类', parentId: null, type }
  })
  if (!uncategorized) {
    uncategorized = await prisma.category.create({
      data: { name: '未分类', type }
    })
  }
  return uncategorized
}

// 创建分类
export async function createCategory(name: string, parentId?: string, type: 'INCOME' | 'EXPENSE' = 'EXPENSE') {
  try {
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    await checkAdmin()
    
    let finalType = type
    if (parentId) {
      const parent = await prisma.category.findUnique({ where: { id: parentId } })
      if (parent) {
        finalType = parent.type as 'INCOME' | 'EXPENSE'
      }

      const depth = await getCategoryDepth(parentId)
      if (depth >= 2) {
        return { success: false, error: t('categoryLevelLimitReached') }
      }
    }

    const category = await prisma.category.create({
      data: { name, parentId: parentId || null, type: finalType }
    })
    revalidatePath('/admin')
    revalidatePath('/')
    return { success: true, category }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// 修改分类
export async function updateCategory(id: string, name: string, type?: 'INCOME' | 'EXPENSE') {
  try {
    await checkAdmin()
    const data: any = { name }
    if (type) data.type = type
    
    const category = await prisma.category.update({
      where: { id },
      data
    })
    revalidatePath('/admin')
    revalidatePath('/')
    return { success: true, category }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// 删除分类
export async function deleteCategory(id: string) {
  try {
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    await checkAdmin()
    const category = await prisma.category.findUnique({
      where: { id },
      select: { id: true, name: true, type: true, parentId: true }
    })

    if (!category) {
      return { success: false, error: t('recordNotFound') }
    }

    const uncategorized = await ensureUncategorized(category.type as 'INCOME' | 'EXPENSE')
    
    if (category.name === '未分类' && category.parentId === null) {
      return { success: false, error: t('deleteDefaultUncategorized') }
    }

    const childUpdateParentId = category.parentId || null

    // 将关联该分类的记录与合约转入“未分类”或清空较深层级
    await prisma.$transaction([
      prisma.category.updateMany({
        where: { parentId: id },
        data: { parentId: childUpdateParentId }
      }),
      prisma.record.updateMany({
        where: { categoryId: id },
        data: { categoryId: uncategorized.id, subCategoryId: null, thirdCategoryId: null }
      }),
      prisma.record.updateMany({
        where: { subCategoryId: id },
        data: { subCategoryId: null, thirdCategoryId: null }
      }),
      prisma.record.updateMany({
        where: { thirdCategoryId: id },
        data: { thirdCategoryId: null }
      }),
      prisma.contract.updateMany({
        where: { categoryId: id },
        data: { categoryId: uncategorized.id, subCategoryId: null, thirdCategoryId: null }
      }),
      prisma.contract.updateMany({
        where: { subCategoryId: id },
        data: { subCategoryId: null, thirdCategoryId: null }
      }),
      prisma.contract.updateMany({
        where: { thirdCategoryId: id },
        data: { thirdCategoryId: null }
      }),
      prisma.category.delete({
        where: { id }
      })
    ])

    revalidatePath('/admin')
    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
