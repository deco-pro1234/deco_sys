export const HELP_TIPS_STORAGE_KEY = 'deco.helpTipsEnabled'
export const HELP_TIPS_CHANGED_EVENT = 'deco:help-tips-changed'

export function readHelpTipsEnabled(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const raw = window.localStorage.getItem(HELP_TIPS_STORAGE_KEY)
    if (raw === null) return true
    return raw !== '0' && raw !== 'false'
  } catch {
    return true
  }
}

export function writeHelpTipsEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(HELP_TIPS_STORAGE_KEY, enabled ? '1' : '0')
    window.dispatchEvent(
      new CustomEvent(HELP_TIPS_CHANGED_EVENT, { detail: { enabled } })
    )
  } catch {
    // ignore quota / private mode
  }
}
