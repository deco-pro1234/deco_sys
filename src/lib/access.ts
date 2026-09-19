export type PublicLedgerRole = 'NONE' | 'MEMBER'
export type PrivateLedgerVisibility = 'PRIVATE' | 'PUBLIC'
export type AccountKind = 'STANDARD' | 'PROJECT_TEMP'

export const ACCOUNT_KIND_STANDARD: AccountKind = 'STANDARD'
export const ACCOUNT_KIND_PROJECT_TEMP: AccountKind = 'PROJECT_TEMP'

export type SessionLike = {
  userId: string
  roleName: string
  isAdmin: boolean
  publicLedgerRole?: string | null
  accountKind?: string | null
}

export function isProjectTempAccount(session: SessionLike | null | undefined) {
  return session?.accountKind === ACCOUNT_KIND_PROJECT_TEMP
}

export function hasPublicLedgerAccess(session: SessionLike | null | undefined) {
  if (!session) return false
  if (isProjectTempAccount(session)) return false
  return session.isAdmin || session.publicLedgerRole === 'MEMBER'
}

export function canAccessAdminOnly(session: SessionLike | null | undefined) {
  return Boolean(session?.isAdmin) && !isProjectTempAccount(session)
}

export function getDefaultHomePath(session: SessionLike | null | undefined) {
  if (isProjectTempAccount(session)) return '/projects'
  return hasPublicLedgerAccess(session) ? '/' : '/private-ledger'
}

export function isPrivateLedgerPublic(value?: string | null) {
  return value === 'PUBLIC'
}
