import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/', '/auth/callback', '/auth/accept-invite']

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.includes(pathname) || pathname.startsWith('/api/') || pathname.startsWith('/certificate/')
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

            request.cookies.set({
              name,
              value,
              ...cookieOptions,
            })

            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            })

            response.cookies.set({
              name,
              value,
              ...cookieOptions,
            })
          },
          remove(name: string, options: any) {
            const cookieOptions = {
              ...options,
              path: options?.path || '/',
            }

            request.cookies.set({
              name,
              value: '',
              ...cookieOptions,
            })

            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            })

            response.cookies.set({
              name,
              value: '',
              ...cookieOptions,
            })
          },
        },
      }
    )

    const pathname = request.nextUrl.pathname

    // Skip auth validation for auth callback routes - their cookies must not be touched
    // by getUser() which can clear/modify the PKCE code verifier needed for code exchange
    const isAuthRoute = pathname === '/auth/callback' || pathname === '/auth/accept-invite'

    if (!isAuthRoute) {
      // IMPORTANT: Actually await getUser() to refresh the session cookie.
      // This is what keeps sessions alive between requests.
      const { data: { user } } = await supabase.auth.getUser()

      // Redirect unauthenticated users away from protected routes
      if (!user && !isPublicRoute(pathname)) {
        const redirectUrl = new URL('/', request.url)
        return NextResponse.redirect(redirectUrl)
      }
    }

    return response
  } catch (error) {
    // On error, allow public routes but redirect protected ones to login
    if (!isPublicRoute(request.nextUrl.pathname)) {
      const redirectUrl = new URL('/', request.url)
      return NextResponse.redirect(redirectUrl)
    }
    return response
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
