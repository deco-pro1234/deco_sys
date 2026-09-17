'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { logout } from './actions/auth'
import { LOCALE_COOKIE, createTranslator, type Locale } from '@/lib/i18n'
import { hasPublicLedgerAccess } from '@/lib/access'
import type { PluginFlags } from '@/lib/plugins'
import BrandLogo from '@/components/BrandLogo'
import BrandMark from '@/components/BrandMark'

type NavSession = {
  userId: string
  roleName: string
  isAdmin: boolean
  publicLedgerRole?: string | null
}

type NavItem = {
  name: string
  href: string
  count?: number
}

function CountBadge({ count }: { count?: number }) {
  if (!count) return null

  return (
    <span className="absolute -right-3 -top-1 min-w-[18px] rounded-full bg-[#FF3B30] px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white shadow-sm">
      {count > 99 ? '99+' : count}
    </span>
  )
}

export default function TopNav({
  session,
  pendingCount = 0,
  contractReminderCount = 0,
  activityReminderCount = 0,
  recurringReminderCount = 0,
  pluginFlags,
  locale,
}: {
  session: NavSession | null
  pendingCount?: number
  contractReminderCount?: number
  activityReminderCount?: number
  recurringReminderCount?: number
  pluginFlags: PluginFlags
  locale: Locale
}) {
  const pathname = usePathname()
  const router = useRouter()
  const t = createTranslator(locale)
  const [isMoreOpen, setIsMoreOpen] = useState(false)

  const primaryNavItems: NavItem[] = []

  if (hasPublicLedgerAccess(session)) {
    primaryNavItems.push({ name: t('publicLedger'), href: '/' })
  }

  primaryNavItems.push({ name: t('privateLedger'), href: '/private-ledger' })

  if (pluginFlags.matters) {
    primaryNavItems.push({ name: t('activities'), href: '/activities', count: activityReminderCount })
  }

  if (hasPublicLedgerAccess(session) && pluginFlags.recurring) {
    primaryNavItems.push({ name: t('recurring'), href: '/recurring', count: recurringReminderCount })
  }

  if (session) {
    primaryNavItems.push({ name: t('personalProfile'), href: `/my-profile/${session.userId}` })
  }

  const secondaryNavItems: NavItem[] = []

  if (session?.isAdmin) {
    secondaryNavItems.push({ name: t('review'), href: '/review', count: pendingCount })
    if (pluginFlags.contracts) {
      secondaryNavItems.push({ name: t('contracts'), href: '/contracts', count: contractReminderCount })
    }
    secondaryNavItems.push({ name: t('report'), href: '/report' })
    if (pluginFlags.payroll) {
      secondaryNavItems.push({ name: t('payroll'), href: '/admin/payroll' })
    }
    secondaryNavItems.push({ name: t('admin'), href: '/admin' })
  }

  const desktopNavItems = [...primaryNavItems, ...secondaryNavItems]

  const isPathActive = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href))
  const isMoreActive = secondaryNavItems.some((item) => isPathActive(item.href))
  const currentPageName =
    [...desktopNavItems].find((item) => isPathActive(item.href))?.name ??
    (pathname === '/login' ? t('login') : t('home'))

  const handleLocaleChange = (nextLocale: string) => {
    document.cookie = `${LOCALE_COOKIE}=${nextLocale}; path=/; max-age=31536000; samesite=lax`
    window.location.reload()
  }

  const handleLogout = async () => {
    await logout()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      <div className="sticky top-0 z-30 -mx-4 border-b border-gray-200 bg-[#F2F2F7]/95 backdrop-blur sm:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0B1736] text-white shadow-sm">
              <BrandMark className="h-8 w-8" strokeWidth={16} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-400">{session?.roleName}</div>
              <div className="truncate text-base font-semibold text-gray-900">{currentPageName}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsMoreOpen(true)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${isMoreActive ? 'bg-[#007AFF] text-white' : 'bg-white text-gray-700 shadow-sm'}`}
          >
            {t('more')}
          </button>
        </div>
      </div>

      <div className="hidden items-center justify-between gap-4 border-b border-gray-200 bg-[#F2F2F7] pb-3 px-4 pt-2 text-lg font-semibold sm:flex sm:px-0">
        <div className="flex min-w-0 items-center gap-6">
          <BrandLogo className="shrink-0" compact />
          <nav className="hide-scrollbar flex min-w-0 space-x-6 overflow-x-auto whitespace-nowrap">
          {desktopNavItems.map((item) => {
            const isActive = isPathActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative pb-1 transition-colors ${isActive ? 'border-b-2 border-[#007AFF] text-[#007AFF]' : 'text-gray-500 hover:text-gray-800'}`}
              >
                {item.name}
                <CountBadge count={item.count} />
              </Link>
            )
          })}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-600">
            <span>{t('language')}</span>
            <select
              value={locale}
              onChange={(e) => handleLocaleChange(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 outline-none"
              aria-label={t('chooseLanguage')}
            >
              <option value="zh-HK">{t('traditionalChinese')}</option>
              <option value="en">{t('english')}</option>
            </select>
          </label>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-100"
          >
            {t('logout')}
          </button>
        </div>
      </div>

      <div className="mobile-safe-nav fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-4xl items-center justify-around px-2 pt-2">
          {primaryNavItems.map((item) => {
            const isActive = isPathActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex min-w-0 flex-1 items-center justify-center rounded-2xl px-2 py-3 text-sm font-semibold transition-colors ${isActive ? 'bg-[#007AFF]/12 text-[#007AFF]' : 'text-gray-500'}`}
              >
                <span className="truncate">{item.name}</span>
                <CountBadge count={item.count} />
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => setIsMoreOpen(true)}
            className={`flex flex-1 items-center justify-center rounded-2xl px-2 py-3 text-sm font-semibold transition-colors ${isMoreActive || isMoreOpen ? 'bg-[#007AFF]/12 text-[#007AFF]' : 'text-gray-500'}`}
          >
            {t('more')}
          </button>
        </div>
      </div>

      {isMoreOpen && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <button type="button" aria-label={t('close')} onClick={() => setIsMoreOpen(false)} className="absolute inset-0 bg-black/35" />
          <div className="mobile-safe-sheet absolute inset-x-0 bottom-0 rounded-t-[28px] bg-white px-4 pb-4 pt-5 shadow-2xl">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-gray-200" />
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-400">{session?.roleName}</div>
                <div className="mt-1 text-lg font-semibold text-gray-900">{t('more')}</div>
              </div>
              <button
                type="button"
                onClick={() => setIsMoreOpen(false)}
                className="rounded-full bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-600"
              >
                {t('close')}
              </button>
            </div>

            <div className="space-y-2">
              {secondaryNavItems.map((item) => {
                const isActive = isPathActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMoreOpen(false)}
                    className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition-colors ${isActive ? 'bg-[#007AFF]/12 text-[#007AFF]' : 'bg-[#F2F2F7] text-gray-700'}`}
                  >
                    <span>{item.name}</span>
                    {item.count ? (
                      <span className="min-w-[18px] rounded-full bg-[#FF3B30] px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white">
                        {item.count > 99 ? '99+' : item.count}
                      </span>
                    ) : null}
                  </Link>
                )
              })}
            </div>

            <div className="mt-5 rounded-2xl bg-[#F2F2F7] p-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">{t('language')}</label>
              <select
                value={locale}
                onChange={(e) => handleLocaleChange(e.target.value)}
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-700 outline-none"
                aria-label={t('chooseLanguage')}
              >
                <option value="zh-HK">{t('traditionalChinese')}</option>
                <option value="en">{t('english')}</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="mt-5 w-full rounded-2xl bg-[#1C1C1E] px-4 py-3.5 text-sm font-semibold text-white"
            >
              {t('logout')}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
