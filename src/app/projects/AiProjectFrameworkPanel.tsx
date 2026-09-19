'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createTranslator, type Locale } from '@/lib/i18n'
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

export default function AiProjectFrameworkPanel({ locale, memberIds }: Props) {
  const t = createTranslator(locale)
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [draft, setDraft] = useState<FrameworkDraft | null>(null)
  const [source, setSource] = useState<'llm' | 'mock' | null>(null)
  const [busy, setBusy] = useState(false)
  const [committing, setCommitting] = useState(false)

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