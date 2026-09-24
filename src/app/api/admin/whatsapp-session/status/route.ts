import { NextResponse } from 'next/server'
import { getSession } from '@/app/actions/auth'
import {
  getWhatsAppWorkerStatus,
  isWhatsAppWorkerConfigured,
} from '@/lib/whatsapp/workerClient'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const session = await getSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isWhatsAppWorkerConfigured()) {
    return NextResponse.json(
      {
        status: 'disconnected',
        configured: false,
        error:
          '尚未設定 WHATSAPP_WORKER_URL / WHATSAPP_WORKER_SECRET（請先部署 whatsapp-worker 服務）',
      },
      { status: 200 },
    )
  }

  const result = await getWhatsAppWorkerStatus()
  return NextResponse.json(
    { configured: true, ...result.json },
    { status: result.ok ? 200 : result.status },
  )
}
