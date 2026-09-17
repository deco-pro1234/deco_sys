export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getSession } from './actions/auth'
import { getUserStats, getRecentRecords } from './actions/record'
import { getCategories } from './actions/category'
import { getCapitalPools } from './actions/pool'
import HomePageClient from './HomePageClient'
import { getCurrentLocale } from '@/lib/locale'
import { getDefaultHomePath, hasPublicLedgerAccess } from '@/lib/access'

export default async function HomePage() {
  const session = await getSession()
  if (!session) {
    redirect('/login')
  }
  if (!hasPublicLedgerAccess(session)) {
    redirect(getDefaultHomePath(session))
  }
  const locale = await getCurrentLocale()
  const initialDate = new Date().toISOString().split('T')[0]

  const [stats, initialRecords, categories, pools] = await Promise.all([
    getUserStats(session.userId),
    getRecentRecords(session.userId),
    getCategories(),
    getCapitalPools(session.userId),
  ])

  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      <HomePageClient 
        locale={locale}
        session={session}
        stats={stats}
        initialDate={initialDate}
        initialRecords={initialRecords}
        categories={categories}
        pools={pools}
      />
    </div>
  )
}
