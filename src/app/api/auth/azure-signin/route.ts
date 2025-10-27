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

    // Get or create user in Supabase Auth
    const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers()
    let userId: string

    const userExists = existingUser?.users?.find(u => u.email === email)

    if (userExists) {
      userId = userExists.id
      console.log('User exists:', userId)
    } else {
      // Create new user in Supabase Auth
      const { data: newUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true, // Auto-confirm email since they authenticated via Azure AD
        user_metadata: {
          full_name: name || email.split('@')[0],
        }
      })

      if (createUserError || !newUser.user) {
        console.error('Error creating user:', createUserError)
        return NextResponse.json(
          { error: 'Failed to create user account' },
          { status: 500 }
        )
      }

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
    }

    // Generate session token using admin API
    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })

    if (sessionError || !sessionData) {
      console.error('Error generating session:', sessionError)
      return NextResponse.json(
        { error: 'Failed to create session' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      email,
      name,
      userId,
      sessionUrl: sessionData.properties.action_link, // This contains the verification token
    })
  } catch (error: any) {
    console.error('Azure AD sign-in error:', error)
    return NextResponse.json(
      { error: error.message || 'Authentication failed' },
      { status: 500 }
    )
  }
}
