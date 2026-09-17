import { redirect } from 'next/navigation'
import { getSession } from '../actions/auth'
import { getCurrentLocale } from '@/lib/locale'
import {
  getPrivateLedgerOwner,
  getPrivateLedgerSummary,
  getPrivateRecords,
  getSharedPrivateLedgerUsers,
} from '../actions/private-record'
import PrivateLedgerClient from './PrivateLedgerClient'

export const metadata = {
  title: 'Private Ledger',
}

export default async function PrivateLedgerPage() {
  const session = await getSession()
  if (!session) {
    redirect('/login')
  }

  const locale = await getCurrentLocale()
  const initialDate = new Date().toISOString().split('T')[0]

    const [owner, summary, records, sharedUsers] = await Promise.all([
    getPrivateLedgerOwner(),
    getPrivateLedgerSummary(),
    getPrivateRecords(),
    getSharedPrivateLedgerUsers(),
  ])

  if (!owner) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      <PrivateLedgerClient
        locale={locale}
        initialDate={initialDate}
        initialRecords={records}
        owner={owner}
        balance={summary.balance}
        visibility={(owner.privateLedgerVisibility === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE')}
        canManage
        sharedUsers={sharedUsers}
      />
    </div>
  )
}
