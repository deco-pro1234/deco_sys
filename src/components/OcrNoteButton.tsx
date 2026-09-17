'use client'

import { useEffect, useState } from 'react'
import { recognizeAttachmentNote } from '@/app/actions/ocr'
import type { ClientAttachment } from '@/lib/image'
import { createTranslator, type Locale } from '@/lib/i18n'
import type { OcrContext, OcrParsedResult } from '@/lib/ocr'

export type OcrResolvedPayload = {
  /** Company / order / summary / keywords for record note (~80 chars) */
  noteText: string
  /** Short document type only for attachment note (replace, never append) */
  attachmentMemo: string
  amount: number | null
  parsed: OcrParsedResult | null
  /** Page indexes (0-based) that were recognized */
  pageIndexes?: number[]
}

type Props = {
  locale: Locale
  /** Preferred: all pending pages; user can pick which to recognize */
  attachments?: ClientAttachment[]
  /** Legacy single-attachment mode */
  attachment?: ClientAttachment | null
  context: OcrContext
  disabled?: boolean
  onResolved: (payload: OcrResolvedPayload | string) => void
}

function mergeUnique(parts: string[]) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out.join('\n')
}

export default function OcrNoteButton({
  locale,
  attachments,
  attachment,
  context,
  disabled,
  onResolved,
}: Props) {
  const t = createTranslator(locale)
  const [loading, setLoading] = useState(false)
  const pages =
    attachments && attachments.length > 0
      ? attachments
      : attachment?.url
        ? [attachment]
        : []

  const [selectedIndexes, setSelectedIndexes] = useState<number[]>(() =>
    pages.length > 0 ? [0] : []
  )

  useEffect(() => {
    setSelectedIndexes((prev) => {
      const valid = prev.filter((i) => i >= 0 && i < pages.length)
      if (valid.length > 0) return valid
      return pages.length > 0 ? [0] : []
    })
  }, [pages.length])

  const togglePage = (index: number) => {
    setSelectedIndexes((prev) => {
      if (prev.includes(index)) {
        if (prev.length === 1) return prev
        return prev.filter((i) => i !== index)
      }
      return [...prev, index].sort((a, b) => a - b)
    })
  }

  const handleClick = async () => {
    if (pages.length === 0) {
      alert(t('ocrSelectAttachmentFirst'))
      return
    }
    const indexes = (selectedIndexes.length > 0 ? selectedIndexes : [0]).filter(
      (i) => i >= 0 && i < pages.length && pages[i]?.url
    )
    if (indexes.length === 0) {
      alert(t('ocrSelectPageFirst'))
      return
    }

    setLoading(true)
    const noteParts: string[] = []
    const memoParts: string[] = []
    let amount: number | null = null
    let lastParsed: OcrParsedResult | null = null

    for (const index of indexes) {
      const page = pages[index]
      const result = await recognizeAttachmentNote({
        imageDataUrl: page.url,
        context,
      })
      if (!result.success) {
        alert(`${t('ocrActionLabel')}: ${result.error}`)
        setLoading(false)
        return
      }
      if (result.noteText) noteParts.push(result.noteText)
      if (result.attachmentMemo) memoParts.push(result.attachmentMemo)
      if (amount == null && result.amount != null) amount = result.amount
      lastParsed = result.parsed || lastParsed
    }

    const payload: OcrResolvedPayload = {
      noteText: mergeUnique(noteParts),
      attachmentMemo: memoParts[0] || '',
      amount,
      parsed: lastParsed,
      pageIndexes: indexes,
    }
    onResolved(payload)
    alert(t('ocrFilledNote'))
    setLoading(false)
  }

  return (
    <div className="flex flex-col gap-2">
      {pages.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">{t('ocrSelectPages')}:</span>
          {pages.map((page, index) => {
            const checked = selectedIndexes.includes(index)
            const label = page.pageIndex ?? index + 1
            return (
              <label
                key={`${page.size}-${index}`}
                className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium ${
                  checked
                    ? 'border-[#5856D6] bg-[#5856D6]/10 text-[#5856D6]'
                    : 'border-gray-200 bg-white text-gray-600'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() => togglePage(index)}
                />
                {t('ocrPageLabel').replace('{{page}}', String(label))}
              </label>
            )
          })}
        </div>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || loading}
        className="rounded-xl bg-[#5856D6]/10 px-4 py-2.5 text-sm font-semibold text-[#5856D6] transition-colors hover:bg-[#5856D6]/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? t('ocrReading') : t('ocrActionLabel')}
      </button>
    </div>
  )
}
