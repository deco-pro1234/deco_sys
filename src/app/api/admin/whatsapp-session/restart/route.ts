import { NextResponse } from 'next/server'
import { getSession } from '@/app/actions/auth'
import {
  isWhatsAppWorkerConfigured,
  restartWhatsAppWorker,
} from '@/lib/whatsapp/workerClient'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST() {
  const session = await getSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isWhatsAppWorkerConfigured()) {
    return NextResponse.json({ error: 'Worker not configured' }, { status: 503 })
  }

  const result = await restartWhatsAppWorker()
  return NextResponse.json(result.json, { status: result.ok ? 200 : result.status })
}
