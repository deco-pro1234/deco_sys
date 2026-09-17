import { NextResponse } from 'next/server'
import { initAdmin } from '@/app/actions/initAdmin'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')

  if (process.env.INIT_SECRET && secret !== process.env.INIT_SECRET) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const result = await initAdmin()
  return NextResponse.json(result)
}