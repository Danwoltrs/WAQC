import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '@/lib/supabase'
import { ensureWaqcProfile } from '@/lib/auth/ensure-profile'
import { safeNextPath } from '@/lib/auth/route-access'
import { accessKindForUser, resolveLandingPath } from '@/lib/auth/access-kind'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = safeNextPath(requestUrl.searchParams.get('next'))
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

    const user = data.user
    console.log('Successfully created session for user:', user?.id)

    // Ensure user has a profile (handles edge cases where trigger didn't fire)
    // This is non-blocking - if it fails/times out, user can still proceed
    // The auth-provider will retry profile creation client-side
    if (user) {
      try {
        // Add 10s timeout to prevent hanging
        const profilePromise = ensureUserProfile(user)
        const timeoutPromise = new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Profile creation timeout')), 10000)
        )

        await Promise.race([profilePromise, timeoutPromise])
      } catch (profileError) {
        // Log but DON'T fail the auth callback - profile will be created client-side
        console.error('Profile creation in callback failed (non-fatal):', profileError)
      }
    }

    console.log('Setting', cookiesToSet.length, 'cookies on response')

    // Compute destination: when next is the default '/', route by access kind
    let destination = next
    if (next === '/' && user) {
      const supabaseAdmin = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )
      destination = resolveLandingPath(await accessKindForUser(supabaseAdmin as any, user.id))
    }

    // Create redirect response AFTER exchanging code
    const response = NextResponse.redirect(`${requestUrl.origin}${destination}`)

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

/**
 * Make sure the user has the WAQC profile the shared rule gives them
 * (src/lib/auth/new-profile.ts) — none for clients and strangers.
 */
async function ensureUserProfile(user: { id: string; email?: string; user_metadata?: any }) {
  try {
    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    await ensureWaqcProfile(supabaseAdmin as any, user)
  } catch (error) {
    console.error('Error in ensureUserProfile:', error)
  }
}
