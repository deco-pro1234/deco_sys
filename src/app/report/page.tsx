import { getCategories } from '../actions/category'
import { getUsers } from '../actions/user'
import { getSession } from '../actions/auth'
import { getCapitalPools } from '../actions/pool'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ReportClient from './ReportClient'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'
import { getDefaultHomePath } from '@/lib/access'

export const metadata = {
  title: '报表与导出',
}

export default async function ReportPage() {
  const session = await getSession()
  if (!session) {
    redirect('/login')
  }
  if (!session.isAdmin) {
    redirect(getDefaultHomePath(session))
  }
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)

  const [categories, users, pools] = await Promise.all([
    getCategories(),
    getUsers(),
    getCapitalPools(session.userId),
  ])

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#E8F1FF_0%,_#F2F2F7_42%,_#F7F8FA_100%)]">
      <header className="bg-white/80 backdrop-blur border-b border-gray-200/80 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center">
          <Link href="/" className="text-[#007AFF] text-sm font-semibold hover:opacity-80 flex items-center">
            <span className="text-xl mr-1 leading-none">‹</span> {t('publicLedger')}
          </Link>
          <h1 className="text-lg font-bold text-gray-900 ml-4">{t('financeReportExport')}</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:px-6 lg:px-8 mt-4 pb-10">
        <ReportClient categories={categories} users={users} pools={pools} locale={locale} />
      </main>
    </div>
  );
}
