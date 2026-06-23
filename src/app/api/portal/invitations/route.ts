// src/app/api/portal/invitations/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase-server'
import { isClientRole } from '@/lib/portal/portal-auth'
import { buildClientInvitePayload } from '@/lib/portal/invite'

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
const resend = new Resend(process.env.RESEND_API_KEY)

/** Only authenticated non-client (staff) users may manage client invitations. */
async function requireStaff() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await (supabase as any)
    .from('profiles').select('qc_role').eq('id', user.id).maybeSingle()
  if (!profile || isClientRole(profile.qc_role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { userId: user.id }
}

export async function GET(request: NextRequest) {
  const gate = await requireStaff()
  if (gate.error) return gate.error
  const companyId = new URL(request.url).searchParams.get('company_id')
  if (!companyId) return NextResponse.json({ error: 'company_id required' }, { status: 400 })
  const { data } = await supabaseAdmin
    .from('user_invitations')
    .select('id, email, first_name, last_name, status, expires_at, created_at')
    .eq('company_id', companyId)
    .eq('qc_role', 'client')
    .order('created_at', { ascending: false })
  return NextResponse.json({ invitations: data ?? [] })
}

export async function POST(request: NextRequest) {
  const gate = await requireStaff()
  if (gate.error) return gate.error

  const { email, first_name, last_name, company_id } = await request.json()
  if (!email || !first_name || !last_name || !company_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
  }

  const { data: existing } = await supabaseAdmin
    .from('profiles').select('id').eq('email', email).maybeSingle()
  if (existing) return NextResponse.json({ error: 'User already exists' }, { status: 409 })

  const token = crypto.randomUUID()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  const payload = buildClientInvitePayload({
    email, firstName: first_name, lastName: last_name,
    companyId: company_id, invitedBy: gate.userId!, token,
    expiresAtIso: expiresAt.toISOString(),
  })
  const { error: insertError } = await supabaseAdmin.from('user_invitations').insert(payload)
  if (insertError) {
    console.error('client invite insert failed', insertError)
    return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 })
  }

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/accept-invite?token=${token}`
  try {
    await resend.emails.send({
      from: 'Wolthers QC <noreply@qc.wolthers.com>',
      to: email,
      subject: 'You have been invited to the Wolthers QC partner portal',
      html: `<p>Hello ${first_name},</p>
        <p>You have been invited to the Wolthers Quality Control partner portal.</p>
        <p><a href="${inviteUrl}">Accept your invitation and create your account</a></p>
        <p>This link expires on ${expiresAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.</p>
        <p>If the link does not work, paste this into your browser:<br>${inviteUrl}</p>`,
    })
  } catch (emailError) {
    console.error('client invite email failed (invitation still created)', emailError)
  }

  return NextResponse.json({ success: true, invitationUrl: inviteUrl, expiresAt: expiresAt.toISOString() })
}
