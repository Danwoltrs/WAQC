import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { idToken, account } = await request.json()

    if (!idToken || !account) {
      return NextResponse.json(
        { error: 'Missing authentication data' },
        { status: 400 }
      )
    }

    const cookieStore = await cookies()

    // Create Supabase client
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
            } catch (error) {
              console.error('Error setting cookie:', name, error)
            }
          },
          remove(name: string, options: any) {
            try {
              cookieStore.set({ name, value: '', ...options })
            } catch (error) {
              console.error('Error removing cookie:', name, error)
            }
          },
        },
      }
    )

    // Extract user info from Azure AD account
    const email = account.username || account.idTokenClaims?.email || account.idTokenClaims?.preferred_username
    const name = account.name || account.idTokenClaims?.name

    if (!email) {
      return NextResponse.json(
        { error: 'No email found in Azure AD account' },
        { status: 400 }
      )
    }

    // Sign in or create user in Supabase
    // First, try to sign in with OTP (passwordless)
    const { data: otpData, error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        data: {
          full_name: name,
          azure_ad_id: account.localAccountId || account.homeAccountId,
          email: email,
        },
      },
    })

    if (otpError) {
      console.error('Supabase OTP error:', otpError)

      // If OTP fails, try to create/update user directly
      // Check if user exists
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', email)
        .single()

      if (!existingUser) {
        // Create new user profile
        const userId = account.localAccountId || account.homeAccountId || crypto.randomUUID()

        const { error: createError } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            email,
            full_name: name || email.split('@')[0],
            qc_enabled: email.endsWith('@wolthers.com'),
            qc_role: email.endsWith('@wolthers.com') ? 'lab_personnel' : null,
            is_global_admin: ['daniel@wolthers.com', 'anderson@wolthers.com', 'edgar@wolthers.com'].includes(email),
          })

        if (createError) {
          console.error('Error creating profile:', createError)
        }
      }
    }

    // Create a custom session token for this Azure AD authenticated user
    const sessionToken = Buffer.from(
      JSON.stringify({
        email,
        name,
        azureId: account.localAccountId || account.homeAccountId,
        timestamp: Date.now(),
      })
    ).toString('base64')

    return NextResponse.json({
      success: true,
      email,
      name,
      sessionToken,
    })
  } catch (error: any) {
    console.error('Azure AD sign-in error:', error)
    return NextResponse.json(
      { error: error.message || 'Authentication failed' },
      { status: 500 }
    )
  }
}
