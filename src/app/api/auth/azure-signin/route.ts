import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = body.email || body.account?.username || body.account?.idTokenClaims?.email
    const name = body.name || body.account?.name || body.account?.idTokenClaims?.name

    if (!email) {
      return NextResponse.json(
        { error: 'Missing email in request' },
        { status: 400 }
      )
    }

    console.log('Creating/getting user for:', { email, name })

    // Create Supabase Admin client using service role key
    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Try to create user first, handle if already exists
    let userId: string

    const { data: newUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true, // Auto-confirm email since they authenticated via Azure AD
      user_metadata: {
        full_name: name || email.split('@')[0],
      }
    })

    if (createUserError) {
      // If user already exists, fetch their ID from profiles table
      if (createUserError.code === 'email_exists' || createUserError.message?.includes('already been registered')) {
        console.log('User already exists, fetching user ID from profiles...')

        // Try to get user ID from profiles table
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('email', email)
          .single()

        if (profile?.id) {
          userId = profile.id
          console.log('Found existing user from profile:', userId)
        } else {
          console.error('User exists in auth but not in profiles, trying to list users...')

          // Fallback: try to find in auth users with pagination
          let page = 1
          let foundUser = null

          while (page <= 10 && !foundUser) { // Max 10 pages (1000 users)
            const { data: userList } = await supabaseAdmin.auth.admin.listUsers({
              page,
              perPage: 100
            })

            foundUser = userList?.users?.find(u => u.email === email)
            if (foundUser) break

            if (!userList?.users || userList.users.length < 100) break
            page++
          }

          if (foundUser) {
            userId = foundUser.id
            console.log('Found existing user after pagination:', userId)
          } else {
            console.error('User exists but could not be found in any page')
            return NextResponse.json(
              { error: 'User exists but could not be retrieved. Please contact support.' },
              { status: 500 }
            )
          }
        }
      } else {
        // Other error creating user
        console.error('Error creating user:', createUserError)
        return NextResponse.json(
          { error: 'Failed to create user account' },
          { status: 500 }
        )
      }
    } else if (newUser.user) {
      // New user created successfully
      userId = newUser.user.id
      console.log('Created new user:', userId)

      // Create profile for new user
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: userId,
          email,
          full_name: name || email.split('@')[0],
          qc_enabled: email.endsWith('@wolthers.com'),
          qc_role: email.endsWith('@wolthers.com') ? 'lab_personnel' : null,
          is_global_admin: ['daniel@wolthers.com', 'anderson@wolthers.com', 'edgar@wolthers.com'].includes(email),
        })

      if (profileError) {
        console.error('Error creating profile:', profileError)
      }
    } else {
      console.error('Unexpected: No user data and no error')
      return NextResponse.json(
        { error: 'Failed to create user account' },
        { status: 500 }
      )
    }

    // Create a session for the user using admin API
    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.createSession({
      user_id: userId,
    })

    if (sessionError || !sessionData) {
      console.error('Error creating session:', sessionError)
      return NextResponse.json(
        { error: 'Failed to create session' },
        { status: 500 }
      )
    }

    console.log('Session created successfully for user:', userId)

    return NextResponse.json({
      success: true,
      email,
      name,
      userId,
      session: {
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
        expires_at: sessionData.session.expires_at,
        expires_in: sessionData.session.expires_in,
      },
    })
  } catch (error: any) {
    console.error('Azure AD sign-in error:', error)
    return NextResponse.json(
      { error: error.message || 'Authentication failed' },
      { status: 500 }
    )
  }
}
