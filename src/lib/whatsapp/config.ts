/**
 * WhatsApp Cloud API 環境變數讀取。
 * 未完整設定時 webhook 仍可回 200（避免 Meta 重試風暴），但入站指令會回覆「未啟用」。
 */

export type WhatsAppConfig = {
  verifyToken: string
  accessToken: string
  phoneNumberId: string
  appSecret: string
  apiVersion: string
  /** 若設定，僅允許清單內電話（純數字 E.164） */
  allowedPhones: Set<string> | null
}

function parsePhoneList(raw: string | undefined): Set<string> | null {
  if (!raw || !raw.trim()) return null
  const set = new Set(
    raw
      .split(/[,;\s]+/)
      .map((s) => s.replace(/\D/g, ''))
      .filter(Boolean),
  )
  return set.size > 0 ? set : null
}

export function getWhatsAppConfig(): WhatsAppConfig | null {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim() || ''
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim() || ''
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || ''
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim() || ''
  const apiVersion = process.env.WHATSAPP_API_VERSION?.trim() || 'v21.0'

  // 驗證端點至少需要 verifyToken；收訊+回覆需要其餘欄位
  if (!verifyToken) return null

  return {
    verifyToken,
    accessToken,
    phoneNumberId,
    appSecret,
    apiVersion,
    allowedPhones: parsePhoneList(process.env.WHATSAPP_ALLOWED_PHONES),
  }
}

export function isWhatsAppOutboundReady(config: WhatsAppConfig | null): boolean {
  return Boolean(config?.accessToken && config?.phoneNumberId)
}

export function graphMessagesUrl(config: WhatsAppConfig) {
  return `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`
}
