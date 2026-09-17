import { sendWhatsAppText } from './client'
import { getWhatsAppConfig, isWhatsAppOutboundReady } from './config'
import { normalizePhoneE164 } from './phone'

/**
 * 到期提醒的 WhatsApp 收件人（純數字 E.164）。
 * 環境變數 WHATSAPP_REMINDER_PHONES="85291111111,85292222222"
 * 未設定則不發 WhatsApp 提醒。
 */
export function getWhatsAppReminderRecipients(): string[] {
  const raw = process.env.WHATSAPP_REMINDER_PHONES || ''
  return [
    ...new Set(
      raw
        .split(/[,;\s]+/)
        .map((s) => normalizePhoneE164(s))
        .filter((p) => p.length >= 8),
    ),
  ]
}

export function isWhatsAppReminderConfigured() {
  return (
    isWhatsAppOutboundReady(getWhatsAppConfig()) && getWhatsAppReminderRecipients().length > 0
  )
}

export async function sendWhatsAppReminder(input: {
  subject: string
  body: string
}): Promise<{ ok: boolean; sent: number; failed: number; errors: string[] }> {
  const recipients = getWhatsAppReminderRecipients()
  if (!isWhatsAppReminderConfigured() || recipients.length === 0) {
    return { ok: false, sent: 0, failed: 0, errors: ['WhatsApp reminders not configured'] }
  }

  const text = `🔔 ${input.subject}\n\n${input.body}`
  let sent = 0
  let failed = 0
  const errors: string[] = []

  for (const phone of recipients) {
    const result = await sendWhatsAppText(phone, text)
    if (result.ok) sent += 1
    else {
      failed += 1
      errors.push(`${phone}: ${result.error || 'send failed'}`)
    }
  }

  return { ok: failed === 0, sent, failed, errors }
}
