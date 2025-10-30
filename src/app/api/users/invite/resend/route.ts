import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

/**
 * Resend User Invitation API Endpoint
 *
 * Generates a new invitation token for an existing invitation record.
 * Sends the new invitation via email and provides URL for manual sharing.
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

const resend = new Resend(process.env.RESEND_API_KEY)

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

    // Get current user's name for email personalization
    let resenderName = 'Wolthers Quality Control Team'
    if (currentUserId) {
      const { data: resenderProfile } = await supabaseAdmin
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', currentUserId)
        .single()

      if (resenderProfile) {
        resenderName = `${resenderProfile.first_name} ${resenderProfile.last_name}`
      }
    }

    // Send invitation email via Resend
    try {
      await resend.emails.send({
        from: 'Wolthers QC <noreply@qc.wolthers.com>',
        to: existingInvitation.email,
        subject: 'Reminder: Your invitation to Wolthers Quality Control',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; }
                .button { display: inline-block; background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
                .button:hover { background: #5568d3; }
                .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
                .info-box { background: #f8f9fa; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; }
                .expires { color: #dc3545; font-weight: 600; }
                .reminder-badge { background: #ffc107; color: #000; padding: 6px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; display: inline-block; margin-bottom: 10px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1 style="margin: 0; font-size: 28px;">Invitation Reminder</h1>
                </div>
                <div class="content">
                  <span class="reminder-badge">⚠️ REMINDER</span>
                  <h2 style="color: #333; margin-top: 10px;">Hello ${existingInvitation.first_name},</h2>
                  <p>This is a reminder that you have been invited to join the Wolthers Quality Control system by ${resenderName}.</p>

                  <div class="info-box">
                    <strong>Your Role:</strong> ${existingInvitation.qc_role.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}<br>
                    <strong>Account Type:</strong> ${existingInvitation.qc_enabled ? 'QC Access Enabled' : 'Standard Access'}
                    ${existingInvitation.is_cupper ? '<br><strong>Designation:</strong> Cupper' : ''}
                    ${existingInvitation.is_q_grader ? '<br><strong>Certification:</strong> Q Grader' : ''}
                  </div>

                  <p>A new invitation link has been generated for your convenience. To complete your registration and set up your account, please click the button below:</p>

                  <div style="text-align: center;">
                    <a href="${inviteUrl}" class="button">Accept Invitation & Create Account</a>
                  </div>

                  <p class="expires">⏰ This new invitation expires on ${expiresAt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>

                  <p style="font-size: 14px; color: #666; margin-top: 30px;">
                    If the button doesn't work, copy and paste this link into your browser:<br>
                    <a href="${inviteUrl}" style="color: #667eea; word-break: break-all;">${inviteUrl}</a>
                  </p>
                </div>
                <div class="footer">
                  <p>Wolthers Quality Control System<br>
                  <a href="https://wolthers.com" style="color: #667eea;">wolthers.com</a></p>
                  <p style="font-size: 12px; color: #999;">If you didn't expect this invitation, you can safely ignore this email.</p>
                </div>
              </div>
            </body>
          </html>
        `,
      })
      console.log(`✅ Invitation reminder email sent to ${existingInvitation.email}`)
    } catch (emailError) {
      console.error('Error sending invitation reminder email:', emailError)
      // Don't fail the request if email fails - invitation is still updated
      console.warn('⚠️  Email delivery failed, but invitation URL is available for manual sharing')
    }

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
      message: 'Invitation resent and email delivered successfully',
      invitationUrl: inviteUrl,
      expiresAt: expiresAt.toISOString(),
    })
  } catch (error) {
    console.error('Error in resend invitation endpoint:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
