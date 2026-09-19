import Link from 'next/link'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'

export default async function ProjectNotFound() {
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 text-center">
      <h1 className="text-lg font-semibold text-gray-900">{t('projectNotFound')}</h1>
      <p className="mt-2 text-sm text-gray-500">{t('projectNotFoundHint')}</p>
      <Link
        href="/projects"
        className="mt-6 inline-flex rounded-xl bg-[#007AFF] px-4 py-2.5 text-sm font-semibold text-white"
      >
        {t('projectsPage')}
      </Link>
    </div>
  )
}
