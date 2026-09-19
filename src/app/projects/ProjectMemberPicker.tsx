'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createTranslator, type Locale } from '@/lib/i18n'
import { searchProjectMemberCandidates } from '../actions/project'

export type ProjectMemberPick = {
  id: string
  roleName: string
  email?: string | null
  loginPhone?: string | null
  role: 'MANAGER' | 'MEMBER'
}

type Props = {
  locale: Locale
  /** When set, non-admin managers can search for this project. */
  projectId?: string
  selected: ProjectMemberPick[]
  onChange: (next: ProjectMemberPick[]) => void
  /** Show owner row (settings). */
  owner?: { id: string; roleName: string } | null
  /** Allow choosing Manager vs Member when adding / editing. */
  allowManagerRole?: boolean
  disabled?: boolean
}

function subtitleOf(u: { email?: string | null; loginPhone?: string | null }) {
  return [u.loginPhone, u.email].filter(Boolean).join(' · ')
}

export default function ProjectMemberPicker({
  locale,
  projectId,
  selected,
  onChange,
  owner,
  allowManagerRole = false,
  disabled,
}: Props) {
  const t = useMemo(() => createTranslator(locale), [locale])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<
    Array<{
      id: string
      roleName: string
      email: string
      loginPhone: string | null
    }>
  >([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')
  const reqId = useRef(0)

  const excludeKey = useMemo(() => {
    const ids = selected.map((m) => m.id)
    if (owner?.id) ids.push(owner.id)
    return ids.slice().sort().join(',')
  }, [selected, owner?.id])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 1) {
      setResults([])
      setSearched(false)
      setError('')
      setSearching(false)
      return
    }

    const id = ++reqId.current
    setSearching(true)
    setError('')
    let cancelled = false
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await searchProjectMemberCandidates({
            query: q,
            projectId,
            excludeIds: excludeKey ? excludeKey.split(',') : [],
            limit: 12,
          })
          if (cancelled || id !== reqId.current) return
          setSearching(false)
          setSearched(true)
          if (!res.success) {
            setError(res.error || t('submitFailed'))
            setResults([])
            return
          }
          setError('')
          setResults(res.users || [])
        } catch (e: unknown) {
          if (cancelled || id !== reqId.current) return
          setSearching(false)
          setSearched(true)
          setResults([])
          setError(e instanceof Error ? e.message : t('submitFailed'))
        }
      })()
    }, 280)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // `t` is memoized on locale — do not depend on an unstable translator identity.
  }, [query, projectId, excludeKey, t])

  const addUser = (user: {
    id: string
    roleName: string
    email?: string | null
    loginPhone?: string | null
  }, role: 'MANAGER' | 'MEMBER') => {
    if (selected.some((m) => m.id === user.id) || user.id === owner?.id) return
    onChange([
      ...selected,
      {
        id: user.id,
        roleName: user.roleName,
        email: user.email,
        loginPhone: user.loginPhone,
        role,
      },
    ])
    setQuery('')
    setResults([])
    setSearched(false)
  }

  const removeUser = (id: string) => {
    onChange(selected.filter((m) => m.id !== id))
  }

  const setRole = (id: string, role: 'MANAGER' | 'MEMBER') => {
    onChange(selected.map((m) => (m.id === id ? { ...m, role } : m)))
  }

  return (
    <div className="space-y-2">
      {owner ? (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-[#F2F2F7] px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-gray-900">{owner.roleName}</div>
            <div className="text-[11px] text-gray-500">{t('projectRoleOwner')}</div>
          </div>
          <span className="shrink-0 rounded-lg bg-indigo-100 px-2 py-1 text-[11px] font-semibold text-indigo-700">
            {t('projectRoleOwner')}
          </span>
        </div>
      ) : null}

      {selected.length === 0 ? (
        <div className="rounded-xl bg-[#F8FAFC] px-3 py-2 text-xs text-gray-400">
          {t('projectMemberSearchEmptySelected')}
        </div>
      ) : (
        selected.map((m) => (
          <div key={m.id} className="rounded-xl bg-[#EEF5FF] px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-gray-900">{m.roleName}</div>
                <div className="truncate text-[11px] text-gray-500">
                  {allowManagerRole
                    ? m.role === 'MANAGER'
                      ? t('projectRoleManager')
                      : t('projectRoleMember')
                    : subtitleOf(m) || t('projectRoleMember')}
                </div>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeUser(m.id)}
                className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-600 disabled:opacity-50"
              >
                {t('projectMemberRemove')}
              </button>
            </div>
            {allowManagerRole ? (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setRole(m.id, 'MEMBER')}
                  className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold ${
                    m.role === 'MEMBER'
                      ? 'bg-white text-[#007AFF] shadow-sm'
                      : 'bg-white/60 text-gray-500'
                  }`}
                >
                  {t('projectRoleMember')}
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setRole(m.id, 'MANAGER')}
                  className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold ${
                    m.role === 'MANAGER'
                      ? 'bg-white text-[#007AFF] shadow-sm'
                      : 'bg-white/60 text-gray-500'
                  }`}
                >
                  {t('projectRoleManager')}
                </button>
              </div>
            ) : null}
          </div>
        ))
      )}

      <div className="rounded-2xl border border-dashed border-gray-300 bg-[#F8FAFC] p-3">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
          {t('projectMemberSearchLabel')}
        </label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled}
          placeholder={t('projectMemberSearchPlaceholder')}
          className="w-full rounded-xl bg-white px-3 py-2.5 text-sm outline-none shadow-sm disabled:opacity-50"
          autoComplete="off"
        />
        <p className="mt-1.5 text-[11px] text-gray-400">{t('projectMemberSearchHint')}</p>

        {searching ? (
          <div className="mt-2 text-xs text-gray-400">{t('projectMemberSearching')}</div>
        ) : null}
        {error ? <div className="mt-2 text-xs text-rose-600">{error}</div> : null}

        {!searching && searched && results.length === 0 && !error ? (
          <div className="mt-2 text-xs text-gray-400">{t('projectMemberSearchNoResults')}</div>
        ) : null}

        {results.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            {results.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 shadow-sm"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-900">{u.roleName}</div>
                  <div className="truncate text-[11px] text-gray-500">
                    {subtitleOf(u) || '—'}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => addUser(u, 'MEMBER')}
                    className="rounded-lg bg-[#007AFF]/10 px-2.5 py-1 text-[11px] font-semibold text-[#007AFF] disabled:opacity-50"
                  >
                    {t('projectRoleMember')}
                  </button>
                  {allowManagerRole ? (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => addUser(u, 'MANAGER')}
                      className="rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 disabled:opacity-50"
                    >
                      {t('projectRoleManager')}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
