/**
 * Server-side client for the whatsapp-web.js worker service.
 */

export type WhatsAppWorkerStatus = {
  status: 'disconnected' | 'initializing' | 'qr' | 'ready' | string
  qrDataUrl?: string | null
  phone?: string | null
  pushName?: string | null
  lastError?: string | null
  updatedAt?: string | null
  ok?: boolean
  error?: string
}

function workerConfig() {
  const baseUrl = (process.env.WHATSAPP_WORKER_URL || '').replace(/\/$/, '')
  const secret = (process.env.WHATSAPP_WORKER_SECRET || '').trim()
  return { baseUrl, secret }
}

export function isWhatsAppWorkerConfigured() {
  const { baseUrl, secret } = workerConfig()
  return Boolean(baseUrl && secret)
}

async function workerFetch(path: string, init?: RequestInit) {
  const { baseUrl, secret } = workerConfig()
  if (!baseUrl) {
    return {
      ok: false as const,
      status: 503,
      json: { error: 'WHATSAPP_WORKER_URL not configured' } as WhatsAppWorkerStatus,
    }
  }
  if (!secret) {
    return {
      ok: false as const,
      status: 503,
      json: { error: 'WHATSAPP_WORKER_SECRET not configured' } as WhatsAppWorkerStatus,
    }
  }

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: 'application/json',
        ...(init?.headers || {}),
      },
      cache: 'no-store',
    })
    const json = (await res.json().catch(() => ({}))) as WhatsAppWorkerStatus
    return { ok: res.ok, status: res.status, json }
  } catch (e: unknown) {
    return {
      ok: false as const,
      status: 502,
      json: {
        error: e instanceof Error ? e.message : 'Worker unreachable',
      } as WhatsAppWorkerStatus,
    }
  }
}

export async function getWhatsAppWorkerStatus() {
  return workerFetch('/status')
}

export async function disconnectWhatsAppWorker() {
  return workerFetch('/disconnect', { method: 'POST' })
}

export async function restartWhatsAppWorker() {
  return workerFetch('/restart', { method: 'POST' })
}

/** Open a streaming fetch to the worker SSE endpoint (for BFF proxy). */
export async function openWhatsAppWorkerEvents() {
  const { baseUrl, secret } = workerConfig()
  if (!baseUrl || !secret) {
    throw new Error('WhatsApp worker not configured')
  }
  return fetch(`${baseUrl}/events`, {
    headers: {
      Authorization: `Bearer ${secret}`,
      Accept: 'text/event-stream',
    },
    cache: 'no-store',
  })
}
