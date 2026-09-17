import { getWhatsAppConfig, graphMessagesUrl, isWhatsAppOutboundReady } from './config'

export type SendTextResult = {
  ok: boolean
  messageId?: string
  error?: string
}

/**
 * 透過 WhatsApp Cloud API 發送純文字回覆。
 * to：收件人電話（E.164 純數字，不含 +）。
 */
export async function sendWhatsAppText(to: string, body: string): Promise<SendTextResult> {
  const config = getWhatsAppConfig()
  if (!isWhatsAppOutboundReady(config) || !config) {
    return { ok: false, error: 'WhatsApp outbound not configured' }
  }

  const toDigits = to.replace(/\D/g, '')
  if (!toDigits) return { ok: false, error: 'Invalid recipient phone' }

  // WhatsApp 單則文字建議 < 4096 字元
  const text = body.length > 4000 ? `${body.slice(0, 3990)}…` : body

  try {
    const res = await fetch(graphMessagesUrl(config), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toDigits,
        type: 'text',
        text: { preview_url: false, body: text },
      }),
    })

    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id?: string }[]
      error?: { message?: string }
    }

    if (!res.ok) {
      return {
        ok: false,
        error: json?.error?.message || `Graph API HTTP ${res.status}`,
      }
    }

    return { ok: true, messageId: json.messages?.[0]?.id }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to send WhatsApp message' }
  }
}
