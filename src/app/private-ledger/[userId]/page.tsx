import { redirect } from 'next/navigation'
import { getSession } from '../../actions/auth'
import { getCurrentLocale } from '@/lib/locale'
import { getPrivateLedgerOwner, getPrivateLedgerSummary, getPrivateRecords } from '../../actions/private-record'
import PrivateLedgerClient from '../PrivateLedgerClient'

export const metadata = {
  title: 'Shared Private Ledger',
}

export default async function SharedPrivateLedgerPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const session = await getSession()
  if (!session) {
    redirect('/login')
  }

  const { userId } = await params
  if (userId === session.userId) {
    redirect('/private-ledger')
  }

  const locale = await getCurrentLocale()
  const [owner, summary, records] = await Promise.all([
    getPrivateLedgerOwner(userId),
    getPrivateLedgerSummary(userId),
    getPrivateRecords(userId),
  ])

  if (!owner) {
    redirect('/private-ledger')
  }

  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      <PrivateLedgerClient
  locale={locale}
  initialDate={new Date().toISOString().split('T')[0]}
  initialRecords={records}
  owner={owner}
  balance={summary.balance}
  visibility={(owner.privateLedgerVisibility === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE')}
  canManage={false}
  sharedUsers={[]}
/>
    </div>
  )
}
