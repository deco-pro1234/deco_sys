'use client'

import { useState } from 'react'
import { addContractAttachment, addContractMemo, appendContractNoteKeywords, deleteContract, updateContract } from './actions/contract'
import { createTranslator, formatCurrency, type Locale } from '@/lib/i18n'
import { compressImage, MAX_PDF_PAGES, openAttachment, prepareAttachments, type ClientAttachment } from '@/lib/image'
import OcrNoteButton, { type OcrResolvedPayload } from '@/components/OcrNoteButton'
import OcrSavedAttachmentButton from '@/components/OcrSavedAttachmentButton'
import NoteTimeline from '@/components/NoteTimeline'

export default function ContractDetailModal({
  contract,
  locale,
  canManage,
  pools,
  onClose,
}: {
  contract: any
  locale: Locale
  canManage: boolean
  pools: any[]
  onClose: () => void
}) {
  const t = createTranslator(locale)
  const dateLocale = locale === 'en' ? 'en-HK' : 'zh-HK'
  const inputClass = 'w-full rounded-xl bg-[#F2F2F7] px-3 py-3 text-sm text-gray-900 outline-none'
  const readOnlyFieldClass = 'font-semibold text-gray-900'

  const [title, setTitle] = useState(contract.title || '')
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>(contract.type === 'INCOME' ? 'INCOME' : 'EXPENSE')
  const [effectiveDate, setEffectiveDate] = useState(new Date(contract.effectiveDate).toISOString().split('T')[0])
  const [expiryDate, setExpiryDate] = useState(new Date(contract.expiryDate).toISOString().split('T')[0])
  const [reminderDays, setReminderDays] = useState(String(contract.reminderDays ?? 15))
  const [amount, setAmount] = useState(String(Math.abs(Number(contract.amount) || 0)))
  const [poolId, setPoolId] = useState(contract.poolId || '')
  const [note, setNote] = useState(contract.note || '')
  const [attachments, setAttachments] = useState<ClientAttachment[]>([])
  const [ocrAttachmentIndex, setOcrAttachmentIndex] = useState(0)
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

  const handleSave = async () => {
    if (!title.trim() || !amount || !effectiveDate || !expiryDate || !reminderDays.trim()) {
      alert(t('fillRequiredFields'))
      return
    }

    setLoading(true)
    const numericAmount = type === 'EXPENSE' ? -Math.abs(Number(amount)) : Math.abs(Number(amount))
    const res = await updateContract(contract.id, {
      title: title.trim(),
      type,
      effectiveDate: new Date(effectiveDate),
      expiryDate: new Date(expiryDate),
      reminderDays: Number(reminderDays),
      amount: numericAmount,
      note: note.trim() || undefined,
      poolId: poolId || undefined,
      categoryId: contract.categoryId || undefined,
      subCategoryId: contract.subCategoryId || undefined,
      thirdCategoryId: contract.thirdCategoryId || undefined,
    })
    if (res.success) {
      window.location.reload()
      return
    }
    alert(res.error)
    setLoading(false)
  }

  const handleAppendAttachment = async () => {
    if (attachments.length === 0) return
    setLoading(true)
    for (const page of attachments) {
      const res = await addContractAttachment(contract.id, {
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
      await appendContractNoteKeywords(contract.id, pendingOcrKeywords.trim())
    }
    window.location.reload()
  }

  const onOcrResolved = (payload: OcrResolvedPayload | string) => {
    const noteText = typeof payload === 'string' ? payload : payload.noteText
    const attachmentMemo = typeof payload === 'string' ? '' : payload.attachmentMemo
    if (noteText) {
      setNote((current: string) => (current.trim() ? `${current.trim()}\n${noteText}` : noteText))
      setPendingOcrKeywords((current) => (current.trim() ? `${current.trim()}\n${noteText}` : noteText))
    }
    if (attachmentMemo) {
      const ocrIndex = attachments[ocrAttachmentIndex] ? ocrAttachmentIndex : 0
      setAttachmentNote(attachmentMemo)
      setAttachments((prev) =>
        prev.map((item, index) => (index === ocrIndex ? { ...item, note: attachmentMemo } : item))
      )
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(t('deleteContractConfirm'))) return
    setLoading(true)
    const res = await deleteContract(contract.id)
    if (res.success) {
      window.location.reload()
      return
    }
    alert(res.error)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-xl flex flex-col">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{t('contractDetails')}</h3>
            {!canManage && (
              <p className="mt-1 text-xs text-gray-500">{t('onlyCreatorCanEditContract')}</p>
            )}
          </div>
          <button onClick={onClose} className="p-2 bg-gray-200 hover:bg-gray-300 rounded-full text-gray-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="md:col-span-2">
              <div className="text-gray-500 mb-1">{t('contractTitle')}</div>
              {canManage ? (
                <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
              ) : (
                <div className={readOnlyFieldClass}>{contract.title}</div>
              )}
            </div>

            <div>
              <div className="text-gray-500 mb-1">{t('type')}</div>
              {canManage ? (
                <div className="flex space-x-2 rounded-xl bg-gray-200/50 p-1">
                  <button
                    type="button"
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${type === 'EXPENSE' ? 'bg-white text-[#FF3B30] shadow-sm' : 'text-gray-600'}`}
                    onClick={() => setType('EXPENSE')}
                  >
                    {t('expense')}
                  </button>
                  <button
                    type="button"
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${type === 'INCOME' ? 'bg-white text-[#007AFF] shadow-sm' : 'text-gray-600'}`}
                    onClick={() => setType('INCOME')}
                  >
                    {t('income')}
                  </button>
                </div>
              ) : (
                <div className={readOnlyFieldClass}>{contract.type === 'INCOME' ? t('income') : t('expense')}</div>
              )}
            </div>

            <div>
              <div className="text-gray-500 mb-1">{t('amount')}</div>
              {canManage ? (
                <div className="flex rounded-xl bg-[#F2F2F7] focus-within:ring-2 focus-within:ring-[#007AFF]/30">
                  <div className="shrink-0 py-3 pl-3 pr-2 text-sm font-medium text-gray-900">HKD$</div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full min-w-0 flex-1 rounded-r-xl border-transparent bg-transparent px-2 py-3 text-sm font-semibold text-gray-900 outline-none"
                  />
                </div>
              ) : (
                <div className={`font-bold ${contract.amount > 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>
                  {formatCurrency(locale, contract.amount)}
                </div>
              )}
            </div>

            <div>
              <div className="text-gray-500 mb-1">{t('effectiveDate')}</div>
              {canManage ? (
                <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className={inputClass} />
              ) : (
                <div className={readOnlyFieldClass}>{new Date(contract.effectiveDate).toLocaleDateString(dateLocale)}</div>
              )}
            </div>

            <div>
              <div className="text-gray-500 mb-1">{t('expiryDate')}</div>
              {canManage ? (
                <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={inputClass} />
              ) : (
                <div className={readOnlyFieldClass}>{new Date(contract.expiryDate).toLocaleDateString(dateLocale)}</div>
              )}
            </div>

            <div>
              <div className="text-gray-500 mb-1">{t('reminderDays')}</div>
              {canManage ? (
                <input type="number" min="0" value={reminderDays} onChange={(e) => setReminderDays(e.target.value)} className={inputClass} />
              ) : (
                <div className={readOnlyFieldClass}>{contract.reminderDays ?? 15}</div>
              )}
            </div>

            <div>
              <div className="text-gray-500 mb-1">{t('pool')}</div>
              {canManage ? (
                <select value={poolId} onChange={(e) => setPoolId(e.target.value)} className={inputClass}>
                  <option value="">{t('all')}</option>
                  {pools.map((pool: any) => (
                    <option key={pool.id} value={pool.id}>{pool.name}</option>
                  ))}
                </select>
              ) : (
                <div className={readOnlyFieldClass}>{contract.pool?.name || '-'}</div>
              )}
            </div>

            <div className="md:col-span-2">
              <div className="text-gray-500 mb-1">{t('note')}</div>
              {canManage ? (
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={inputClass} />
              ) : (
                <div className={readOnlyFieldClass}>{contract.note || '-'}</div>
              )}
            </div>

            {(contract.category || contract.subCategory || contract.thirdCategory) && (
              <div className="md:col-span-2">
                <div className="text-gray-500 mb-1">{t('category')}</div>
                <div className={readOnlyFieldClass}>
                  {[contract.category?.name, contract.subCategory?.name, contract.thirdCategory?.name].filter(Boolean).join(' / ') || '-'}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-gray-100 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-gray-900">{t('attachmentsHistory')}</h4>
              <span className="text-xs text-gray-400">{contract.attachments?.length || 0}</span>
            </div>
            <div className="space-y-3">
              {(contract.attachments || []).length === 0 ? (
                <div className="text-sm text-gray-400">{t('noAttachmentData')}</div>
              ) : (
                contract.attachments.map((item: any) => (
                  <div key={item.id} className="rounded-xl border border-gray-100 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => openAttachment(item.fileUrl)}
                        className="text-[#007AFF] hover:underline font-medium"
                      >
                        {t('viewAttachment')}
                      </button>
                      <div className="flex items-center gap-2">
                        <OcrSavedAttachmentButton
                          locale={locale}
                          attachmentId={item.id}
                          context="contract"
                          disabled={loading}
                        />
                        <span className="text-xs text-gray-400">{new Date(item.createdAt).toLocaleString(dateLocale)}</span>
                      </div>
                    </div>
                    <div className="text-gray-500 mt-1">{item.note || '-'}</div>
                    <div className="text-xs text-gray-400 mt-1">{item.uploader?.roleName || '-'}</div>
                  </div>
                ))
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 border-t border-gray-100 pt-3 md:grid-cols-[1fr,1fr,auto]">
              <input type="file" accept="image/*,application/pdf" onChange={handleAttachmentChange} className="w-full text-sm text-gray-600 file:mr-4 file:rounded-xl file:border-0 file:bg-[#007AFF]/10 file:px-4 file:py-2 file:font-semibold file:text-[#007AFF]" />
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
                className="w-full rounded-xl bg-[#F2F2F7] px-3 py-3 text-sm text-gray-900 outline-none"
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                <OcrNoteButton
                  locale={locale}
                  attachments={attachments}
                  context="contract"
                  onResolved={onOcrResolved}
                  disabled={loading}
                />
                <button onClick={handleAppendAttachment} disabled={loading || attachments.length === 0} className="px-5 py-3 bg-[#007AFF] text-white rounded-xl font-semibold disabled:opacity-50">
                  {t('appendAttachment')}
                </button>
              </div>
              {attachments.length > 0 && (
                <div className="md:col-span-3 space-y-2">
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
                  <p className="text-xs text-gray-400">({t('attachmentAcceptHint')})</p>
                </div>
              )}
            </div>
          </div>

          <NoteTimeline
            locale={locale}
            items={contract.memos || []}
            disabled={loading}
            onAdd={(content) => addContractMemo(contract.id, content)}
          />
        </div>

        <div className="p-5 border-t border-gray-100 bg-white flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <button onClick={onClose} className="px-5 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold">
            {t('close')}
          </button>
          {canManage && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <button onClick={handleDelete} disabled={loading} className="px-5 py-3 bg-[#FF3B30] text-white rounded-xl font-semibold disabled:opacity-50">
                {t('deleteContract')}
              </button>
              <button onClick={handleSave} disabled={loading} className="px-5 py-3 bg-[#34C759] text-white rounded-xl font-semibold disabled:opacity-50">
                {t('saveContract')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
