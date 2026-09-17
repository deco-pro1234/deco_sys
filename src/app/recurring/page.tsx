import { redirect } from 'next/navigation'
import { getSession } from '@/app/actions/auth'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'
import { hasPublicLedgerAccess } from '@/lib/access'
import { getPluginFlags } from '@/app/actions/settings'
import { listRecurringTemplates } from '@/app/actions/recurring'
import { getCategories } from '@/app/actions/category'
import { getCapitalPools } from '@/app/actions/pool'
import RecurringClient from './RecurringClient'

export default async function RecurringPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const flags = await getPluginFlags()
  if (!flags.recurring) redirect('/')

  if (!hasPublicLedgerAccess(session)) redirect('/')

  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  const listed = await listRecurringTemplates()
  const categories = await getCategories()
  const pools = await getCapitalPools()

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('recurringPage')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('recurringPageHint')}</p>
      </div>
      <RecurringClient
        locale={locale}
        initialTemplates={listed.templates || []}
        categories={categories || []}
        pools={pools || []}
      />
    </div>
  )
}
