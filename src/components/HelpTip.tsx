'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import {
  HELP_TIPS_CHANGED_EVENT,
  readHelpTipsEnabled,
} from '@/lib/helpTipsPreference'
import { createTranslator, type Locale } from '@/lib/i18n'

type HelpTipProps = {
  title: string
  body: string
  closeLabel?: string
  className?: string
  align?: 'start' | 'end'
}

function useHelpTipsVisible() {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    setVisible(readHelpTipsEnabled())
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail
      if (typeof detail?.enabled === 'boolean') {
        setVisible(detail.enabled)
        return
      }
      setVisible(readHelpTipsEnabled())
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== 'deco.helpTipsEnabled') return
      setVisible(readHelpTipsEnabled())
    }
    window.addEventListener(HELP_TIPS_CHANGED_EVENT, onChange)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(HELP_TIPS_CHANGED_EVENT, onChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  return visible
}

/** Tap/click "?" opens a short help panel. Hidden when user turns tips off. */
export default function HelpTip({
  title,
  body,
  closeLabel = 'OK',
  className = '',
  align = 'start',
}: HelpTipProps) {
  const visible = useHelpTipsVisible()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (rootRef.current && target && !rootRef.current.contains(target)) {
        setOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('touchstart', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('touchstart', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!visible) return null

  return (
    <span ref={rootRef} className={`relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        aria-label={title}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-[11px] font-bold leading-none text-gray-500 shadow-sm transition hover:border-[#007AFF] hover:text-[#007AFF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]/40"
      >
        ?
      </button>
      {open ? (
        <span
          id={panelId}
          role="dialog"
          aria-label={title}
          className={`absolute z-40 mt-1 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-gray-200 bg-white p-3 text-left shadow-lg ${
            align === 'end' ? 'right-0' : 'left-0'
          } top-full`}
        >
          <div className="text-xs font-semibold text-gray-900">{title}</div>
          <p className="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-gray-600">
            {body}
          </p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 text-[11px] font-semibold text-[#007AFF]"
          >
            {closeLabel}
          </button>
        </span>
      ) : null}
    </span>
  )
}

type LocaleHelpTipProps = {
  locale: Locale
  titleKey: Parameters<ReturnType<typeof createTranslator>>[0]
  bodyKey: Parameters<ReturnType<typeof createTranslator>>[0]
  className?: string
  align?: 'start' | 'end'
}

/** HelpTip bound to i18n keys for the active locale */
export function LocaleHelpTip({
  locale,
  titleKey,
  bodyKey,
  className,
  align,
}: LocaleHelpTipProps) {
  const t = createTranslator(locale)
  return (
    <HelpTip
      title={t(titleKey)}
      body={t(bodyKey)}
      closeLabel={t('helpClose')}
      className={className}
      align={align}
    />
  )
}

type PageHelpHeadingProps = {
  locale: Locale
  title: ReactNode
  titleKey: Parameters<ReturnType<typeof createTranslator>>[0]
  bodyKey: Parameters<ReturnType<typeof createTranslator>>[0]
  subtitle?: ReactNode
  className?: string
  headingClassName?: string
  as?: 'h1' | 'h2' | 'h3'
}

/** Page / section title row with an optional help "?" */
export function PageHelpHeading({
  locale,
  title,
  titleKey,
  bodyKey,
  subtitle,
  className = '',
  headingClassName = 'text-xl font-bold text-gray-900',
  as = 'h1',
}: PageHelpHeadingProps) {
  const Heading = as
  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <Heading className={headingClassName}>{title}</Heading>
        <LocaleHelpTip locale={locale} titleKey={titleKey} bodyKey={bodyKey} />
      </div>
      {subtitle ? <div className="mt-1 text-sm text-gray-500">{subtitle}</div> : null}
    </div>
  )
}

type FieldHelpLabelProps = {
  locale: Locale
  label: ReactNode
  titleKey: Parameters<ReturnType<typeof createTranslator>>[0]
  bodyKey: Parameters<ReturnType<typeof createTranslator>>[0]
  className?: string
}

/** Label row for complex fields */
export function FieldHelpLabel({
  locale,
  label,
  titleKey,
  bodyKey,
  className = 'mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-500',
}: FieldHelpLabelProps) {
  return (
    <div className={className}>
      <span>{label}</span>
      <LocaleHelpTip locale={locale} titleKey={titleKey} bodyKey={bodyKey} />
    </div>
  )
}
