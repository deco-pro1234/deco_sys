import { NextResponse } from 'next/server'
import { getWhatsAppConfig, isWhatsAppOutboundReady } from '@/lib/whatsapp/config'
import { verifyWhatsAppSignature } from '@/lib/whatsapp/signature'
import { sendWhatsAppText } from '@/lib/whatsapp/client'
import { resolveWhatsAppActor } from '@/lib/whatsapp/identity'
import { handleWhatsAppCommand } from '@/lib/whatsapp/commands'
import {
  extractInboundTextMessages,
  type WhatsAppWebhookPayload,
} from '@/lib/whatsapp/webhookPayload'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Meta Webhook 驗證（GET）。
 * Callback URL：https://<你的網域>/api/webhooks/whatsapp
 * Verify Token：與環境變數 WHATSAPP_VERIFY_TOKEN 相同
 */
export async function GET(request: Request) {
  const config = getWhatsAppConfig()
  const url = new URL(request.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  if (!config?.verifyToken) {
    return NextResponse.json(
      { error: 'WHATSAPP_VERIFY_TOKEN not configured' },
      { status: 503 },
    )
  }

  if (mode === 'subscribe' && token === config.verifyToken && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}

/**
 * 接收 WhatsApp 訊息與狀態回呼（POST）。
 * 必須快速回 200；業務處理同步完成（指令為短操作）。若日後變慢可改 queue。
 */
export async function POST(request: Request) {
  const config = getWhatsAppConfig()
  const rawBody = await request.text()

  // 簽名驗證（有設定 APP_SECRET 時強制）
  const signature = request.headers.get('x-hub-signature-256')
  if (!verifyWhatsAppSignature(rawBody, signature, config?.appSecret || '')) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: WhatsAppWebhookPayload
  try {
    payload = JSON.parse(rawBody) as WhatsAppWebhookPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // 非 WhatsApp 物件直接忽略
  if (payload.object && payload.object !== 'whatsapp_business_account') {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const inbound = extractInboundTextMessages(payload)
  if (inbound.length === 0) {
    // 狀態更新等：直接 ACK
    return NextResponse.json({ ok: true })
  }

  if (!isWhatsAppOutboundReady(config)) {
    console.warn('[whatsapp] inbound received but outbound not configured')
    return NextResponse.json({ ok: true, warning: 'outbound_not_configured' })
  }

  for (const msg of inbound) {
    try {
      const { actor, reason } = await resolveWhatsAppActor(msg.from)
      let reply: string
      if (!actor) {
        reply = `⛔ ${reason || '未授權'}`
      } else {
        reply = await handleWhatsAppCommand(actor, msg.text)
      }
      const sent = await sendWhatsAppText(msg.from, reply)
      if (!sent.ok) {
        console.error('[whatsapp] send failed', sent.error, msg.messageId)
      }
    } catch (e: unknown) {
      console.error('[whatsapp] handler error', e)
      try {
        await sendWhatsAppText(
          msg.from,
          '系統處理時發生錯誤，請稍後再試或登入網頁操作。',
        )
      } catch {
        /* ignore */
      }
    }
  }

  return NextResponse.json({ ok: true, processed: inbound.length })
}
