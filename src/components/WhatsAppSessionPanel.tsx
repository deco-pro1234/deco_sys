'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createTranslator, type Locale } from '@/lib/i18n'

type SessionState = {
  status: string
  qrDataUrl?: string | null
  phone?: string | null
  pushName?: string | null
  lastError?: string | null
  updatedAt?: string | null
  configured?: boolean
  error?: string
}

function statusLabel(status: string, t: (key: any) => string) {
  switch (status) {
    case 'ready':
      return t('whatsappSessionReady')
    case 'qr':
      return t('whatsappSessionQr')
    case 'initializing':
      return t('whatsappSessionLoading')
    case 'disconnected':
    default:
      return t('whatsappSessionDisconnected')
  }
}

function statusTone(status: string) {
  if (status === 'ready') return 'bg-emerald-50 text-emerald-800 border-emerald-200'
  if (status === 'qr') return 'bg-amber-50 text-amber-900 border-amber-200'
  if (status === 'initializing') return 'bg-sky-50 text-sky-800 border-sky-200'
  return 'bg-gray-50 text-gray-700 border-gray-200'
}

export default function WhatsAppSessionPanel({ locale }: { locale: Locale }) {
  const t = createTranslator(locale)
  const [state, setState] = useState<SessionState>({ status: 'disconnected' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const esRef = useRef<EventSource | null>(null)

  const applyPayload = useCallback((payload: SessionState) => {
    setState((prev) => ({ ...prev, ...payload }))
  }, [])

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/whatsapp-session/status', { cache: 'no-store' })
      const json = (await res.json()) as SessionState
      applyPayload(json)
    } catch (e: unknown) {
      applyPayload({
        status: 'disconnected',
        error: e instanceof Error ? e.message : 'status failed',
      })
    }
  }, [applyPayload])

  useEffect(() => {
    void refresh()

    const es = new EventSource('/api/admin/whatsapp-session/events')
    esRef.current = es

    const onStatus = (ev: MessageEvent) => {
      try {
        applyPayload(JSON.parse(ev.data) as SessionState)
      } catch {
        /* ignore */
      }
    }
    const onQr = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as { qrDataUrl?: string }
        applyPayload({ status: 'qr', qrDataUrl: data.qrDataUrl || null })
      } catch {
        /* ignore */
      }
    }
    const onReady = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as { phone?: string; pushName?: string }
        applyPayload({
          status: 'ready',
          qrDataUrl: null,
          phone: data.phone || null,
          pushName: data.pushName || null,
          lastError: null,
        })
      } catch {
        /* ignore */
      }
    }

    es.addEventListener('status', onStatus)
    es.addEventListener('qr', onQr)
    es.addEventListener('ready', onReady)
    es.onerror = () => {
      // Browser will retry; also poll as fallback.
      void refresh()
    }

    const poll = window.setInterval(() => void refresh(), 20000)

    return () => {
      window.clearInterval(poll)
      es.removeEventListener('status', onStatus)
      es.removeEventListener('qr', onQr)
      es.removeEventListener('ready', onReady)
      es.close()
      esRef.current = null
    }
  }, [applyPayload, refresh])

  const disconnect = async () => {
    if (!confirm(t('whatsappSessionDisconnectConfirm'))) return
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch('/api/admin/whatsapp-session/disconnect', { method: 'POST' })
      const json = (await res.json()) as SessionState
      applyPayload(json)
      setMessage(t('whatsappSessionDisconnectedToast'))
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : t('whatsappSessionActionFail'))
    } finally {
      setBusy(false)
    }
  }

  const restart = async () => {
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch('/api/admin/whatsapp-session/restart', { method: 'POST' })
      const json = (await res.json()) as SessionState
      applyPayload(json)
      setMessage(t('whatsappSessionRestartToast'))
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : t('whatsappSessionActionFail'))
    } finally {
      setBusy(false)
    }
  }

  const configured = state.configured !== false || Boolean(state.qrDataUrl || state.phone)
  const showQr = state.status === 'qr' && state.qrDataUrl
  const ready = state.status === 'ready'

  return (
    <div className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">{t('whatsappSessionTitle')}</h2>
          <p className="mt-1 text-sm text-gray-500">{t('whatsappSessionHint')}</p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(state.status)}`}
        >
          {statusLabel(state.status, t)}
        </span>
      </div>

      {state.configured === false ? (
        <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {state.error || t('whatsappSessionNotConfigured')}
          <div className="mt-2 text-xs text-amber-800/80">{t('whatsappSessionDeployHint')}</div>
        </div>
      ) : null}

      {state.lastError && state.status !== 'ready' ? (
        <div className="rounded-2xl bg-rose-50 px-4 py-3 text-xs text-rose-700">
          {state.lastError}
        </div>
      ) : null}

      {showQr ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-[#F2F2F7] px-4 py-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={state.qrDataUrl || ''}
            alt="WhatsApp QR"
            className="h-56 w-56 rounded-xl bg-white p-2 shadow-sm"
          />
          <p className="max-w-sm text-center text-xs text-gray-500">
            {t('whatsappSessionScanHint')}
          </p>
        </div>
      ) : null}

      {state.status === 'initializing' && !showQr ? (
        <div className="rounded-2xl bg-sky-50 px-4 py-6 text-center text-sm text-sky-800">
          {t('whatsappSessionLoadingHint')}
        </div>
      ) : null}

      {ready ? (
        <div className="space-y-3 rounded-2xl bg-emerald-50 px-4 py-4">
          <div className="text-sm font-semibold text-emerald-900">
            ✅ {t('whatsappSessionReady')}
          </div>
          <div className="text-sm text-emerald-900/90">
            {t('whatsappSessionLoggedInAs')}:{' '}
            <span className="font-mono font-semibold">
              {state.phone ? `+${state.phone}` : '—'}
            </span>
            {state.pushName ? (
              <span className="text-emerald-800/70">（{state.pushName}）</span>
            ) : null}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void disconnect()}
            className="w-full rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t('whatsappSessionDisconnect')}
          </button>
        </div>
      ) : null}

      {!ready && configured !== false ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void refresh()}
            className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-gray-700 shadow-sm disabled:opacity-50"
          >
            {t('whatsappSessionRefresh')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void restart()}
            className="rounded-xl bg-[#007AFF] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {t('whatsappSessionRestart')}
          </button>
        </div>
      ) : null}

      {message ? <p className="text-xs text-gray-500">{message}</p> : null}
    </div>
  )
}
