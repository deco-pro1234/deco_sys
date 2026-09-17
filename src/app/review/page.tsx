import { redirect } from 'next/navigation'
import { getSession } from '../actions/auth'
import { getReviewRecords } from '../actions/review'
import { getCategories } from '../actions/category'
import { getCapitalPools } from '../actions/pool'
import ReviewClient from './ReviewClient'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'
import { getDefaultHomePath } from '@/lib/access'

export const metadata = {
  title: "审核",
}

export default async function ReviewPage() {
  const session = await getSession()
  if (!session || !session.isAdmin) {
    redirect(session ? getDefaultHomePath(session) : '/login')
  }
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)

  const [pendingRecords, approvedRecords, rejectedRecords, categories, pools] = await Promise.all([
    getReviewRecords('PENDING'),
    getReviewRecords('APPROVED'),
    getReviewRecords('REJECTED'),
    getCategories(),
    getCapitalPools(),
  ])

  const reviewedRecords = [...approvedRecords, ...rejectedRecords].sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )

  return (
    <ReviewClient
      pendingRecords={pendingRecords}
      reviewedRecords={reviewedRecords}
      locale={locale}
      title={t('reviewPage')}
      categories={categories}
      pools={pools.map((p) => ({ id: p.id, name: p.name }))}
    />
  )
}
