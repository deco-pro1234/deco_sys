'use client'

import { useEffect, useMemo, useState } from 'react'
import { reviewRecord, type ReviewRecordEdits } from '../actions/review'
import { openAttachment } from '@/lib/image'
import { createTranslator, formatCurrency, type Locale } from '@/lib/i18n'
import OcrSavedAttachmentButton from '@/components/OcrSavedAttachmentButton'
import NoteTimeline from '@/components/NoteTimeline'
import { addRecordMemo } from '../actions/record'

type CategoryNode = {
  id: string
  name: string
  type?: string
  parentId?: string | null
  children?: CategoryNode[]
}

type PoolInfo = {
  id: string
  name: string
}

type EditForm = {
  type: 'INCOME' | 'EXPENSE'
  date: string
  amount: string
  note: string
  categoryId: string
  subCategoryId: string
  thirdCategoryId: string
  poolId: string
}

function toDateInput(value: string | Date) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().split('T')[0]
}

function buildForm(record: any): EditForm {
  return {
    type: record.type === 'INCOME' ? 'INCOME' : 'EXPENSE',
    date: toDateInput(record.date || record.createdAt),
    amount: String(Math.abs(Number(record.amount) || 0)),
    note: record.note || '',
    categoryId: record.categoryId || record.category?.id || '',
    subCategoryId: record.subCategoryId || record.subCategory?.id || '',
    thirdCategoryId: record.thirdCategoryId || record.thirdCategory?.id || '',
    poolId: record.poolId || record.pool?.id || '',
  }
}

export default function ReviewClient({
  pendingRecords,
  reviewedRecords,
  locale,
  title,
  categories,
  pools,
}: {
  pendingRecords: any[]
  reviewedRecords: any[]
  locale: Locale
  title: string
  categories: CategoryNode[]
  pools: PoolInfo[]
}) {
  const t = createTranslator(locale)
  const [tab, setTab] = useState<'PENDING' | 'REVIEWED'>('PENDING')
  const [loading, setLoading] = useState(false)
  const [modalRecord, setModalRecord] = useState<any>(null)
  const [form, setForm] = useState<EditForm | null>(null)

  const records = tab === 'PENDING' ? pendingRecords : reviewedRecords
  const isPending = tab === 'PENDING' && modalRecord?.status === 'PENDING'

  useEffect(() => {
    if (modalRecord) setForm(buildForm(modalRecord))
    else setForm(null)
  }, [modalRecord])

  const mainCategories = useMemo(() => {
    if (!form) return []
    return categories.filter((c) => c.type === form.type && !c.parentId)
  }, [categories, form])

  const selectedMain = useMemo(
    () => mainCategories.find((c) => c.id === form?.categoryId),
    [mainCategories, form?.categoryId]
  )
  const subCategories = selectedMain?.children || []
  const selectedSub = useMemo(
    () => subCategories.find((c) => c.id === form?.subCategoryId),
    [subCategories, form?.subCategoryId]
  )
  const thirdCategories = selectedSub?.children || []

  const handleAction = async (action: 'APPROVE' | 'REJECT') => {
    if (!modalRecord) return
    setLoading(true)

    let edits: ReviewRecordEdits | undefined
    if (action === 'APPROVE' && form) {
      let amount = parseFloat(form.amount)
      if (!Number.isFinite(amount) || !form.categoryId || !form.date) {
        alert(t('fillRequiredFields'))
        setLoading(false)
        return
      }
      amount = form.type === 'EXPENSE' ? -Math.abs(amount) : Math.abs(amount)
      edits = {
        type: form.type,
        date: form.date,
        note: form.note,
        amount,
        categoryId: form.categoryId,
        subCategoryId: form.subCategoryId || null,
        thirdCategoryId: form.thirdCategoryId || null,
        poolId: form.poolId || null,
      }
    }

    const res = await reviewRecord(modalRecord.id, action, edits)
    if (res.success) {
      alert(action === 'APPROVE' ? t('reviewerPassed') : t('reviewerRejected'))
      window.location.reload()
    } else {
      alert(res.error)
      setLoading(false)
    }
  }

  const inputClass = 'w-full rounded-xl bg-[#F2F2F7] px-3 py-3 text-sm text-gray-900 outline-none'

  return (
    <div className="space-y-6 pt-4">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <div className="flex space-x-6 border-b border-gray-200">
        <button
          className={`pb-2 font-semibold ${tab === 'PENDING' ? 'border-b-2 border-[#007AFF] text-[#007AFF]' : 'text-gray-500'}`}
          onClick={() => setTab('PENDING')}
        >
          {t('pending')} ({pendingRecords.length})
        </button>
        <button
          className={`pb-2 font-semibold ${tab === 'REVIEWED' ? 'border-b-2 border-[#007AFF] text-[#007AFF]' : 'text-gray-500'}`}
          onClick={() => setTab('REVIEWED')}
        >
          {t('reviewed')}
        </button>
      </div>

      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-700">
            <thead className="bg-[#F2F2F7]/50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                {tab === 'REVIEWED' && <th className="w-10 px-6 py-3 font-medium">{t('status')}</th>}
                <th className="px-6 py-3 font-medium">{t('time')}</th>
                <th className="px-6 py-3 font-medium">{t('type')}</th>
                <th className="px-6 py-3 font-medium">{t('category')}</th>
                <th className="px-6 py-3 font-medium">{t('role')}</th>
                <th className="px-6 py-3 font-medium">{t('pool')}</th>
                <th className="px-6 py-3 font-medium">{t('amount')}</th>
                <th className="px-6 py-3 font-medium">{t('note')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={tab === 'REVIEWED' ? 8 : 7} className="p-8 text-center font-medium text-gray-400">
                    {t('noData')}
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr
                    key={record.id}
                    className="cursor-pointer transition-colors hover:bg-gray-50/80"
                    onClick={() => setModalRecord(record)}
                  >
                    {tab === 'REVIEWED' && (
                      <td className="px-6 py-4">
                        {record.status === 'APPROVED' ? (
                          <svg className="h-5 w-5 text-[#34C759]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="h-5 w-5 text-[#FF3B30]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </td>
                    )}
                    <td className="px-6 py-4 font-medium">
                      {new Date(record.createdAt).toLocaleString(locale === 'en' ? 'en-HK' : 'zh-HK')}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`rounded px-2 py-1 text-xs font-semibold ${
                          record.type === 'INCOME' ? 'bg-[#007AFF]/10 text-[#007AFF]' : 'bg-[#FF3B30]/10 text-[#FF3B30]'
                        }`}
                      >
                        {record.type === 'INCOME' ? t('income') : t('expense')}
                        {record.originalRecordId && ` (${t('modify')})`}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {[record.category?.name, record.subCategory?.name, record.thirdCategory?.name]
                        .filter(Boolean)
                        .join(' / ') || '-'}
                    </td>
                    <td className="px-6 py-4 text-gray-500">{record.user?.roleName || '-'}</td>
                    <td className="px-6 py-4 text-gray-500">{record.pool?.name || '-'}</td>
                    <td className={`px-6 py-4 font-bold ${record.amount > 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>
                      {formatCurrency(locale, record.amount)}
                    </td>
                    <td className="max-w-[150px] truncate px-6 py-4 text-gray-500">{record.note || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalRecord && form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 p-5">
              <h3 className="text-lg font-bold text-gray-900">
                {isPending ? t('reviewEditPending') : t('reviewDetail')}
              </h3>
              <button
                onClick={() => setModalRecord(null)}
                className="rounded-full bg-gray-200 p-2 text-gray-600 transition-colors hover:bg-gray-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="space-y-6 overflow-y-auto p-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="mb-1 block text-gray-500">{t('role')}</span>
                  <span className="font-semibold text-gray-900">{modalRecord.user?.roleName}</span>
                </div>
                <div>
                  <span className="mb-1 block text-gray-500">{t('time')}</span>
                  <span className="font-semibold text-gray-900">
                    {new Date(modalRecord.createdAt).toLocaleString(locale === 'en' ? 'en-HK' : 'zh-HK')}
                  </span>
                </div>

                {isPending ? (
                  <>
                    <div>
                      <span className="mb-1 block text-gray-500">{t('type')}</span>
                      <select
                        value={form.type}
                        onChange={(e) => {
                          const next = e.target.value as 'INCOME' | 'EXPENSE'
                          setForm((prev) =>
                            prev
                              ? { ...prev, type: next, categoryId: '', subCategoryId: '', thirdCategoryId: '' }
                              : prev
                          )
                        }}
                        className={inputClass}
                      >
                        <option value="EXPENSE">{t('expense')}</option>
                        <option value="INCOME">{t('income')}</option>
                      </select>
                    </div>
                    <div>
                      <span className="mb-1 block text-gray-500">{t('date')}</span>
                      <input
                        type="date"
                        value={form.date}
                        onChange={(e) => setForm((prev) => (prev ? { ...prev, date: e.target.value } : prev))}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <span className="mb-1 block text-gray-500">{t('amount')}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.amount}
                        onChange={(e) => setForm((prev) => (prev ? { ...prev, amount: e.target.value } : prev))}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <span className="mb-1 block text-gray-500">{t('pool')}</span>
                      <select
                        value={form.poolId}
                        onChange={(e) => setForm((prev) => (prev ? { ...prev, poolId: e.target.value } : prev))}
                        className={inputClass}
                      >
                        <option value="">{t('selectPool')}</option>
                        {pools.map((pool) => (
                          <option key={pool.id} value={pool.id}>
                            {pool.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <span className="mb-1 block text-gray-500">{t('category')}</span>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <select
                          value={form.categoryId}
                          onChange={(e) =>
                            setForm((prev) =>
                              prev
                                ? { ...prev, categoryId: e.target.value, subCategoryId: '', thirdCategoryId: '' }
                                : prev
                            )
                          }
                          className={inputClass}
                        >
                          <option value="">{t('chooseMainCategoryFirst')}</option>
                          {mainCategories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={form.subCategoryId}
                          onChange={(e) =>
                            setForm((prev) =>
                              prev ? { ...prev, subCategoryId: e.target.value, thirdCategoryId: '' } : prev
                            )
                          }
                          className={inputClass}
                          disabled={subCategories.length === 0}
                        >
                          <option value="">-</option>
                          {subCategories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={form.thirdCategoryId}
                          onChange={(e) =>
                            setForm((prev) => (prev ? { ...prev, thirdCategoryId: e.target.value } : prev))
                          }
                          className={inputClass}
                          disabled={thirdCategories.length === 0}
                        >
                          <option value="">-</option>
                          {thirdCategories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <span className="mb-1 block text-gray-500">{t('note')}</span>
                      <textarea
                        rows={3}
                        value={form.note}
                        onChange={(e) => setForm((prev) => (prev ? { ...prev, note: e.target.value } : prev))}
                        className={inputClass}
                      />
                      <p className="mt-1 text-xs text-gray-400">{t('reviewSaveOnApproveHint')}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span className="mb-1 block text-gray-500">{t('category')}</span>
                      <span className="font-semibold text-gray-900">
                        {[modalRecord.category?.name, modalRecord.subCategory?.name, modalRecord.thirdCategory?.name]
                          .filter(Boolean)
                          .join(' / ') || '-'}
                      </span>
                    </div>
                    <div>
                      <span className="mb-1 block text-gray-500">{t('pool')}</span>
                      <span className="font-semibold text-gray-900">{modalRecord.pool?.name || '-'}</span>
                    </div>
                    <div>
                      <span className="mb-1 block text-gray-500">{t('type')}</span>
                      <span className="font-semibold text-gray-900">
                        {modalRecord.type === 'INCOME' ? t('income') : t('expense')}
                        {modalRecord.originalRecordId && ` (${t('modify')})`}
                      </span>
                    </div>
                    <div>
                      <span className="mb-1 block text-gray-500">{t('amount')}</span>
                      <span
                        className={`font-bold ${modalRecord.amount > 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}
                      >
                        {formatCurrency(locale, modalRecord.amount)}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="mb-1 block text-gray-500">{t('note')}</span>
                      <span className="whitespace-pre-wrap font-semibold text-gray-900">
                        {modalRecord.note || '-'}
                      </span>
                    </div>
                  </>
                )}

                <div className="col-span-2">
                  <span className="mb-1 block text-gray-500">{t('attachmentsHistory')}</span>
                  <div className="space-y-2">
                    {(modalRecord.attachments || []).length === 0 ? (
                      <span className="text-sm text-gray-400">{t('noAttachmentData')}</span>
                    ) : (
                      modalRecord.attachments.map((item: any) => (
                        <div key={item.id} className="rounded-xl border border-gray-100 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                openAttachment(item.fileUrl)
                              }}
                              className="font-medium text-[#007AFF] hover:underline"
                            >
                              {t('viewAttachment')}
                            </button>
                            {isPending && (
                              <OcrSavedAttachmentButton
                                locale={locale}
                                attachmentId={item.id}
                                context="record-edit"
                                disabled={loading}
                              />
                            )}
                          </div>
                          <div className="mt-1 text-gray-500">{item.note || '-'}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <NoteTimeline
                locale={locale}
                items={modalRecord.memos || []}
                canAdd={isPending}
                disabled={loading}
                onAdd={(content) => addRecordMemo(modalRecord.id, content)}
              />

              {isPending && (
                <div className="flex gap-3 border-t border-gray-100 pt-4">
                  <button
                    onClick={() => handleAction('APPROVE')}
                    disabled={loading}
                    className="flex-1 rounded-xl bg-[#34C759] py-3 font-semibold text-white shadow-sm transition-colors hover:bg-[#28A745] disabled:opacity-50"
                  >
                    {t('approve')}
                  </button>
                  <button
                    onClick={() => handleAction('REJECT')}
                    disabled={loading}
                    className="flex-1 rounded-xl bg-[#FF3B30] py-3 font-semibold text-white shadow-sm transition-colors hover:bg-[#CC2E26] disabled:opacity-50"
                  >
                    {t('reject')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
