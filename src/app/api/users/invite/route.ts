import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

/**
 * User Invitation API Endpoint
 *
 * Sends professional invitation emails to new users with account creation links.
 * Uses Resend for email delivery with Wolthers branding.
 */

const resend = new Resend(process.env.RESEND_API_KEY)

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

    // Send invitation email using Resend
    try {
      await resend.emails.send({
        from: 'Wolthers Quality Control <qc@wolthers.com>',
        to: email,
        subject: 'Welcome to Wolthers Quality Control System',
        html: generateInvitationEmail({
          firstName: first_name,
          lastName: last_name,
          inviteUrl,
          role: qc_role,
        }),
      })
    } catch (emailError) {
      console.error('Error sending invitation email:', emailError)
      // Delete invitation if email fails
      await supabaseAdmin
        .from('user_invitations')
        .delete()
        .eq('invitation_token', invitationToken)

      return NextResponse.json(
        { error: 'Failed to send invitation email' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Invitation sent successfully',
    })
  } catch (error) {
    console.error('Error in invite endpoint:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Generate professional HTML email template for user invitation
 */
function generateInvitationEmail({
  firstName,
  lastName,
  inviteUrl,
  role,
}: {
  firstName: string
  lastName: string
  inviteUrl: string
  role: string
}) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Wolthers QC</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header with Logo -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; background: linear-gradient(135deg, #2A2A2A 0%, #1a1a1a 100%); border-radius: 8px 8px 0 0;">
              <img src="${process.env.NEXT_PUBLIC_APP_URL}/wolthers-logo-green.png" alt="Wolthers Logo" style="height: 60px; margin-bottom: 20px;" />
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Welcome to Wolthers QC</h1>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 16px; color: #2A2A2A; font-size: 16px; line-height: 24px;">
                Hello ${firstName} ${lastName},
              </p>

              <p style="margin: 0 0 24px; color: #2A2A2A; font-size: 16px; line-height: 24px;">
                You have been invited to join the Wolthers Quality Control System as a <strong>${getRoleLabel(role)}</strong>.
                Our platform provides comprehensive coffee quality assessment and management tools for our global laboratory network.
              </p>

              <p style="margin: 0 0 32px; color: #2A2A2A; font-size: 16px; line-height: 24px;">
                Click the button below to create your account and get started:
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${inviteUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #6BE6D3 0%, #7DBBFF 100%); color: #2A2A2A; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                      Create Your Account
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 32px 0 0; color: #666666; font-size: 14px; line-height: 20px;">
                This invitation link will expire in 7 days. If you have any questions or need assistance,
                please contact your system administrator.
              </p>

              <!-- Manual Link (fallback) -->
              <p style="margin: 24px 0 0; padding: 16px; background-color: #f9f9f9; border-radius: 6px; color: #666666; font-size: 12px; line-height: 18px; word-break: break-all;">
                If the button above doesn't work, copy and paste this link into your browser:<br/>
                <a href="${inviteUrl}" style="color: #7DBBFF;">${inviteUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f9f9f9; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0 0 8px; color: #666666; font-size: 14px; line-height: 20px; font-weight: 600;">
                Wolthers Coffee Quality Control
              </p>
              <p style="margin: 0; color: #999999; font-size: 12px; line-height: 18px;">
                Santos HQ • Buenaventura • Guatemala City • Peru
              </p>
              <p style="margin: 12px 0 0; color: #999999; font-size: 12px; line-height: 18px;">
                © ${new Date().getFullYear()} Wolthers. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
}

/**
 * Get user-friendly role label
 */
function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    lab_personnel: 'Lab Personnel',
    lab_finance_manager: 'Lab Finance Manager',
    lab_quality_manager: 'Lab Administrator',
    santos_hq_finance: 'Santos HQ Finance',
    global_finance_admin: 'Global Finance Administrator',
    global_quality_admin: 'Global Quality Administrator',
    global_admin: 'Global Administrator',
    client: 'Client',
    supplier: 'Supplier',
    buyer: 'Buyer',
  }
  return labels[role] || role
}
