'use client'

import React, { useMemo, useState } from 'react'
import { createContract } from '../actions/contract'
import { createTranslator, formatCurrency, type Locale } from '@/lib/i18n'
import { compressImage, MAX_PDF_PAGES, prepareAttachments, type ClientAttachment } from '@/lib/image'
import ContractDetailModal from '../ContractDetailModal'
import OcrNoteButton, { type OcrResolvedPayload } from '@/components/OcrNoteButton'

type ContractItem = {
  id: string
  userId: string
  title: string
  type: string
  effectiveDate: string | Date
  expiryDate: string | Date
  reminderDays: number
  note?: string | null
  amount: number
  poolId?: string | null
  categoryId?: string | null
  subCategoryId?: string | null
  thirdCategoryId?: string | null
  pool?: { name: string } | null
  category?: { name: string } | null
  subCategory?: { name: string } | null
  thirdCategory?: { name: string } | null
  attachments?: any[]
  memos?: any[]
}

type Props = {
  locale: Locale
  pools: any[]
  currentUserId: string
  initialContracts: ContractItem[]
}

function getDaysDiff(value: string | Date) {
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const target = new Date(value)
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  return Math.ceil((targetDay.getTime() - startOfToday.getTime()) / 86400000)
}

export default function ContractsClient({ locale, pools, currentUserId, initialContracts }: Props) {
  const t = createTranslator(locale)
  const [selectedContract, setSelectedContract] = useState<ContractItem | null>(null)
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE')
  const [title, setTitle] = useState('')
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().split('T')[0])
  const [expiryDate, setExpiryDate] = useState(() => new Date().toISOString().split('T')[0])
  const [reminderDays, setReminderDays] = useState('15')
  const [amount, setAmount] = useState('')
  const [poolId, setPoolId] = useState('')
  const [note, setNote] = useState('')
  const [ocrMemo, setOcrMemo] = useState('')
  const [attachments, setAttachments] = useState<ClientAttachment[]>([])
  const [ocrAttachmentIndex, setOcrAttachmentIndex] = useState(0)
  const [attachmentNote, setAttachmentNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const reminderGroups = useMemo(() => {
    const items = initialContracts
      .map((contract) => {
        const daysUntilExpiry = getDaysDiff(contract.expiryDate)
        let bucket: 'overdue' | 'today' | 'upcoming' | null = null
        if (daysUntilExpiry < 0) bucket = 'overdue'
        else if (daysUntilExpiry === 0) bucket = 'today'
        else if (daysUntilExpiry <= contract.reminderDays) bucket = 'upcoming'

        return bucket ? { ...contract, daysUntilExpiry, bucket } : null
      })
      .filter(Boolean) as Array<ContractItem & { daysUntilExpiry: number; bucket: 'overdue' | 'today' | 'upcoming' }>

    return {
      overdue: items.filter((item) => item.bucket === 'overdue'),
      today: items.filter((item) => item.bucket === 'today'),
      upcoming: items.filter((item) => item.bucket === 'upcoming'),
    }
  }, [initialContracts])

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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!title.trim() || !amount || !effectiveDate || !expiryDate || !reminderDays.trim()) {
      alert(t('fillRequiredFields'))
      return
    }

    setIsSubmitting(true)
    const numericAmount = type === 'EXPENSE' ? -Math.abs(Number(amount)) : Math.abs(Number(amount))
    const [first, ...rest] = attachments
    const res = await createContract({
      title: title.trim(),
      type,
      effectiveDate: new Date(effectiveDate),
      expiryDate: new Date(expiryDate),
      reminderDays: Number(reminderDays),
      amount: numericAmount,
      note: note.trim() || undefined,
      poolId: poolId || undefined,
      attachment: first
        ? { url: first.url, size: first.size, note: first.note || attachmentNote || undefined }
        : undefined,
      attachments: rest.length
        ? rest.map((page) => ({
            url: page.url,
            size: page.size,
            note: page.note || attachmentNote || undefined,
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

  const inputClass = 'w-full rounded-xl border-transparent bg-white p-3 text-gray-900 shadow-sm outline-none transition-all placeholder-gray-400 focus:border-[#007AFF] focus:bg-white focus:ring-2 focus:ring-[#007AFF]/30'

  const totalReminderCount =
    reminderGroups.overdue.length + reminderGroups.today.length + reminderGroups.upcoming.length

  const renderReminderGroup = (
    titleText: string,
    items: Array<ContractItem & { daysUntilExpiry: number }>,
    pillClass: string
  ) => {
    if (items.length === 0) return null

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">{titleText}</h3>
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${pillClass}`}>{items.length}</span>
        </div>
        {items.slice(0, 3).map((contract) => (
          <div key={contract.id} className="flex flex-col gap-1 rounded-xl bg-white/80 px-3 py-2 text-sm text-gray-700 sm:flex-row sm:items-center sm:justify-between">
            <div className="font-medium text-gray-900">{contract.title}</div>
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <span>{new Date(contract.expiryDate).toLocaleDateString(locale === 'en' ? 'en-HK' : 'zh-HK')}</span>
              <span className="rounded-full bg-[#FFF7ED] px-2 py-0.5 font-medium text-[#C2410C]">
                {contract.daysUntilExpiry < 0
                  ? locale === 'en'
                    ? `${Math.abs(contract.daysUntilExpiry)} days overdue`
                    : `已逾期 ${Math.abs(contract.daysUntilExpiry)} 天`
                  : contract.daysUntilExpiry === 0
                    ? t('expiresToday')
                    : locale === 'en'
                      ? `${contract.daysUntilExpiry} days left`
                      : `尚餘 ${contract.daysUntilExpiry} 天`}
              </span>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4 overflow-x-hidden pt-4 sm:space-y-6 sm:pt-6">
      {totalReminderCount > 0 && (
        <section className="rounded-2xl border border-[#FF9500]/20 bg-[#FFF7ED] px-4 py-4 shadow-sm sm:rounded-3xl sm:px-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-[#FF9500]/10 p-2 text-[#FF9500]">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <h2 className="text-base font-semibold text-[#9A3412]">{t('contractExpiryReminder')}</h2>
                <p className="mt-1 text-sm text-[#C2410C]">{t('contractsReminderGroupedHint')}</p>
              </div>
              {renderReminderGroup(t('reminderOverdue'), reminderGroups.overdue, 'bg-[#FF3B30]/10 text-[#FF3B30]')}
              {renderReminderGroup(t('reminderToday'), reminderGroups.today, 'bg-[#FF9500]/10 text-[#C2410C]')}
              {renderReminderGroup(t('reminderUpcoming'), reminderGroups.upcoming, 'bg-[#007AFF]/10 text-[#007AFF]')}
            </div>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5">
        <h2 className="text-xl font-semibold text-gray-900">{t('contractsPage')}</h2>
        <p className="mt-2 text-sm text-gray-500">{t('contractsPageHint')}</p>
      </section>

      <section className={`rounded-2xl border p-4 shadow-sm sm:rounded-3xl sm:p-6 ${type === 'INCOME' ? 'border-[#007AFF]/20 bg-[#F2F8FF]' : 'border-[#FF3B30]/20 bg-[#FFF2F2]'}`}>
        <div className="mb-5 flex w-fit space-x-2 rounded-xl bg-gray-200/50 p-1 sm:space-x-3 sm:mb-6">
          <button type="button" className={`rounded-lg px-5 py-2 text-sm font-semibold transition-all shadow-sm ${type === 'EXPENSE' ? 'bg-white text-[#FF3B30]' : 'bg-transparent text-gray-600 shadow-none'}`} onClick={() => setType('EXPENSE')}>
            {t('expense')}
          </button>
          <button type="button" className={`rounded-lg px-5 py-2 text-sm font-semibold transition-all shadow-sm ${type === 'INCOME' ? 'bg-white text-[#007AFF]' : 'bg-transparent text-gray-600 shadow-none'}`} onClick={() => setType('INCOME')}>
            {t('income')}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">{t('contractTitle')}</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder={t('contractTitlePlaceholder')} />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">{t('effectiveDate')}</label>
              <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className={inputClass} />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">{t('expiryDate')}</label>
              <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={inputClass} />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">{t('reminderDays')}</label>
              <input type="number" min="0" value={reminderDays} onChange={(e) => setReminderDays(e.target.value)} className={inputClass} />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">{t('amount')}</label>
              <div className="flex rounded-xl bg-white shadow-sm focus-within:ring-2 focus-within:ring-[#007AFF]/30 transition-all">
                <div className="shrink-0 rounded-l-xl bg-transparent py-3 pl-3 pr-4 text-sm font-medium text-gray-900 sm:text-base">HKD$</div>
                <div className="my-2 w-px shrink-0 bg-gray-100" />
                <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full min-w-0 flex-1 rounded-r-xl border-transparent bg-transparent px-2 py-3 text-sm font-semibold text-gray-900 outline-none sm:px-3 sm:text-base" />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">{t('pool')}</label>
              <select value={poolId} onChange={(e) => setPoolId(e.target.value)} className={inputClass}>
                <option value="">{t('all')}</option>
                {pools.map((pool: any) => <option key={pool.id} value={pool.id}>{pool.name}</option>)}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">{t('noteOptional')}</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} className={inputClass} placeholder={t('noteLongPlaceholder')} />
            </div>

            <div className="space-y-3 rounded-2xl border border-dashed border-gray-300 bg-white/50 p-4 md:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">{t('attachment')} <span className="normal-case font-normal">({t('attachmentAcceptHint')})</span></label>
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
              <div className="flex justify-end">
                <OcrNoteButton
                  locale={locale}
                  attachments={attachments}
                  context="contract"
                  onResolved={appendRecognizedText}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>

          <button type="submit" disabled={isSubmitting} className={`mt-6 w-full rounded-xl py-4 font-semibold text-white shadow-sm transition-all ${isSubmitting ? 'cursor-not-allowed bg-gray-300 text-gray-500 shadow-none' : type === 'INCOME' ? 'bg-[#007AFF] hover:bg-[#0066CC]' : 'bg-[#FF3B30] hover:bg-[#CC2E26]'}`}>
            {isSubmitting ? t('submitting') : t('createContract')}
          </button>
        </form>
      </section>

      <section className="mb-10 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-4 pb-3 sm:p-6 sm:pb-4">
          <h2 className="text-lg font-semibold text-gray-800">{t('contractsList')}</h2>
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm text-gray-700">
            <thead className="bg-[#F2F2F7]/50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-6 py-3 font-medium">{t('contractTitle')}</th>
                <th className="px-6 py-3 font-medium">{t('type')}</th>
                <th className="px-6 py-3 font-medium">{t('expiryDate')}</th>
                <th className="px-6 py-3 font-medium">{t('reminderDays')}</th>
                <th className="px-6 py-3 font-medium">{t('amount')}</th>
                <th className="px-6 py-3 font-medium">{t('detail')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {initialContracts.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center font-medium text-gray-400">{t('noContracts')}</td></tr>
              ) : (
                initialContracts.map((contract) => (
                  <tr key={contract.id} className="transition-colors hover:bg-gray-50/80">
                    <td className="px-6 py-4 font-medium">{contract.title}</td>
                    <td className="px-6 py-4">{contract.type === 'INCOME' ? t('income') : t('expense')}</td>
                    <td className="px-6 py-4">{new Date(contract.expiryDate).toLocaleDateString(locale === 'en' ? 'en-HK' : 'zh-HK')}</td>
                    <td className="px-6 py-4">{contract.reminderDays}</td>
                    <td className={`px-6 py-4 font-bold ${contract.amount > 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>{formatCurrency(locale, contract.amount)}</td>
                    <td className="px-6 py-4"><button onClick={() => setSelectedContract(contract)} className="text-sm font-medium text-[#007AFF] hover:underline">{t('detail')}</button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-gray-100 md:hidden">
          {initialContracts.length === 0 ? (
            <div className="p-8 text-center font-medium text-gray-400">{t('noContracts')}</div>
          ) : (
            initialContracts.map((contract) => (
              <div key={contract.id} className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">{contract.title}</div>
                  <div className={`text-sm font-bold ${contract.amount > 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>{formatCurrency(locale, contract.amount)}</div>
                </div>
                <div className="text-xs text-gray-500">{t('expiryDate')}: {new Date(contract.expiryDate).toLocaleDateString(locale === 'en' ? 'en-HK' : 'zh-HK')}</div>
                <div className="text-xs text-gray-500">{t('reminderDays')}: {contract.reminderDays}</div>
                <div className="flex items-center justify-between border-t border-gray-50 pt-2">
                  <span className="text-xs text-gray-400">{contract.type === 'INCOME' ? t('income') : t('expense')}</span>
                  <button onClick={() => setSelectedContract(contract)} className="rounded bg-[#007AFF]/10 px-3 py-1 text-xs font-medium text-[#007AFF]">{t('detail')}</button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {selectedContract && (
        <ContractDetailModal
          contract={selectedContract}
          locale={locale}
          pools={pools}
          canManage={selectedContract.userId === currentUserId}
          onClose={() => setSelectedContract(null)}
        />
      )}
    </div>
  )
}
