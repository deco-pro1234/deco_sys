'use client'

import { useState } from 'react'
import { addRecordAttachment, appendRecordNoteKeywords, deleteRecord, addRecordMemo } from './actions/record'
import { createTranslator, formatCurrency, type Locale } from '@/lib/i18n'
import { compressImage, MAX_PDF_PAGES, openAttachment, prepareAttachments, type ClientAttachment } from '@/lib/image'
import NoteTimeline from '@/components/NoteTimeline'
import OcrNoteButton, { type OcrResolvedPayload } from '@/components/OcrNoteButton'
import OcrSavedAttachmentButton from '@/components/OcrSavedAttachmentButton'

export default function RecordDetailModal({
  record,
  locale,
  onClose,
}: {
  record: any
  locale: Locale
  onClose: () => void
}) {
  const t = createTranslator(locale)
  const [attachments, setAttachments] = useState<ClientAttachment[]>([])
  const [attachmentNote, setAttachmentNote] = useState('')
  const [pendingOcrKeywords, setPendingOcrKeywords] = useState('')
  const [loading, setLoading] = useState(false)

  const handleAttachmentChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const result = await prepareAttachments(file)
      if (result.truncated) {
        alert(
          t('pdfPagesTruncated')
            .replace('{{total}}', String(result.totalPages))
            .replace('{{max}}', String(MAX_PDF_PAGES))
        )
      }
      setAttachments(result.attachments)
      setAttachmentNote(result.attachments[0]?.note || '')
    } catch {
      try {
        const fallback = await compressImage(file, 200)
        setAttachments([fallback])
        setAttachmentNote(fallback.note || '')
      } catch {
        alert(t('imageCompressionFailed'))
      }
    }
  }

  const handleAppendAttachment = async () => {
    if (attachments.length === 0) return
    setLoading(true)
    for (const page of attachments) {
      const res = await addRecordAttachment(record.id, {
        url: page.url,
        size: page.size,
        note: page.note || attachmentNote || undefined,
      })
      if (!res.success) {
        alert(res.error)
        setLoading(false)
        return
      }
    }
    if (pendingOcrKeywords.trim()) {
      await appendRecordNoteKeywords(record.id, pendingOcrKeywords.trim())
    }
    window.location.reload()
  }

  const handleDelete = async () => {
    if (!window.confirm(t('deleteRecordConfirm'))) return
    setLoading(true)
    const res = await deleteRecord(record.id)
    if (res.success) {
      window.location.reload()
      return
    }
    alert(res.error)
    setLoading(false)
  }

  const onOcrResolved = (payload: OcrResolvedPayload | string) => {
    const noteText = typeof payload === 'string' ? payload : payload.noteText
    const attachmentMemo = typeof payload === 'string' ? '' : payload.attachmentMemo
    if (noteText) {
      setPendingOcrKeywords((current) => (current.trim() ? `${current.trim()}\n${noteText}` : noteText))
    }
    if (attachmentMemo) {
      setAttachmentNote(attachmentMemo)
      setAttachments((prev) => prev.map((item, index) => (index === 0 ? { ...item, note: attachmentMemo } : item)))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden bg-white shadow-xl sm:h-auto sm:max-h-[90vh] sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 p-4 sm:p-5">
          <h3 className="text-lg font-bold text-gray-900">{t('recordDetails')}</h3>
          <button onClick={onClose} className="rounded-full bg-gray-200 p-2 text-gray-600 transition-colors hover:bg-gray-300">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            <div>
              <div className="mb-1 text-gray-500">{t('date')}</div>
              <div className="font-semibold text-gray-900">{new Date(record.date).toLocaleDateString(locale === 'en' ? 'en-HK' : 'zh-HK')}</div>
            </div>
            <div>
              <div className="mb-1 text-gray-500">{t('status')}</div>
              <div className="font-semibold text-gray-900">{record.status === 'PENDING' ? t('pendingApproval') : t('approvedStored')}</div>
            </div>
            <div>
              <div className="mb-1 text-gray-500">{t('type')}</div>
              <div className="font-semibold text-gray-900">{record.type === 'INCOME' ? t('income') : t('expense')}</div>
            </div>
            <div>
              <div className="mb-1 text-gray-500">{t('amount')}</div>
              <div className={`font-bold ${record.amount > 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>{formatCurrency(locale, record.amount)}</div>
            </div>
            <div>
              <div className="mb-1 text-gray-500">{t('category')}</div>
              <div className="font-semibold text-gray-900">
                {[record.category?.name, record.subCategory?.name, record.thirdCategory?.name].filter(Boolean).join(' / ') || '-'}
              </div>
            </div>
            <div>
              <div className="mb-1 text-gray-500">{t('pool')}</div>
              <div className="font-semibold text-gray-900">{record.pool?.name || '-'}</div>
            </div>
            <div className="md:col-span-2">
              <div className="mb-1 text-gray-500">{t('note')}</div>
              <div className="whitespace-pre-wrap font-semibold text-gray-900">{record.note || '-'}</div>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-gray-900">{t('attachmentsHistory')}</h4>
              <span className="text-xs text-gray-400">{record.attachments?.length || 0}</span>
            </div>
            <div className="space-y-3">
              {(record.attachments || []).length === 0 ? (
                <div className="text-sm text-gray-400">{t('noAttachmentData')}</div>
              ) : (
                record.attachments.map((item: any) => (
                  <div key={item.id} className="rounded-xl border border-gray-100 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => openAttachment(item.fileUrl)}
                        className="font-medium text-[#007AFF] hover:underline"
                      >
                        {t('viewAttachment')}
                      </button>
                      <div className="flex items-center gap-2">
                        <OcrSavedAttachmentButton
                          locale={locale}
                          attachmentId={item.id}
                          context="public-record"
                          disabled={loading}
                        />
                        <span className="text-xs text-gray-400">{new Date(item.createdAt).toLocaleString(locale === 'en' ? 'en-HK' : 'zh-HK')}</span>
                      </div>
                    </div>
                    <div className="mt-1 text-gray-500">{item.note || '-'}</div>
                    <div className="mt-1 text-xs text-gray-400">{item.uploader?.roleName || '-'}</div>
                  </div>
                ))
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 border-t border-gray-100 pt-3 md:grid-cols-[1fr,1fr,auto]">
              <input type="file" accept="image/*,application/pdf" onChange={handleAttachmentChange} className="w-full text-sm text-gray-600 file:mr-4 file:rounded-xl file:border-0 file:bg-[#007AFF]/10 file:px-4 file:py-2 file:font-semibold file:text-[#007AFF]" />
              <input value={attachmentNote} onChange={(e) => setAttachmentNote(e.target.value)} placeholder={t('attachmentNotePlaceholder')} className="w-full rounded-xl bg-[#F2F2F7] px-3 py-3 text-sm text-gray-900 outline-none" />
              <div className="flex flex-col gap-2 sm:flex-row">
                <OcrNoteButton
                  locale={locale}
                  attachments={attachments}
                  context="public-record"
                  onResolved={onOcrResolved}
                  disabled={loading}
                />
                <button onClick={handleAppendAttachment} disabled={loading || attachments.length === 0} className="rounded-xl bg-[#007AFF] px-5 py-3 font-semibold text-white disabled:opacity-50">
                  {t('appendAttachment')}
                </button>
              </div>
            </div>
          </div>

          <NoteTimeline
            locale={locale}
            items={record.memos || []}
            disabled={loading}
            onAdd={(content) => addRecordMemo(record.id, content)}
          />
        </div>

        <div className="mobile-safe-sheet flex flex-col-reverse gap-3 border-t border-gray-100 bg-white p-4 sm:flex-row sm:justify-between sm:p-5">
          <button onClick={onClose} className="w-full rounded-xl bg-gray-200 px-5 py-3 font-semibold text-gray-700 sm:w-auto">
            {t('close')}
          </button>
          <button onClick={handleDelete} disabled={loading} className="rounded-xl bg-[#FF3B30] px-5 py-3 font-semibold text-white disabled:opacity-50">
            {t('deleteRecord')}
          </button>
        </div>
      </div>
    </div>
  )
}
