import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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
            // Ensure proper cookie attributes for cross-browser compatibility
            const cookieOptions = {
              ...options,
              path: options?.path || '/',
              sameSite: options?.sameSite || 'lax',
              secure: process.env.NODE_ENV === 'production',
            }

            // Update request cookies (for subsequent middleware/handlers)
            request.cookies.set({
              name,
              value,
              ...cookieOptions,
            })

            // Create new response with updated cookies
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            })

            // Set cookie in response
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

            // Remove from request
            request.cookies.set({
              name,
              value: '',
              ...cookieOptions,
            })

            // Create new response
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            })

            // Remove from response
            response.cookies.set({
              name,
              value: '',
              ...cookieOptions,
            })
          },
        },
      }
    )

    // Refresh session if expired - required for Server Components
    // Use getUser() to validate the JWT and refresh if needed
    // Add timeout to prevent middleware from hanging
    // IMPORTANT: This is non-blocking - we proceed even if auth check fails
    const userPromise = supabase.auth.getUser()
    const timeoutPromise = new Promise<any>((_, reject) =>
      setTimeout(() => reject(new Error('Auth check timeout')), 15000)
    )

    // Don't await - let this run in background
    Promise.race([userPromise, timeoutPromise]).catch((err) => {
      // Log but don't block on auth errors in middleware
      console.warn('Middleware auth check failed:', err.message)
    })

    // Return immediately without waiting for auth check
    return response
  } catch (error) {
    // Log error but allow request to proceed
    console.error('Middleware error:', error)
    return response
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}