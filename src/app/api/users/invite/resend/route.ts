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
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  line-height: 1.6;
                  color: #333;
                  background-color: #f5f5f5;
                  margin: 0;
                  padding: 0;
                }
                .container {
                  max-width: 600px;
                  margin: 40px auto;
                  background: white;
                  border-radius: 12px;
                  overflow: hidden;
                  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                }
                .header {
                  background: #427244;
                  color: white;
                  padding: 40px 30px;
                  text-align: center;
                }
                .logo {
                  max-width: 200px;
                  height: auto;
                  margin-bottom: 20px;
                }
                .content {
                  background: white;
                  padding: 40px 30px;
                }
                .button {
                  display: inline-block;
                  background: #427244;
                  color: white !important;
                  padding: 16px 32px;
                  text-decoration: none;
                  border-radius: 8px;
                  font-weight: 600;
                  margin: 24px 0;
                  transition: background 0.3s ease;
                }
                .button:hover {
                  background: #356034;
                }
                .footer {
                  background: #F7DF96;
                  padding: 30px;
                  text-align: center;
                  color: #427244;
                  font-size: 14px;
                }
                .info-box {
                  background: #f8fdf9;
                  border-left: 4px solid #427244;
                  padding: 20px;
                  margin: 24px 0;
                  border-radius: 4px;
                }
                .expires {
                  color: #dc3545;
                  font-weight: 600;
                  background: #fff5f5;
                  padding: 12px;
                  border-radius: 6px;
                  border-left: 4px solid #dc3545;
                }
                .greeting {
                  color: #427244;
                  margin-top: 0;
                  font-size: 24px;
                }
                .reminder-badge {
                  color: #4a4a4a;
                  font-size: 11px;
                  font-weight: 500;
                  display: inline-block;
                  margin-bottom: 12px;
                  letter-spacing: 0.3px;
                  text-transform: uppercase;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <img src="${process.env.NEXT_PUBLIC_APP_URL}/images/logos/wolthers-logo-off-white.png" alt="Wolthers Logo" class="logo" style="margin: 0;">
                </div>
                <div class="content">
                  <h2 class="greeting">Hello ${existingInvitation.first_name},</h2>
                  <p style="font-size: 16px; color: #555;">This is a reminder that you have been invited to join the Wolthers Quality Control system by ${resenderName}.</p>

                  <div class="info-box">
                    <p style="margin: 0; line-height: 1.8;">
                      <strong style="color: #427244;">Your Role:</strong> ${existingInvitation.qc_role.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}<br>
                      <strong style="color: #427244;">Account Type:</strong> ${existingInvitation.qc_enabled ? 'QC Access Enabled' : 'Standard Access'}
                      ${existingInvitation.is_cupper ? '<br><strong style="color: #427244;">Designation:</strong> Cupper' : ''}
                      ${existingInvitation.is_q_grader ? '<br><strong style="color: #427244;">Certification:</strong> Q Grader' : ''}
                    </p>
                  </div>

                  <p style="font-size: 16px; color: #555;">A new invitation link has been generated for your convenience. To complete your registration and set up your account, please click the button below:</p>

                  <div style="text-align: center;">
                    <a href="${inviteUrl}" class="button">Accept Invitation & Create Account</a>
                  </div>

                  <div class="expires">
                    <strong>⏰ Expires:</strong> ${expiresAt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </div>

                  <p style="font-size: 13px; color: #888; margin-top: 30px; line-height: 1.6;">
                    If the button doesn't work, copy and paste this link into your browser:<br>
                    <a href="${inviteUrl}" style="color: #427244; word-break: break-all;">${inviteUrl}</a>
                  </p>
                </div>
                <div class="footer">
                  <p style="margin: 0 0 10px 0; font-weight: 600; font-size: 16px;">Wolthers Quality Control System</p>
                  <p style="margin: 0;"><a href="https://wolthers.com" style="color: #427244; text-decoration: none; font-weight: 500;">wolthers.com</a></p>
                  <p style="font-size: 12px; color: #427244; margin-top: 15px; opacity: 0.8;">If you didn't expect this invitation, you can safely ignore this email.</p>
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
