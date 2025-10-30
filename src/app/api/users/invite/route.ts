import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

/**
 * User Invitation API Endpoint
 *
 * Creates user invitations with secure tokens for account creation.
 * Sends invitation email via Resend and returns invitation URL as fallback.
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
    // Get the current user's session
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')

    let currentUserId: string | null = null
    if (token) {
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
      if (!authError && user) {
        currentUserId = user.id
      }
    }

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
      invited_by: currentUserId,
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

    // Get inviter's name for email personalization
    let inviterName = 'Wolthers Quality Control Team'
    if (currentUserId) {
      const { data: inviterProfile } = await supabaseAdmin
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', currentUserId)
        .single()

      if (inviterProfile) {
        inviterName = `${inviterProfile.first_name} ${inviterProfile.last_name}`
      }
    }

    // Send invitation email via Resend
    try {
      await resend.emails.send({
        from: 'Wolthers QC <noreply@qc.wolthers.com>',
        to: email,
        subject: 'You\'ve been invited to Wolthers Quality Control',
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
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1 style="margin: 0; font-size: 28px;">Welcome to Wolthers QC</h1>
                </div>
                <div class="content">
                  <h2 style="color: #333; margin-top: 0;">Hello ${first_name},</h2>
                  <p>${inviterName} has invited you to join the Wolthers Quality Control system.</p>

                  <div class="info-box">
                    <strong>Your Role:</strong> ${qc_role.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}<br>
                    <strong>Account Type:</strong> ${qc_enabled ? 'QC Access Enabled' : 'Standard Access'}
                    ${is_cupper ? '<br><strong>Designation:</strong> Cupper' : ''}
                    ${is_q_grader ? '<br><strong>Certification:</strong> Q Grader' : ''}
                  </div>

                  <p>To complete your registration and set up your account, please click the button below:</p>

                  <div style="text-align: center;">
                    <a href="${inviteUrl}" class="button">Accept Invitation & Create Account</a>
                  </div>

                  <p class="expires">⏰ This invitation expires on ${expiresAt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>

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
      console.log(`✅ Invitation email sent to ${email}`)
    } catch (emailError) {
      console.error('Error sending invitation email:', emailError)
      // Don't fail the request if email fails - invitation is still created
      console.warn('⚠️  Email delivery failed, but invitation URL is available for manual sharing')
    }

    // Log invitation details for manual sharing (as fallback)
    console.log('\n=== USER INVITATION CREATED ===')
    console.log(`To: ${email}`)
    console.log(`Name: ${first_name} ${last_name}`)
    console.log(`Role: ${qc_role}`)
    console.log(`Invitation URL: ${inviteUrl}`)
    console.log(`Expires: ${expiresAt.toISOString()}`)
    console.log('===============================\n')

    return NextResponse.json({
      success: true,
      message: 'Invitation created and email sent successfully',
      invitationUrl: inviteUrl,
      expiresAt: expiresAt.toISOString(),
    })
  } catch (error) {
    console.error('Error in invite endpoint:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

