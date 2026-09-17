import { NextResponse } from 'next/server'
import { runReminderEmailJob } from '@/lib/reminders/emailReminders'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function authorize(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const header = request.headers.get('authorization') || ''
  if (header === `Bearer ${secret}`) return true

  const url = new URL(request.url)
  if (url.searchParams.get('secret') === secret) return true

  return false
}

async function handle(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runReminderEmailJob()
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    console.error('[cron/reminders]', e)
    return NextResponse.json(
      { success: false, error: e?.message || 'Reminder job failed' },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
