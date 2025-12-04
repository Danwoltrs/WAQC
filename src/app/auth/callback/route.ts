import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
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

/**
 * Ensures a user has a profile. Creates one if missing.
 * Uses service role to bypass RLS.
 */
async function ensureUserProfile(user: { id: string; email?: string; user_metadata?: any }) {
  try {
    // Create admin client to bypass RLS
    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Check if profile exists
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single()

    if (existingProfile) {
      console.log('Profile already exists for user:', user.id)
      return
    }

    console.log('No profile found, creating one for user:', user.id)

    // Check for pending invitation (cast to any since DB has columns not in types)
    const { data: invitationData } = await supabaseAdmin
      .from('user_invitations')
      .select('*')
      .ilike('email', user.email || '')
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // Cast to any to access columns that exist in DB but not in generated types
    const invitation = invitationData as any

    // Get default laboratory
    const { data: defaultLab } = await supabaseAdmin
      .from('laboratories')
      .select('id')
      .eq('code', 'SANTOS_HQ')
      .single()

    const isWolthersEmail = user.email?.endsWith('@wolthers.com') || false
    const isGlobalAdmin = ['daniel@wolthers.com', 'anderson@wolthers.com', 'edgar@wolthers.com'].includes(user.email || '')

    if (invitation) {
      // Create profile from invitation data
      console.log('Creating profile from invitation:', invitation.id)

      const { error: insertError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: user.id,
          email: user.email || '',
          first_name: invitation.first_name || '',
          last_name: invitation.last_name || '',
          full_name: `${invitation.first_name || ''} ${invitation.last_name || ''}`.trim() || user.email?.split('@')[0] || 'User',
          qc_role: invitation.qc_role || 'lab_personnel',
          qc_enabled: invitation.qc_enabled ?? true,
          is_cupper: invitation.is_cupper ?? false,
          is_q_grader: invitation.is_q_grader ?? false,
          is_global_admin: invitation.qc_role === 'global_admin' || invitation.qc_role === 'global_quality_admin',
          laboratory_id: invitation.laboratory_id || defaultLab?.id || null,
        }, {
          onConflict: 'id',
          ignoreDuplicates: true // Don't error on conflict, just skip
        })

      if (insertError && insertError.code !== '23505') {
        // Only log non-duplicate errors
        console.error('Error creating profile from invitation:', insertError)
        return
      }

      // Mark invitation as accepted
      await supabaseAdmin
        .from('user_invitations')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', invitation.id)

      console.log('Profile created/updated and invitation accepted')
    } else {
      // Create basic profile from user metadata
      console.log('Creating basic profile from user metadata')

      const fullName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User'
      const nameParts = fullName.split(' ')
      const firstName = nameParts[0] || ''
      const lastName = nameParts.slice(1).join(' ') || ''

      const { error: insertError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: user.id,
          email: user.email || '',
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
          qc_role: isGlobalAdmin ? 'global_admin' : 'lab_personnel',
          qc_enabled: isWolthersEmail,
          is_global_admin: isGlobalAdmin,
          laboratory_id: isWolthersEmail ? (defaultLab?.id || null) : null,
        }, {
          onConflict: 'id',
          ignoreDuplicates: true // Don't error on conflict, just skip
        })

      if (insertError && insertError.code !== '23505') {
        // Only log non-duplicate errors
        console.error('Error creating basic profile:', insertError)
      } else {
        console.log('Basic profile created/exists')
      }
    }
  } catch (error) {
    console.error('Error in ensureUserProfile:', error)
  }
}