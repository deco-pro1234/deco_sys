'use client'

import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { createPrivateRecord, updatePrivateLedgerVisibility } from '../actions/private-record'
import { createTranslator, formatCurrency, type Locale } from '@/lib/i18n'
import { compressImage, MAX_PDF_PAGES, prepareAttachments, type ClientAttachment } from '@/lib/image'
import OcrNoteButton, { type OcrResolvedPayload } from '@/components/OcrNoteButton'
import PrivateRecordDetailModal from '../PrivateRecordDetailModal'

type PrivateRecordItem = {
  id: string
  date: string | Date
  type: string
  amount: number
  note?: string | null
  customCategory?: string | null
  category?: { name: string } | null
  subCategory?: { name: string } | null
  thirdCategory?: { name: string } | null
  attachments?: Array<{
    id: string
    fileUrl: string
    note?: string | null
    createdAt: string | Date
    uploader?: { roleName?: string | null } | null
  }>
}

type Props = {
  locale: Locale
  initialDate: string
  initialRecords: PrivateRecordItem[]
  owner: { id: string; roleName: string; privateLedgerVisibility?: string | null }
  balance: number
  visibility: 'PRIVATE' | 'PUBLIC'
  canManage: boolean
  sharedUsers: Array<{ id: string; roleName: string }>
}

export default function PrivateLedgerClient({
  locale,
  initialDate,
  initialRecords,
  owner,
  balance,
  visibility,
  canManage,
  sharedUsers,
}: Props) {
  const t = createTranslator(locale)
  const [selectedRecord, setSelectedRecord] = useState<PrivateRecordItem | null>(null)
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE')
  const [date, setDate] = useState(initialDate)
  const [customCategory, setCustomCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [ocrMemo, setOcrMemo] = useState('')
  const [attachments, setAttachments] = useState<ClientAttachment[]>([])
  const [ocrAttachmentIndex, setOcrAttachmentIndex] = useState(0)
  const [attachmentNote, setAttachmentNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [currentVisibility, setCurrentVisibility] = useState<'PRIVATE' | 'PUBLIC'>(visibility)
  const [isSavingVisibility, setIsSavingVisibility] = useState(false)
  const [fontBase64, setFontBase64] = useState<string | null>(null)

  useEffect(() => {
    const loadFont = async () => {
      try {
        const res = await fetch('/fonts/NotoSansSC-Regular.ttf')
        if (!res.ok) throw new Error('font not found')
        const buffer = await res.arrayBuffer()
        let binary = ''
        const bytes = new Uint8Array(buffer)
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        setFontBase64(window.btoa(binary))
      } catch (error) {
        console.error('Private ledger font load failed:', error)
      }
    }
    loadFont()
  }, [])

  const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
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
      setOcrAttachmentIndex(0)
      setAttachmentNote(result.attachments[0]?.note || '')
    } catch {
      try {
        const fallback = await compressImage(file, 200)
        setAttachments([fallback])
        setOcrAttachmentIndex(0)
        setAttachmentNote(fallback.note || '')
      } catch {
        alert(t('imageCompressionFailed'))
      }
    }
  }

  const removeAttachmentAt = (index: number) => {
    const next = attachments.filter((_, i) => i !== index)
    let nextOcr = ocrAttachmentIndex
    if (index < ocrAttachmentIndex) nextOcr = ocrAttachmentIndex - 1
    else if (index === ocrAttachmentIndex) nextOcr = 0
    nextOcr = Math.min(nextOcr, Math.max(0, next.length - 1))
    setAttachments(next)
    setOcrAttachmentIndex(nextOcr)
    setAttachmentNote(next[nextOcr]?.note || '')
  }

  const appendRecognizedText = (payload: OcrResolvedPayload | string) => {
    if (typeof payload === 'string') {
      setNote((current) => (current.trim() ? `${current.trim()}\n${payload}` : payload))
      setOcrMemo((current) => {
        const line = `${locale === 'en' ? 'OCR' : '圖像辨識'}: ${payload}`
        return current.trim() ? `${current.trim()}\n${line}` : line
      })
      return
    }
    if (payload.amount != null) {
      setAmount(String(Math.abs(payload.amount)))
    }
    if (payload.noteText) {
      setNote((current) => (current.trim() ? `${current.trim()}\n${payload.noteText}` : payload.noteText))
      setOcrMemo((current) => {
        const line = `${locale === 'en' ? 'OCR' : '圖像辨識'}: ${payload.noteText}`
        return current.trim() ? `${current.trim()}\n${line}` : line
      })
    }
    if (payload.attachmentMemo) {
      const ocrIndex = attachments[ocrAttachmentIndex] ? ocrAttachmentIndex : 0
      setAttachmentNote(payload.attachmentMemo)
      setAttachments((prev) =>
        prev.map((item, index) => (index === ocrIndex ? { ...item, note: payload.attachmentMemo } : item))
      )
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!titleOrAmountReady()) return

    setIsSubmitting(true)
    const numericAmount = type === 'EXPENSE' ? -Math.abs(Number(amount)) : Math.abs(Number(amount))
    const res = await createPrivateRecord({
      type,
      date: new Date(date),
      note,
      customCategory,
      amount: numericAmount,
      attachments:
        attachments.length > 0
          ? attachments.map((a) => ({
              url: a.url,
              size: a.size,
              note: a.note || attachmentNote || undefined,
            }))
          : undefined,
      initialMemo: ocrMemo.trim() || undefined,
    })

    if (res.success) {
      window.location.reload()
      return
    }

    alert(`${t('submitFailed')}: ${res.error}`)
    setIsSubmitting(false)
  }

  const titleOrAmountReady = () => {
    if (!customCategory.trim() || !amount || !date) {
      alert(t('fillRequiredFields'))
      return false
    }
    return true
  }

  const handleVisibilityChange = async (nextValue: 'PRIVATE' | 'PUBLIC') => {
    setCurrentVisibility(nextValue)
    setIsSavingVisibility(true)
    const res = await updatePrivateLedgerVisibility(nextValue)
    if (!res.success) {
      alert(res.error)
      setCurrentVisibility(visibility)
    }
    setIsSavingVisibility(false)
  }

  const createPdfDoc = () => {
    const doc = new jsPDF()
    if (fontBase64) {
      doc.addFileToVFS('NotoSansSC-Regular.ttf', fontBase64)
      doc.addFont('NotoSansSC-Regular.ttf', 'NotoSansSC', 'normal')
      doc.addFont('NotoSansSC-Regular.ttf', 'NotoSansSC', 'bold')
      doc.setFont('NotoSansSC')
    }
    return doc
  }

  const exportPrivateLedgerPdf = () => {
    if (initialRecords.length === 0) {
      alert(t('noDataToExport'))
      return
    }

    const doc = createPdfDoc()
    const totalIncome = initialRecords.filter((item) => item.type === 'INCOME').reduce((sum, item) => sum + Math.abs(item.amount), 0)
    const totalExpense = initialRecords.filter((item) => item.type === 'EXPENSE').reduce((sum, item) => sum + Math.abs(item.amount), 0)

    if (fontBase64) doc.setFont('NotoSansSC', 'bold')
    doc.setFontSize(18)
    doc.text(t('privateLedgerPage'), 105, 18, { align: 'center' })

    if (fontBase64) doc.setFont('NotoSansSC', 'normal')
    doc.setFontSize(11)
    doc.text(`${t('privateLedgerOwner')}: ${owner.roleName}`, 14, 30)
    doc.text(`${t('totalIncome')}: ${totalIncome.toFixed(2)}`, 14, 38)
    doc.text(`${t('totalExpense')}: ${totalExpense.toFixed(2)}`, 80, 38)
    doc.text(`${t('balance')}: ${balance.toFixed(2)}`, 150, 38)

    autoTable(doc, {
      startY: 46,
      head: [[t('date'), t('type'), t('category'), t('amount'), t('note')]],
      body: initialRecords.map((item) => [
        new Date(item.date).toLocaleDateString(locale === 'en' ? 'en-HK' : 'zh-HK'),
        item.type === 'INCOME' ? t('income') : t('expense'),
        item.customCategory?.trim() || [item.category?.name, item.subCategory?.name, item.thirdCategory?.name].filter(Boolean).join(' / ') || t('uncategorized'),
        formatCurrency(locale, item.amount),
        item.note || '-',
      ]),
      styles: { font: fontBase64 ? 'NotoSansSC' : 'helvetica' },
      headStyles: { fillColor: [66, 139, 202], font: fontBase64 ? 'NotoSansSC' : 'helvetica' },
    })

    doc.save(locale === 'en' ? 'private-ledger.pdf' : '私帳報表.pdf')
  }

  const inputClass = 'w-full rounded-xl border-transparent bg-white p-3 text-gray-900 shadow-sm outline-none transition-all placeholder-gray-400 focus:border-[#007AFF] focus:bg-white focus:ring-2 focus:ring-[#007AFF]/30'

  return (
    <div className="space-y-4 pt-4 sm:space-y-6 sm:pt-6">
      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{canManage ? t('myPrivateLedger') : `${owner.roleName} - ${t('privateLedger')}`}</h2>
            <p className="mt-2 text-sm text-gray-500">{t('privateLedgerPageHint')}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button onClick={exportPrivateLedgerPdf} className="rounded-xl bg-[#007AFF] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0066CC]">
              {t('exportPrivateLedgerPdf')}
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-[#F2F2F7] p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('privateLedgerOwner')}</div>
            <div className="mt-2 text-lg font-semibold text-gray-900">{owner.roleName}</div>
          </div>
          <div className="rounded-2xl bg-[#F2F2F7] p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('balance')}</div>
            <div className="mt-2 text-lg font-semibold text-gray-900">{formatCurrency(locale, balance)}</div>
          </div>
          <div className="rounded-2xl bg-[#F2F2F7] p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('privateLedgerVisibility')}</div>
            {canManage ? (
              <select
                value={currentVisibility}
                onChange={(e) => handleVisibilityChange(e.target.value as 'PRIVATE' | 'PUBLIC')}
                disabled={isSavingVisibility}
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none"
              >
                <option value="PRIVATE">{t('privateLedgerPrivate')}</option>
                <option value="PUBLIC">{t('privateLedgerPublic')}</option>
              </select>
            ) : (
              <div className="mt-2 text-sm font-semibold text-gray-900">{currentVisibility === 'PUBLIC' ? t('privateLedgerPublic') : t('privateLedgerPrivate')}</div>
            )}
          </div>
        </div>
        {canManage && <p className="mt-3 text-xs text-gray-400">{t('privateLedgerVisibilityHint')}</p>}
      </section>

      {canManage && (
        <>
          <section className={`rounded-2xl border p-4 shadow-sm sm:rounded-3xl sm:p-6 ${type === 'INCOME' ? 'border-[#007AFF]/20 bg-[#F2F8FF]' : 'border-[#FF3B30]/20 bg-[#FFF2F2]'}`}>
            <div className="mb-3 text-sm font-medium text-gray-500 sm:hidden">{t('submitRecord')}</div>
            <div className="mb-5 flex w-full space-x-2 rounded-xl bg-gray-200/50 p-1 sm:mb-6 sm:w-fit sm:space-x-3">
              <button type="button" className={`rounded-lg px-5 py-2 text-sm font-semibold transition-all shadow-sm ${type === 'EXPENSE' ? 'bg-white text-[#FF3B30]' : 'bg-transparent text-gray-600 shadow-none'}`} onClick={() => { setType('EXPENSE') }}>
                {t('expense')}
              </button>
              <button type="button" className={`rounded-lg px-5 py-2 text-sm font-semibold transition-all shadow-sm ${type === 'INCOME' ? 'bg-white text-[#007AFF]' : 'bg-transparent text-gray-600 shadow-none'}`} onClick={() => { setType('INCOME') }}>
                {t('income')}
              </button>
            </div>

            <form id="private-ledger-form" onSubmit={handleSubmit} className="space-y-5 pb-24 md:pb-0">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">{t('date')}</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">{t('amount')}</label>
                  <div className="flex rounded-xl bg-white shadow-sm">
                    <div className="shrink-0 rounded-l-xl bg-transparent py-3 pl-3 pr-4 text-sm font-medium text-gray-900 sm:text-base">HKD$</div>
                    <div className="my-2 w-px shrink-0 bg-gray-100" />
                    <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full min-w-0 flex-1 rounded-r-xl border-transparent bg-transparent px-2 py-3 text-sm font-semibold text-gray-900 outline-none sm:px-3 sm:text-base" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">{t('privateCategoryLabel')}</label>
                  <input
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    className={inputClass}
                    placeholder={t('privateCategoryPlaceholder')}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">{t('noteOptional')}</label>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} className={inputClass} placeholder={t('noteLongPlaceholder')} />
                </div>
                <div className="space-y-3 rounded-2xl border border-dashed border-gray-300 bg-white/50 p-4 md:col-span-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">{t('attachment')} <span className="normal-case font-normal">({t('attachmentAcceptHint')})</span></label>
                    <OcrNoteButton
                      locale={locale}
                      attachments={attachments}
                      context="private-record"
                      onResolved={appendRecognizedText}
                      disabled={isSubmitting}
                    />
                  </div>
                  <input type="file" accept="image/*,application/pdf" onChange={handleImageChange} className="w-full text-sm text-gray-600 file:mr-4 file:rounded-xl file:border-0 file:bg-[#007AFF]/10 file:px-5 file:py-2.5 file:text-sm file:font-semibold file:text-[#007AFF]" />
                  <input
                    value={attachmentNote}
                    onChange={(e) => {
                      const value = e.target.value
                      setAttachmentNote(value)
                      setAttachments((prev) =>
                        prev.map((item, index) =>
                          index === (attachments[ocrAttachmentIndex] ? ocrAttachmentIndex : 0)
                            ? { ...item, note: value }
                            : item
                        )
                      )
                    }}
                    placeholder={t('attachmentTypePlaceholder')}
                    className={inputClass}
                  />
                  {attachments.length > 0 && (
                    <div className="space-y-2">
                      {attachments.length > 1 && (
                        <div className="text-xs font-medium text-[#007AFF]">
                          {t('pdfPagesReady').replace('{{count}}', String(attachments.length))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {attachments.map((item, index) => (
                          <div
                            key={`${item.size}-${index}-${item.pageIndex || 0}`}
                            className={`relative rounded-lg border p-1 ${
                              index === ocrAttachmentIndex ? 'border-[#007AFF] ring-2 ring-[#007AFF]/20' : 'border-gray-200'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setOcrAttachmentIndex(index)
                                setAttachmentNote(item.note || '')
                              }}
                              className="block"
                            >
                              <img src={item.url} alt="" className="h-16 w-16 rounded object-cover" />
                              {(item.pageIndex || attachments.length > 1) && (
                                <div className="mt-0.5 text-center text-[10px] text-gray-500">
                                  {item.pageIndex ?? index + 1}
                                </div>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeAttachmentAt(index)}
                              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-[10px] leading-none text-white"
                              aria-label={t('delete')}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <button type="submit" disabled={isSubmitting} className={`mt-6 hidden w-full rounded-xl py-4 font-semibold text-white shadow-sm transition-all md:block ${isSubmitting ? 'cursor-not-allowed bg-gray-300 text-gray-500 shadow-none' : type === 'INCOME' ? 'bg-[#007AFF] hover:bg-[#0066CC]' : 'bg-[#FF3B30] hover:bg-[#CC2E26]'}`}>
                {isSubmitting ? t('submitting') : t('submitRecord')}
              </button>
            </form>
          </section>

          <div className="mobile-safe-action fixed inset-x-0 z-20 px-4 md:hidden">
            <div className="mx-auto max-w-4xl rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur">
              <button
                type="submit"
                form="private-ledger-form"
                disabled={isSubmitting}
                className={`w-full rounded-xl py-4 text-sm font-semibold text-white transition-all ${isSubmitting ? 'cursor-not-allowed bg-gray-300 text-gray-500' : type === 'INCOME' ? 'bg-[#007AFF] hover:bg-[#0066CC]' : 'bg-[#FF3B30] hover:bg-[#CC2E26]'}`}
              >
                {isSubmitting ? t('submitting') : t('submitRecord')}
              </button>
            </div>
          </div>

          <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
            <h3 className="text-lg font-semibold text-gray-800">{t('sharedPrivateLedgers')}</h3>
            <div className="mt-4 space-y-3">
              {sharedUsers.length === 0 ? (
                <div className="text-sm text-gray-400">{t('noPublicPrivateLedgers')}</div>
              ) : (
                sharedUsers.map((user) => (
                  <div key={user.id} className="flex items-center justify-between rounded-2xl border border-gray-100 p-4">
                    <div className="font-medium text-gray-900">{user.roleName}</div>
                    <Link href={`/private-ledger/${user.id}`} className="rounded-lg bg-[#007AFF]/10 px-3 py-1.5 text-sm font-semibold text-[#007AFF]">
                      {t('viewLedger')}
                    </Link>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm sm:rounded-3xl">
        <div className="border-b border-gray-100 p-4 pb-3 sm:p-6 sm:pb-4">
          <h2 className="text-lg font-semibold text-gray-800">{t('recentRecords')}</h2>
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm text-gray-700">
            <thead className="bg-[#F2F2F7]/50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-6 py-3 font-medium">{t('date')}</th>
                <th className="px-6 py-3 font-medium">{t('type')}</th>
                <th className="px-6 py-3 font-medium">{t('category')}</th>
                <th className="px-6 py-3 font-medium">{t('amount')}</th>
                <th className="px-6 py-3 font-medium">{t('detail')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {initialRecords.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center font-medium text-gray-400">{t('noPrivateRecords')}</td></tr>
              ) : (
                initialRecords.map((record) => (
                  <tr key={record.id} className="transition-colors hover:bg-gray-50/80">
                    <td className="px-6 py-4">{new Date(record.date).toLocaleDateString(locale === 'en' ? 'en-HK' : 'zh-HK')}</td>
                    <td className="px-6 py-4">{record.type === 'INCOME' ? t('income') : t('expense')}</td>
                    <td className="px-6 py-4">{record.customCategory?.trim() || [record.category?.name, record.subCategory?.name, record.thirdCategory?.name].filter(Boolean).join(' / ') || t('uncategorized')}</td>
                    <td className={`px-6 py-4 font-bold ${record.amount > 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>{formatCurrency(locale, record.amount)}</td>
                    <td className="px-6 py-4"><button onClick={() => setSelectedRecord(record)} className="text-sm font-medium text-[#007AFF] hover:underline">{t('detail')}</button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-gray-100 md:hidden">
          {initialRecords.length === 0 ? (
            <div className="p-8 text-center font-medium text-gray-400">{t('noPrivateRecords')}</div>
          ) : (
            initialRecords.map((record) => (
              <div key={record.id} className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">{new Date(record.date).toLocaleDateString(locale === 'en' ? 'en-HK' : 'zh-HK')}</div>
                  <div className={`text-sm font-bold ${record.amount > 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>{formatCurrency(locale, record.amount)}</div>
                </div>
                <div className="text-sm text-gray-600">{record.customCategory?.trim() || [record.category?.name, record.subCategory?.name, record.thirdCategory?.name].filter(Boolean).join(' / ') || t('uncategorized')}</div>
                <div className="flex items-center justify-between border-t border-gray-50 pt-2">
                  <span className="text-xs text-gray-400">{record.type === 'INCOME' ? t('income') : t('expense')}</span>
                  <button onClick={() => setSelectedRecord(record)} className="rounded bg-[#007AFF]/10 px-3 py-1 text-xs font-medium text-[#007AFF]">{t('detail')}</button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {selectedRecord && (
        <PrivateRecordDetailModal record={selectedRecord} locale={locale} canManage={canManage} onClose={() => setSelectedRecord(null)} />
      )}
    </div>
  )
}