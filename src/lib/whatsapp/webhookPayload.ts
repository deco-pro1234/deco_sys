/**
 * Meta WhatsApp Cloud API webhook 負載（精簡型別，只取我們需要的欄位）。
 */

export type WhatsAppWebhookPayload = {
  object?: string
  entry?: Array<{
    id?: string
    changes?: Array<{
      field?: string
      value?: {
        messaging_product?: string
        metadata?: { display_phone_number?: string; phone_number_id?: string }
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>
        messages?: Array<{
          from?: string
          id?: string
          timestamp?: string
          type?: string
          text?: { body?: string }
          button?: { text?: string; payload?: string }
          interactive?: {
            type?: string
            button_reply?: { id?: string; title?: string }
            list_reply?: { id?: string; title?: string }
          }
        }>
        statuses?: unknown[]
      }
    }>
  }>
}

export type InboundTextMessage = {
  from: string
  messageId: string
  text: string
}

export function extractInboundTextMessages(payload: WhatsAppWebhookPayload): InboundTextMessage[] {
  const out: InboundTextMessage[] = []
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field && change.field !== 'messages') continue
      const messages = change.value?.messages || []
      for (const msg of messages) {
        if (!msg.from || !msg.id) continue
        let text = ''
        if (msg.type === 'text' && msg.text?.body) text = msg.text.body
        else if (msg.button?.text) text = msg.button.text
        else if (msg.interactive?.button_reply?.title) text = msg.interactive.button_reply.title
        else if (msg.interactive?.list_reply?.title) text = msg.interactive.list_reply.title
        else continue
        out.push({ from: msg.from, messageId: msg.id, text })
      }
    }
  }
  return out
}
