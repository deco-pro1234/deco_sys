import { redirect } from 'next/navigation'
import { getSession } from '../actions/auth'
import { getCapitalPools } from '../actions/pool'
import { getContracts } from '../actions/contract'
import ContractsClient from './ContractsClient'
import { getCurrentLocale } from '@/lib/locale'
import { getDefaultHomePath } from '@/lib/access'
import { getPluginFlags } from '../actions/settings'

export const metadata = {
  title: 'Contracts',
}

export default async function ContractsPage() {
  const session = await getSession()
  if (!session) {
    redirect('/login')
  }
  if (!session.isAdmin) {
    redirect(getDefaultHomePath(session))
  }

  const flags = await getPluginFlags()
  if (!flags.contracts) {
    redirect('/')
  }

  const locale = await getCurrentLocale()
  const [pools, contracts] = await Promise.all([
    getCapitalPools(session.userId),
    getContracts(),
  ])

  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      <ContractsClient
        locale={locale}
        pools={pools}
        currentUserId={session.userId}
        initialContracts={contracts}
      />
    </div>
  )
}
