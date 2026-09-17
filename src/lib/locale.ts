import { cookies } from 'next/headers'
import { LOCALE_COOKIE, normalizeLocale, type Locale } from './i18n'

export async function getCurrentLocale(): Promise<Locale> {
  const cookieStore = await cookies()
  return normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value)
}
