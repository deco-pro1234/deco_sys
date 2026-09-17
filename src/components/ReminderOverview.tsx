import Link from 'next/link'
import { createTranslator, type Locale } from '@/lib/i18n'
import type { ReminderItem } from '@/app/actions/reminder'

type Props = {
  locale: Locale
  contracts: ReminderItem[]
  activities: ReminderItem[]
  recurring?: ReminderItem[]
}

function formatBadgeText(item: ReminderItem, locale: Locale) {
  if (item.bucket === 'overdue') {
    return locale === 'en' ? `${Math.abs(item.daysDiff)} days overdue` : `已逾期 ${Math.abs(item.daysDiff)} 天`
  }
  if (item.bucket === 'today') {
    return locale === 'en' ? 'Today' : '今天'
  }
  return locale === 'en' ? `${item.daysDiff} days left` : `尚餘 ${item.daysDiff} 天`
}

function Section({
  title,
  href,
  items,
  locale,
}: {
  title: string
  href: string
  items: ReminderItem[]
  locale: Locale
}) {
  if (items.length === 0) return null

  return (
    <Link href={href} className="block rounded-2xl border border-[#FF9500]/20 bg-white/80 p-4 shadow-sm transition-colors hover:bg-white">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[#9A3412]">{title}</h3>
        <span className="rounded-full bg-[#FF9500]/10 px-2.5 py-1 text-xs font-bold text-[#C2410C]">
          {items.length}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {items.slice(0, 3).map((item) => (
          <div key={item.id} className="flex flex-col gap-1 rounded-xl bg-[#FFF7ED] px-3 py-2 text-sm text-gray-700 sm:flex-row sm:items-center sm:justify-between">
            <span className="font-medium text-gray-900">{item.title}</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-[#C2410C]">
              {formatBadgeText(item, locale)}
            </span>
          </div>
        ))}
      </div>
    </Link>
  )
}

export default function ReminderOverview({ locale, contracts, activities, recurring = [] }: Props) {
  const t = createTranslator(locale)

  if (contracts.length === 0 && activities.length === 0 && recurring.length === 0) {
    return null
  }

  return (
    <div className="mx-auto mt-4 grid max-w-4xl grid-cols-1 gap-3 px-4 sm:px-0 md:grid-cols-2">
      <Section title={t('contractExpiryReminder')} href="/contracts" items={contracts} locale={locale} />
      <Section title={t('activityReminder')} href="/activities" items={activities} locale={locale} />
      <Section title={t('recurring')} href="/recurring" items={recurring} locale={locale} />
    </div>
  )
}
