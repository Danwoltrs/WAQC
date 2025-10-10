import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') || '/'
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')

  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error, errorDescription)
    return NextResponse.redirect(
      `${requestUrl.origin}/?error=${encodeURIComponent(errorDescription || error)}`
    )
  }

  // If no code, redirect to home (login page)
  if (!code) {
    console.error('No code provided in OAuth callback')
    return NextResponse.redirect(`${requestUrl.origin}/`)
  }

  try {
    const cookieStore = await cookies()

    // Create response to set cookies properly
    const response = NextResponse.redirect(`${requestUrl.origin}${next}`)

    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            try {
              cookieStore.set({ name, value, ...options })
              response.cookies.set({ name, value, ...options })
            } catch (error) {
              // Handle cookie setting errors in production
              console.error('Error setting cookie:', name, error)
            }
          },
          remove(name: string, options: any) {
            try {
              cookieStore.set({ name, value: '', ...options })
              response.cookies.set({ name, value: '', ...options })
            } catch (error) {
              console.error('Error removing cookie:', name, error)
            }
          },
        },
      }
    )

    // Exchange code for session
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) {
      console.error('Error exchanging code for session:', exchangeError)
      return NextResponse.redirect(
        `${requestUrl.origin}/?error=${encodeURIComponent(exchangeError.message)}`
      )
    }

    if (!data.session) {
      console.error('No session returned after code exchange')
      return NextResponse.redirect(
        `${requestUrl.origin}/?error=No+session+created`
      )
    }

    console.log('Successfully created session for user:', data.user?.id)
    return response

  } catch (error) {
    console.error('Unexpected error in OAuth callback:', error)
    return NextResponse.redirect(
      `${requestUrl.origin}/?error=${encodeURIComponent('Authentication failed')}`
    )
  }
}