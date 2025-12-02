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

    // Collect cookies to set on response
    const cookiesToSet: Array<{ name: string; value: string; options: any }> = []

    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            // Collect cookies to set later on the response
            cookiesToSet.push({ name, value, options })
          },
          remove(name: string, options: any) {
            // Collect cookie removal
            cookiesToSet.push({ name, value: '', options: { ...options, maxAge: 0 } })
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
    console.log('Setting', cookiesToSet.length, 'cookies on response')

    // Create redirect response AFTER exchanging code
    const response = NextResponse.redirect(`${requestUrl.origin}${next}`)

    // Set all collected cookies on the response
    for (const cookie of cookiesToSet) {
      response.cookies.set(cookie.name, cookie.value, cookie.options)
    }

    return response

  } catch (error) {
    console.error('Unexpected error in OAuth callback:', error)
    return NextResponse.redirect(
      `${requestUrl.origin}/?error=${encodeURIComponent('Authentication failed')}`
    )
  }
}