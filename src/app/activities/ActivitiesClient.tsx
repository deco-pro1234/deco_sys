'use client'

import React, { useMemo, useState } from 'react'
import { createActivity } from '../actions/activity'
import { createTranslator, type Locale } from '@/lib/i18n'
import { compressImage, MAX_PDF_PAGES, prepareAttachments, type ClientAttachment } from '@/lib/image'
import ActivityDetailModal from '../ActivityDetailModal'
import OcrNoteButton, { type OcrResolvedPayload } from '@/components/OcrNoteButton'

type ActivityItem = {
  id: string
  title: string
  note?: string | null
  eventDate: string | Date
  reminderDays: number
  visibility: string
  userId: string
  user?: { roleName?: string | null } | null
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
  currentUserId: string
  isAdmin: boolean
  initialActivities: ActivityItem[]
}

export default function ActivitiesClient({ locale, currentUserId, isAdmin, initialActivities }: Props) {
  const t = createTranslator(locale)
  const [selectedActivity, setSelectedActivity] = useState<ActivityItem | null>(null)
  const [title, setTitle] = useState('')
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().split('T')[0])
  const [reminderDays, setReminderDays] = useState('15')
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC')
  const [note, setNote] = useState('')
  const [ocrMemo, setOcrMemo] = useState('')
  const [attachments, setAttachments] = useState<ClientAttachment[]>([])
  const [ocrAttachmentIndex, setOcrAttachmentIndex] = useState(0)
  const [attachmentNote, setAttachmentNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const reminderGroups = useMemo(() => {
    const today = new Date()
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())

    const items = initialActivities
      .map((activity) => {
        const event = new Date(activity.eventDate)
        const eventDay = new Date(event.getFullYear(), event.getMonth(), event.getDate())
        const daysUntilEvent = Math.ceil((eventDay.getTime() - startOfToday.getTime()) / 86400000)

        let bucket: 'overdue' | 'today' | 'upcoming' | null = null
        if (daysUntilEvent < 0) bucket = 'overdue'
        else if (daysUntilEvent === 0) bucket = 'today'
        else if (daysUntilEvent <= activity.reminderDays) bucket = 'upcoming'

        return {
          ...activity,
          daysUntilEvent,
          bucket,
        }
      })
      .filter((activity) => Boolean(activity.bucket))

    return {
      overdue: items.filter((activity) => activity.bucket === 'overdue'),
      today: items.filter((activity) => activity.bucket === 'today'),
      upcoming: items.filter((activity) => activity.bucket === 'upcoming'),
    }
  }, [initialActivities])

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
    if (!title.trim() || !eventDate || !reminderDays.trim()) {
      alert(t('fillRequiredFields'))
      return
    }

    setIsSubmitting(true)
    const res = await createActivity({
      title: title.trim(),
      note: note.trim() || undefined,
      eventDate: new Date(eventDate),
      reminderDays: Number(reminderDays),
      visibility,
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

  const appendRecognizedText = (payload: OcrResolvedPayload | string) => {
    if (typeof payload === 'string') {
      setNote((current) => (current.trim() ? `${current.trim()}\n${payload}` : payload))
      setOcrMemo((current) => {
        const line = `${locale === 'en' ? 'OCR' : '圖像辨識'}: ${payload}`
        return current.trim() ? `${current.trim()}\n${line}` : line
      })
      return
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

  const totalReminderCount =
    reminderGroups.overdue.length + reminderGroups.today.length + reminderGroups.upcoming.length

  const renderReminderGroup = (
    titleText: string,
    items: Array<ActivityItem & { daysUntilEvent: number }>,
    pillClass: string
  ) => {
    if (items.length === 0) return null

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">{titleText}</h3>
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${pillClass}`}>{items.length}</span>
        </div>
        {items.slice(0, 4).map((activity) => (
          <div key={activity.id} className="flex flex-col gap-1 rounded-xl bg-white/80 px-3 py-2 text-sm text-gray-700 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium text-gray-900">{activity.title}</div>
              <div className="text-xs text-gray-500">{activity.visibility === 'PUBLIC' ? t('publicActivity') : t('privateActivity')}</div>
            </div>
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <span>{new Date(activity.eventDate).toLocaleDateString(locale === 'en' ? 'en-HK' : 'zh-HK')}</span>
              <span className="rounded-full bg-[#FFF7ED] px-2 py-0.5 font-medium text-[#C2410C]">
                {activity.daysUntilEvent < 0
                  ? locale === 'en'
                    ? `${Math.abs(activity.daysUntilEvent)} days overdue`
                    : `已過期 ${Math.abs(activity.daysUntilEvent)} 天`
                  : activity.daysUntilEvent === 0
                    ? t('eventToday')
                    : locale === 'en'
                      ? `${activity.daysUntilEvent} days left`
                      : `尚餘 ${activity.daysUntilEvent} 天`}
              </span>
            </div>
          </div>
        ))}
      </div>
    )
  }

  const inputClass = 'w-full rounded-xl border-transparent bg-white p-3 text-gray-900 shadow-sm outline-none transition-all placeholder-gray-400 focus:border-[#007AFF] focus:bg-white focus:ring-2 focus:ring-[#007AFF]/30'

  return (
    <div className="space-y-4 pt-4 sm:space-y-6 sm:pt-6">
      {totalReminderCount > 0 && (
        <section className="rounded-2xl border border-[#FF9500]/20 bg-[#FFF7ED] px-4 py-4 shadow-sm sm:rounded-3xl sm:px-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-[#FF9500]/10 p-2 text-[#FF9500]">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <h2 className="text-base font-semibold text-[#9A3412]">{t('activityReminder')}</h2>
              <p className="mt-1 text-sm text-[#C2410C]">{t('activitiesReminderGroupedHint')}</p>
              {renderReminderGroup(t('reminderOverdue'), reminderGroups.overdue, 'bg-[#FF3B30]/10 text-[#FF3B30]')}
              {renderReminderGroup(t('reminderToday'), reminderGroups.today, 'bg-[#FF9500]/10 text-[#C2410C]')}
              {renderReminderGroup(t('reminderUpcoming'), reminderGroups.upcoming, 'bg-[#007AFF]/10 text-[#007AFF]')}
            </div>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5">
        <h2 className="text-xl font-semibold text-gray-900">{t('activitiesPage')}</h2>
        <p className="mt-2 text-sm text-gray-500">{t('activitiesPageHint')}</p>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-[#F2F8FF] p-4 shadow-sm sm:rounded-3xl sm:p-6">
        <div className="mb-3 text-sm font-medium text-gray-500 sm:hidden">{t('createActivity')}</div>
        <form id="activity-form" onSubmit={handleSubmit} className="space-y-5 pb-24 md:pb-0">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">{t('activityTitle')}</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder={t('activityTitlePlaceholder')} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">{t('activityDate')}</label>
              <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">{t('reminderDays')}</label>
              <input type="number" min="0" value={reminderDays} onChange={(e) => setReminderDays(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">{t('activityVisibility')}</label>
              <select value={visibility} onChange={(e) => setVisibility(e.target.value as 'PUBLIC' | 'PRIVATE')} className={inputClass}>
                <option value="PUBLIC">{t('publicActivity')}</option>
                <option value="PRIVATE">{t('privateActivity')}</option>
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
                  context="activity"
                  onResolved={appendRecognizedText}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>
          <button type="submit" disabled={isSubmitting} className={`mt-6 hidden w-full rounded-xl py-4 font-semibold text-white shadow-sm transition-all md:block ${isSubmitting ? 'cursor-not-allowed bg-gray-300 text-gray-500 shadow-none' : 'bg-[#007AFF] hover:bg-[#0066CC]'}`}>
            {isSubmitting ? t('submitting') : t('createActivity')}
          </button>
        </form>
      </section>

      <div className="mobile-safe-action fixed inset-x-0 z-20 px-4 md:hidden">
        <div className="mx-auto max-w-4xl rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur">
          <button
            type="submit"
            form="activity-form"
            disabled={isSubmitting}
            className={`w-full rounded-xl py-4 text-sm font-semibold text-white transition-all ${isSubmitting ? 'cursor-not-allowed bg-gray-300 text-gray-500' : 'bg-[#007AFF] hover:bg-[#0066CC]'}`}
          >
            {isSubmitting ? t('submitting') : t('createActivity')}
          </button>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm sm:rounded-3xl">
        <div className="border-b border-gray-100 p-4 pb-3 sm:p-6 sm:pb-4">
          <h2 className="text-lg font-semibold text-gray-800">{t('activitiesList')}</h2>
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm text-gray-700">
            <thead className="bg-[#F2F2F7]/50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-6 py-3 font-medium">{t('activityTitle')}</th>
                <th className="px-6 py-3 font-medium">{t('activityDate')}</th>
                <th className="px-6 py-3 font-medium">{t('activityVisibility')}</th>
                <th className="px-6 py-3 font-medium">{t('userLabel')}</th>
                <th className="px-6 py-3 font-medium">{t('detail')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {initialActivities.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center font-medium text-gray-400">{t('noActivities')}</td></tr>
              ) : (
                initialActivities.map((activity) => (
                  <tr key={activity.id} className="transition-colors hover:bg-gray-50/80">
                    <td className="px-6 py-4 font-medium">{activity.title}</td>
                    <td className="px-6 py-4">{new Date(activity.eventDate).toLocaleDateString(locale === 'en' ? 'en-HK' : 'zh-HK')}</td>
                    <td className="px-6 py-4">{activity.visibility === 'PUBLIC' ? t('publicActivity') : t('privateActivity')}</td>
                    <td className="px-6 py-4">{activity.user?.roleName || '-'}</td>
                    <td className="px-6 py-4"><button onClick={() => setSelectedActivity(activity)} className="text-sm font-medium text-[#007AFF] hover:underline">{t('detail')}</button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-gray-100 md:hidden">
          {initialActivities.length === 0 ? (
            <div className="p-8 text-center font-medium text-gray-400">{t('noActivities')}</div>
          ) : (
            initialActivities.map((activity) => (
              <div key={activity.id} className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">{activity.title}</div>
                  <div className="rounded-full bg-[#007AFF]/10 px-2 py-1 text-[10px] font-semibold text-[#007AFF]">
                    {activity.visibility === 'PUBLIC' ? t('publicActivity') : t('privateActivity')}
                  </div>
                </div>
                <div className="text-sm text-gray-600">{new Date(activity.eventDate).toLocaleDateString(locale === 'en' ? 'en-HK' : 'zh-HK')}</div>
                <div className="flex items-center justify-between border-t border-gray-50 pt-2">
                  <span className="text-xs text-gray-400">{activity.user?.roleName || '-'}</span>
                  <button onClick={() => setSelectedActivity(activity)} className="rounded bg-[#007AFF]/10 px-3 py-1 text-xs font-medium text-[#007AFF]">{t('detail')}</button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {selectedActivity && (
        <ActivityDetailModal
          activity={selectedActivity}
          locale={locale}
          canManage={isAdmin || selectedActivity.userId === currentUserId}
          onClose={() => setSelectedActivity(null)}
        />
      )}
    </div>
  )
}
