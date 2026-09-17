'use server'

import prisma from '@/lib/prisma'
import { hashPassword } from './auth'

export async function initAdmin() {
  try {
    const adminCount = await prisma.user.count({
      where: { isAdmin: true }
    })

    if (adminCount === 0) {
      await prisma.user.create({
        data: {
          email: 'initadmin@localhost.local',
          password: await hashPassword('admin'),
          roleName: '超级管理员',
          isAdmin: true,
          poolEnabled: false,
        }
      })
      return { success: true, message: '默认管理员已创建' }
    }

    return { success: false, message: '管理员已存在，无需初始化' }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}