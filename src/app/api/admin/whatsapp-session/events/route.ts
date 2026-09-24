import { getSession } from '@/app/actions/auth'
import {
  isWhatsAppWorkerConfigured,
  openWhatsAppWorkerEvents,
} from '@/lib/whatsapp/workerClient'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const session = await getSession()
  if (!session?.isAdmin) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!isWhatsAppWorkerConfigured()) {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `event: status\ndata: ${JSON.stringify({
              status: 'disconnected',
              configured: false,
              error: 'Worker not configured',
            })}\n\n`,
          ),
        )
        controller.close()
      },
    })
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  }

  try {
    const upstream = await openWhatsAppWorkerEvents()
    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '')
      return new Response(
        JSON.stringify({ error: text || `Worker SSE HTTP ${upstream.status}` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      )
    }

    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  } catch (e: unknown) {
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : 'Failed to open worker SSE',
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
