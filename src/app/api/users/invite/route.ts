import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * User Invitation API Endpoint
 *
 * Creates user invitations with secure tokens for account creation.
 * Returns invitation URL for manual sharing - no email service required.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Service role key for admin operations
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, first_name, last_name, qc_role, laboratory_id, is_cupper, is_q_grader, qc_enabled } = body

    // Validate required fields
    if (!email || !first_name || !last_name || !qc_role) {
      return NextResponse.json(
        { error: 'Missing required fields: email, first_name, last_name, qc_role' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    // Check if user already exists
    const { data: existingUser } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('email', email)
      .single()

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      )
    }

    // Generate secure invitation token (valid for 7 days)
    const invitationToken = crypto.randomUUID()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    // Store invitation in database
    const { error: inviteError } = await supabaseAdmin.from('user_invitations').insert({
      email,
      first_name,
      last_name,
      qc_role,
      laboratory_id: laboratory_id || null,
      is_cupper: is_cupper || false,
      is_q_grader: is_q_grader || false,
      qc_enabled: qc_enabled || false,
      invitation_token: invitationToken,
      expires_at: expiresAt.toISOString(),
      status: 'pending',
    })

    if (inviteError) {
      console.error('Error creating invitation:', inviteError)
      return NextResponse.json(
        { error: 'Failed to create invitation' },
        { status: 500 }
      )
    }

    // Create invitation URL
    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/accept-invite?token=${invitationToken}`

    // Log invitation details for manual sharing
    console.log('\n=== USER INVITATION CREATED ===')
    console.log(`To: ${email}`)
    console.log(`Name: ${first_name} ${last_name}`)
    console.log(`Role: ${qc_role}`)
    console.log(`Invitation URL: ${inviteUrl}`)
    console.log(`Expires: ${expiresAt.toISOString()}`)
    console.log('===============================\n')

    return NextResponse.json({
      success: true,
      message: 'Invitation created successfully',
      invitationUrl: inviteUrl,
      expiresAt: expiresAt.toISOString(),
    })
  } catch (error) {
    console.error('Error in invite endpoint:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

