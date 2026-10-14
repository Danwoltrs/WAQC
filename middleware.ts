import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { fetchAccessKind } from '@/lib/auth/access-kind'
import { decideRouteAccess, isPublicRoute, type RouteDecision } from '@/lib/auth/route-access'

// /embed/* pages carry no session of their own — they authenticate via a
// sys.wolthers.com access token handed over by postMessage, and their API
// (/api/embed/*) enforces it. Redirecting them to '/' breaks the iframe:
// '/' is served with X-Frame-Options: SAMEORIGIN, so sys sees an eternal
// "Loading..." whenever the viewer lacks a qc.wolthers.com cookie.
// (isPublicRoute keeps /embed/* public for exactly that reason.)

/** Carry refreshed session cookies over to a redirect or error response. */
function withCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) to.cookies.set(cookie)
  return to
}

function applyDecision(decision: RouteDecision, request: NextRequest, response: NextResponse): NextResponse {
  if (decision.action === 'allow') return response
  if (decision.action === 'redirect') {
    return withCookies(response, NextResponse.redirect(new URL(decision.to, request.url)))
  }
  return withCookies(response, NextResponse.json({ error: 'Forbidden' }, { status: decision.status }))
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            const cookieOptions = {
              ...options,
              path: options?.path || '/',
              sameSite: options?.sameSite || 'lax',
              secure: process.env.NODE_ENV === 'production',
            }
            request.cookies.set({ name, value, ...cookieOptions })
            response = NextResponse.next({ request: { headers: request.headers } })
            response.cookies.set({ name, value, ...cookieOptions })
          },
          remove(name: string, options: any) {
            const cookieOptions = { ...options, path: options?.path || '/' }
            request.cookies.set({ name, value: '', ...cookieOptions })
            response = NextResponse.next({ request: { headers: request.headers } })
            response.cookies.set({ name, value: '', ...cookieOptions })
          },
        },
      }
    )

    const pathname = request.nextUrl.pathname

    // Auth callback routes: getUser() can clear the PKCE code verifier the
    // code exchange needs, so these are left untouched.
    if (pathname === '/auth/callback' || pathname === '/auth/accept-invite') return response

    // IMPORTANT: awaiting getUser() refreshes the session cookie.
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return applyDecision(decideRouteAccess(pathname, null), request, response)

    let kind
    try {
      kind = await fetchAccessKind(supabase as any)
    } catch (error) {
      console.error('[middleware] access check failed:', error)
      // Fail closed for data, open for page shells (their data comes from
      // the API, which is closed).
      if (pathname.startsWith('/api/')) {
        return withCookies(response, NextResponse.json({ error: 'Access check failed, please retry' }, { status: 503 }))
      }
      return response
    }

    return applyDecision(decideRouteAccess(pathname, kind), request, response)
  } catch (error) {
    if (!isPublicRoute(request.nextUrl.pathname)) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return response
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
