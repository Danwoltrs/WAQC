import { NextRequest, NextResponse } from 'next/server'
import { portalServiceClient } from '@/lib/portal/qc-portal-gate'
import { isExternalQcRole } from '@/lib/auth/new-profile'

/**
 * Public: the staff invitation behind a /auth/accept-invite link. Replaces
 * the page's anonymous table read, so the "anyone can list pending
 * invitations" policy can be dropped (migration 20261014000003).
 * Returns one invitation, identified by its token, and nothing else.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? ''
  if (token.length < 10) return NextResponse.json({ error: 'Invitation not found or has expired' }, { status: 404 })
  const { data } = await portalServiceClient()
    .from('user_invitations')
    .select('id, email, first_name, last_name, qc_role, laboratory_id, is_cupper, is_q_grader, qc_enabled, status, expires_at')
    .eq('invitation_token', token)
    .eq('status', 'pending')
    .maybeSingle()
  if (!data || isExternalQcRole(data.qc_role)) {
    return NextResponse.json({ error: 'Invitation not found or has expired' }, { status: 404 })
  }
  if (!data.expires_at || new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invitation has expired' }, { status: 410 })
  }
  return NextResponse.json(data)
}
