import { createHmac, timingSafeEqual } from 'crypto'

/**
 * 驗證 Meta Webhook 的 X-Hub-Signature-256。
 * 若未設定 APP_SECRET，開發模式下跳過（生產務必設定）。
 */
export function verifyWhatsAppSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!appSecret) {
    // 無 secret 時僅在非 production 允許（方便本地用 ngrok 測驗證）
    return process.env.NODE_ENV !== 'production'
  }
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false

  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  const provided = signatureHeader.slice('sha256='.length)
  try {
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(provided, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
