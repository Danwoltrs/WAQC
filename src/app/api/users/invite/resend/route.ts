import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Resend User Invitation API Endpoint
 *
 * Generates a new invitation token for an existing invitation record.
 * This allows re-sending invitations that have expired or need to be resent.
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
    // Get the current user's session for authorization
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')

    let currentUserId: string | null = null
    if (token) {
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
      if (!authError && user) {
        currentUserId = user.id
      }
    }

    if (!currentUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { invitation_id } = body

    if (!invitation_id) {
      return NextResponse.json(
        { error: 'Missing required field: invitation_id' },
        { status: 400 }
      )
    }

    // Fetch the existing invitation
    const { data: existingInvitation, error: fetchError } = await supabaseAdmin
      .from('user_invitations')
      .select('*')
      .eq('id', invitation_id)
      .single()

    if (fetchError || !existingInvitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
    }

    // Check if user already exists
    const { data: existingUser } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('email', existingInvitation.email)
      .single()

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      )
    }

    // Generate new invitation token (valid for 7 days)
    const newInvitationToken = crypto.randomUUID()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    // Update the invitation with new token and expiration
    const { error: updateError } = await supabaseAdmin
      .from('user_invitations')
      .update({
        invitation_token: newInvitationToken,
        expires_at: expiresAt.toISOString(),
        status: 'pending', // Reset status to pending
        updated_at: new Date().toISOString(),
      })
      .eq('id', invitation_id)

    if (updateError) {
      console.error('Error updating invitation:', updateError)
      return NextResponse.json(
        { error: 'Failed to resend invitation' },
        { status: 500 }
      )
    }

    // Create new invitation URL
    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/accept-invite?token=${newInvitationToken}`

    // Log invitation details
    console.log('\n=== INVITATION RESENT ===')
    console.log(`To: ${existingInvitation.email}`)
    console.log(`Name: ${existingInvitation.first_name} ${existingInvitation.last_name}`)
    console.log(`Role: ${existingInvitation.qc_role}`)
    console.log(`Invitation URL: ${inviteUrl}`)
    console.log(`Expires: ${expiresAt.toISOString()}`)
    console.log('=========================\n')

    return NextResponse.json({
      success: true,
      message: 'Invitation resent successfully',
      invitationUrl: inviteUrl,
      expiresAt: expiresAt.toISOString(),
    })
  } catch (error) {
    console.error('Error in resend invitation endpoint:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
