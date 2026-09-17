'use client'

import { useState } from 'react'
import { recognizeAndAppendOcr } from '@/app/actions/ocr'
import type { OcrContext } from '@/lib/ocr'
import { createTranslator, type Locale } from '@/lib/i18n'

type Props = {
  locale: Locale
  attachmentId: string
  context: OcrContext
  disabled?: boolean
}

/** OCR a saved attachment: append keywords to parent note + create timeline memo. */
export default function OcrSavedAttachmentButton({
  locale,
  attachmentId,
  context,
  disabled,
}: Props) {
  const t = createTranslator(locale)
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    setLoading(true)
    const result = await recognizeAndAppendOcr({
      attachmentId,
      context,
    })
    if (result.success) {
      alert(t('ocrFilledNote'))
      window.location.reload()
      return
    }
    alert(`${t('ocrActionLabel')}: ${result.error}`)
    setLoading(false)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      className="rounded-lg bg-[#5856D6]/10 px-3 py-1.5 text-xs font-semibold text-[#5856D6] transition-colors hover:bg-[#5856D6]/15 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? t('ocrReading') : t('ocrActionLabel')}
    </button>
  )
}
