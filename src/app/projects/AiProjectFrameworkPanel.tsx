'use client'

import { useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createTranslator, type Locale } from '@/lib/i18n'
import { compressImage, MAX_PDF_PAGES, prepareAttachments, type ClientAttachment } from '@/lib/image'
import OcrNoteButton, { type OcrResolvedPayload } from '@/components/OcrNoteButton'
import {
  commitProjectFramework,
  suggestProjectFramework,
} from '../actions/projectFramework'
import type { FrameworkDraft } from '@/lib/projects/frameworkDraft'
import { countFrameworkTasks } from '@/lib/projects/frameworkDraft'

type Props = {
  locale: Locale
  memberIds: string[]
}

function frameworkTextFromOcr(payload: OcrResolvedPayload | string): string {
  if (typeof payload === 'string') return payload.trim()

  const parts: string[] = []
  const parsed = payload.parsed
  if (parsed?.vendor?.trim()) parts.push(parsed.vendor.trim())
  if (parsed?.documentDate?.trim()) parts.push(parsed.documentDate.trim())
  if (payload.noteText.trim()) parts.push(payload.noteText.trim())
  if (payload.contentText.trim()) parts.push(payload.contentText.trim())
  if (parts.length === 0 && payload.attachmentMemo.trim()) {
    parts.push(payload.attachmentMemo.trim())
  }
  return parts.join('\n')
}

export default function AiProjectFrameworkPanel({ locale, memberIds }: Props) {
  const t = createTranslator(locale)
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [attachments, setAttachments] = useState<ClientAttachment[]>([])
  const [ocrAttachmentIndex, setOcrAttachmentIndex] = useState(0)
  const [draft, setDraft] = useState<FrameworkDraft | null>(null)
  const [source, setSource] = useState<'llm' | 'mock' | null>(null)
  const [busy, setBusy] = useState(false)
  const [committing, setCommitting] = useState(false)

  const handleImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
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
    } catch {
      try {
        const fallback = await compressImage(file, 200)
        setAttachments([fallback])
        setOcrAttachmentIndex(0)
      } catch {
        alert(t('imageCompressionFailed'))
      }
    }
    event.target.value = ''
  }

  const removeAttachmentAt = (index: number) => {
    const next = attachments.filter((_, i) => i !== index)
    let nextOcr = ocrAttachmentIndex
    if (index < ocrAttachmentIndex) nextOcr = ocrAttachmentIndex - 1
    else if (index === ocrAttachmentIndex) nextOcr = 0
    nextOcr = Math.min(nextOcr, Math.max(0, next.length - 1))
    setAttachments(next)
    setOcrAttachmentIndex(nextOcr)
  }

  const appendOcrToDescription = (payload: OcrResolvedPayload | string) => {
    const text = frameworkTextFromOcr(payload)
    if (!text) return
    setDescription((current) => (current.trim() ? `${current.trim()}\n\n${text}` : text))
  }

  const handleSuggest = async () => {
    if (!description.trim()) {
      alert(t('projectAiDescriptionRequired'))
      return
    }
    setBusy(true)
    const res = await suggestProjectFramework(description)
    setBusy(false)
    if (!res.success || !res.draft) {
      alert(res.error || t('projectAiRequestFailed'))
      return
    }
    setDraft(res.draft)
    setSource(res.source || null)
  }

  const handleCommit = async () => {
    if (!draft) return
    if (!draft.title.trim()) {
      alert(t('projectTitleRequired'))
      return
    }
    if (!confirm(t('projectAiConfirmCommit'))) return
    setCommitting(true)
    const res = await commitProjectFramework(draft, { memberIds })
    setCommitting(false)
    if (!res.success || !res.id) {
      alert(res.error || t('submitFailed'))
      return
    }
    setDraft(null)
    setDescription('')
    setAttachments([])
    setOcrAttachmentIndex(0)
    setOpen(false)
    router.refresh()
    router.push(`/projects/${res.id}`)
  }

  const updateRoot = (index: number, patch: Partial<FrameworkDraft['sections'][number]>) => {
    if (!draft) return
    setDraft({
      ...draft,
      sections: draft.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    })
  }

  const removeRoot = (index: number) => {
    if (!draft) return
    setDraft({ ...draft, sections: draft.sections.filter((_, i) => i !== index) })
  }

  const addRoot = () => {
    if (!draft) return
    setDraft({
      ...draft,
      sections: [
        ...draft.sections,
        { title: t('projectAiNewSection'), description: null, tasks: [], children: [] },
      ],
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-[#007AFF]/40 bg-[#007AFF]/5 py-3 text-sm font-semibold text-[#007AFF]"
      >
        {t('projectAiOpen')}
      </button>
    )
  }

  return (
    <div className="space-y-3 rounded-3xl border border-[#007AFF]/20 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">{t('projectAiTitle')}</h2>
          <p className="mt-1 text-xs text-gray-500">{t('projectAiHint')}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setDraft(null)
            setSource(null)
          }}
          className="rounded-lg bg-[#F2F2F7] px-2 py-1 text-xs font-semibold text-gray-600"
        >
          {t('close')}
        </button>
      </div>

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={4}
        placeholder={t('projectAiDescriptionPlaceholder')}
        className="w-full rounded-xl border border-transparent bg-[#F2F2F7] px-4 py-3 text-sm outline-none focus:border-[#007AFF] focus:bg-white"
      />

      <div className="space-y-3 rounded-2xl border border-dashed border-gray-300 bg-[#F8FAFC] p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
            {t('attachment')}{' '}
            <span className="normal-case font-normal">({t('attachmentAcceptHint')})</span>
          </label>
          <OcrNoteButton
            locale={locale}
            attachments={attachments}
            context="project-framework"
            onResolved={appendOcrToDescription}
            disabled={busy || committing}
          />
        </div>
        <p className="text-[11px] text-gray-400">{t('projectAiUploadHint')}</p>
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={handleImageChange}
          className="w-full text-sm text-gray-600 file:mr-4 file:rounded-xl file:border-0 file:bg-[#007AFF]/10 file:px-5 file:py-2.5 file:text-sm file:font-semibold file:text-[#007AFF]"
        />
        {attachments.length > 0 ? (
          <div className="space-y-2">
            {attachments.length > 1 ? (
              <div className="text-xs font-medium text-[#007AFF]">
                {t('pdfPagesReady').replace('{{count}}', String(attachments.length))}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {attachments.map((item, index) => (
                <div
                  key={`${item.size}-${index}-${item.pageIndex || 0}`}
                  className={`relative rounded-lg border p-1 ${
                    index === ocrAttachmentIndex
                      ? 'border-[#007AFF] ring-2 ring-[#007AFF]/20'
                      : 'border-gray-200'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOcrAttachmentIndex(index)}
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
        ) : null}
      </div>

      <button
        type="button"
        disabled={busy || !description.trim()}
        onClick={handleSuggest}
        className="w-full rounded-xl bg-[#5856D6] py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? t('projectAiGenerating') : t('projectAiGenerate')}
      </button>

      {draft ? (
        <div className="space-y-3 rounded-2xl border border-gray-100 bg-[#FAFBFC] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {t('projectAiPreview')}
              {source ? (
                <span className="ml-2 rounded-md bg-white px-1.5 py-0.5 font-medium normal-case text-gray-400">
                  {source === 'mock' ? t('projectAiSourceMock') : t('projectAiSourceLlm')}
                </span>
              ) : null}
            </div>
            <div className="text-xs text-gray-400">
              {t('projectAiTaskCount').replace('{{count}}', String(countFrameworkTasks(draft)))}
            </div>
          </div>

          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            className="w-full rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none shadow-sm"
            placeholder={t('projectTitlePlaceholder')}
          />
          <textarea
            value={draft.note || ''}
            onChange={(e) => setDraft({ ...draft, note: e.target.value || null })}
            rows={2}
            placeholder={t('projectNotePlaceholder')}
            className="w-full rounded-xl bg-white px-3 py-2 text-sm text-gray-700 outline-none shadow-sm"
          />

          <div className="space-y-3">
            {draft.sections.map((root, ri) => (
              <div key={`root-${ri}`} className="rounded-xl bg-white p-3 shadow-sm">
                <div className="flex gap-2">
                  <input
                    value={root.title}
                    onChange={(e) => updateRoot(ri, { title: e.target.value })}
                    className="flex-1 rounded-lg bg-[#F2F2F7] px-3 py-2 text-sm font-semibold outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => removeRoot(ri)}
                    className="rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-600"
                  >
                    {t('delete')}
                  </button>
                </div>

                <div className="mt-2 space-y-1">
                  {root.tasks.map((task, ti) => (
                    <div key={`rt-${ri}-${ti}`} className="flex gap-2 pl-2">
                      <input
                        value={task.title}
                        onChange={(e) => {
                          const tasks = root.tasks.map((item, i) =>
                            i === ti ? { ...item, title: e.target.value } : item
                          )
                          updateRoot(ri, { tasks })
                        }}
                        className="flex-1 rounded-lg bg-[#F8FAFC] px-2 py-1.5 text-xs outline-none"
                      />
                      <button
                        type="button"
                        className="text-[11px] text-rose-500"
                        onClick={() =>
                          updateRoot(ri, {
                            tasks: root.tasks.filter((_, i) => i !== ti),
                          })
                        }
                      >
                        {t('delete')}
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="pl-2 text-xs font-semibold text-[#007AFF]"
                    onClick={() =>
                      updateRoot(ri, {
                        tasks: [...root.tasks, { title: t('projectAiNewTask'), content: null }],
                      })
                    }
                  >
                    {t('projectAiAddTask')}
                  </button>
                </div>

                <div className="mt-3 space-y-2 border-l-2 border-[#007AFF]/20 pl-3">
                  {root.children.map((child, ci) => (
                    <div key={`child-${ri}-${ci}`} className="rounded-lg bg-[#F8FAFC] p-2">
                      <div className="flex gap-2">
                        <input
                          value={child.title}
                          onChange={(e) => {
                            const children = root.children.map((item, i) =>
                              i === ci ? { ...item, title: e.target.value } : item
                            )
                            updateRoot(ri, { children })
                          }}
                          className="flex-1 rounded-lg bg-white px-2 py-1.5 text-xs font-medium outline-none"
                        />
                        <button
                          type="button"
                          className="text-[11px] text-rose-500"
                          onClick={() =>
                            updateRoot(ri, {
                              children: root.children.filter((_, i) => i !== ci),
                            })
                          }
                        >
                          {t('delete')}
                        </button>
                      </div>
                      <div className="mt-1 space-y-1">
                        {child.tasks.map((task, ti) => (
                          <div key={`ct-${ri}-${ci}-${ti}`} className="flex gap-2">
                            <input
                              value={task.title}
                              onChange={(e) => {
                                const children = root.children.map((item, i) => {
                                  if (i !== ci) return item
                                  return {
                                    ...item,
                                    tasks: item.tasks.map((tk, j) =>
                                      j === ti ? { ...tk, title: e.target.value } : tk
                                    ),
                                  }
                                })
                                updateRoot(ri, { children })
                              }}
                              className="flex-1 rounded-lg bg-white px-2 py-1 text-[11px] outline-none"
                            />
                            <button
                              type="button"
                              className="text-[11px] text-rose-500"
                              onClick={() => {
                                const children = root.children.map((item, i) =>
                                  i === ci
                                    ? {
                                        ...item,
                                        tasks: item.tasks.filter((_, j) => j !== ti),
                                      }
                                    : item
                                )
                                updateRoot(ri, { children })
                              }}
                            >
                              {t('delete')}
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="text-[11px] font-semibold text-[#007AFF]"
                          onClick={() => {
                            const children = root.children.map((item, i) =>
                              i === ci
                                ? {
                                    ...item,
                                    tasks: [
                                      ...item.tasks,
                                      { title: t('projectAiNewTask'), content: null },
                                    ],
                                  }
                                : item
                            )
                            updateRoot(ri, { children })
                          }}
                        >
                          {t('projectAiAddTask')}
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-xs font-semibold text-[#007AFF]"
                    onClick={() =>
                      updateRoot(ri, {
                        children: [
                          ...root.children,
                          {
                            title: t('projectAiNewChild'),
                            description: null,
                            tasks: [],
                          },
                        ],
                      })
                    }
                  >
                    {t('projectAiAddChild')}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addRoot}
            className="text-xs font-semibold text-[#007AFF]"
          >
            {t('projectAiAddSection')}
          </button>

          {draft.uncategorizedTasks.length > 0 ? (
            <div className="rounded-xl bg-white p-3 shadow-sm">
              <div className="mb-2 text-xs font-semibold text-gray-500">
                {t('projectSectionUncategorized')}
              </div>
              {draft.uncategorizedTasks.map((task, ti) => (
                <div key={`u-${ti}`} className="mb-1 flex gap-2">
                  <input
                    value={task.title}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        uncategorizedTasks: draft.uncategorizedTasks.map((item, i) =>
                          i === ti ? { ...item, title: e.target.value } : item
                        ),
                      })
                    }
                    className="flex-1 rounded-lg bg-[#F2F2F7] px-2 py-1.5 text-xs outline-none"
                  />
                  <button
                    type="button"
                    className="text-[11px] text-rose-500"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        uncategorizedTasks: draft.uncategorizedTasks.filter((_, i) => i !== ti),
                      })
                    }
                  >
                    {t('delete')}
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            disabled={committing || !draft.title.trim()}
            onClick={handleCommit}
            className="w-full rounded-xl bg-[#34C759] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {committing ? t('saving') : t('projectAiConfirmCreate')}
          </button>
          <p className="text-[11px] text-gray-400">{t('projectAiConfirmHint')}</p>
        </div>
      ) : null}
    </div>
  )
}
