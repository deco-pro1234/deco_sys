import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
import { ACCOUNT_KIND_PROJECT_TEMP } from '@/lib/access'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'finance-18-super-secret-key-change-in-prod'
)

function isAllowedProjectTempPath(pathname: string) {
  if (pathname === '/login') return true
  if (pathname.startsWith('/projects')) return true
  if (pathname.startsWith('/api/')) return true
  return false
}

export async function proxy(request: NextRequest) {
  const token = request.cookies.get('session_token')?.value
  if (!token) return NextResponse.next()

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    if (payload.accountKind === ACCOUNT_KIND_PROJECT_TEMP) {
      const { pathname } = request.nextUrl
      if (!isAllowedProjectTempPath(pathname)) {
        const url = request.nextUrl.clone()
        url.pathname = '/projects'
        url.search = ''
        return NextResponse.redirect(url)
      }
    }
  } catch {
    // Invalid token: let route handlers / getSession deal with it.
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
