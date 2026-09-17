export type PublicLedgerRole = 'NONE' | 'MEMBER'
export type PrivateLedgerVisibility = 'PRIVATE' | 'PUBLIC'

export type SessionLike = {
  userId: string
  roleName: string
  isAdmin: boolean
  publicLedgerRole?: string | null
}

export function hasPublicLedgerAccess(session: SessionLike | null | undefined) {
  if (!session) return false
  return session.isAdmin || session.publicLedgerRole === 'MEMBER'
}

export function canAccessAdminOnly(session: SessionLike | null | undefined) {
  return Boolean(session?.isAdmin)
}

export function getDefaultHomePath(session: SessionLike | null | undefined) {
  return hasPublicLedgerAccess(session) ? '/' : '/private-ledger'
}

export function isPrivateLedgerPublic(value?: string | null) {
  return value === 'PUBLIC'
}
