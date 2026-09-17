'use client'

import { useState } from 'react'
import { createTranslator, type Locale } from '@/lib/i18n'

export type NoteTimelineItem = {
  id: string
  content: string
  createdAt: string | Date
  author?: { roleName?: string | null } | null
}

type Props = {
  locale: Locale
  items: NoteTimelineItem[]
  canAdd?: boolean
  disabled?: boolean
  onAdd: (content: string) => Promise<{ success: boolean; error?: string }>
}

export default function NoteTimeline({
  locale,
  items,
  canAdd = true,
  disabled,
  onAdd,
}: Props) {
  const t = createTranslator(locale)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)

  const handleAdd = async () => {
    if (!content.trim()) return
    setLoading(true)
    const res = await onAdd(content.trim())
    if (res.success) {
      window.location.reload()
      return
    }
    alert(res.error || t('submitFailed'))
    setLoading(false)
  }

  return (
    <div className="space-y-3 rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-gray-900">{t('memoHistory')}</h4>
        <span className="text-xs text-gray-400">{items.length}</span>
      </div>
      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="text-sm text-gray-400">{t('noMemoData')}</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-xl border border-gray-100 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-gray-900">{item.author?.roleName || '-'}</div>
                <span className="text-xs text-gray-400">
                  {new Date(item.createdAt).toLocaleString(locale === 'en' ? 'en-HK' : 'zh-HK')}
                </span>
              </div>
              <div className="mt-1 whitespace-pre-wrap text-gray-600">{item.content}</div>
            </div>
          ))
        )}
      </div>
      {canAdd && (
        <div className="flex flex-col gap-3 border-t border-gray-100 pt-3 sm:flex-row">
          <input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('memoPlaceholder')}
            disabled={disabled || loading}
            className="flex-1 rounded-xl bg-[#F2F2F7] px-3 py-3 text-sm text-gray-900 outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={disabled || loading || !content.trim()}
            className="rounded-xl bg-[#34C759] px-5 py-3 font-semibold text-white disabled:opacity-50"
          >
            {t('addMemo')}
          </button>
        </div>
      )}
    </div>
  )
}
