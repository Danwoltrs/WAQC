// src/app/api/portal/accept/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { portalServiceClient } from '@/lib/portal/qc-portal-gate'
import { INVALID_INVITATION, acceptInvitation, describeInvitation } from '@/lib/portal/accept-invitation'

/** Public: what an invitation link is for (no token hash, no keys beyond what the page shows). */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? ''
  try {
    const description = await describeInvitation(portalServiceClient(), token)
    if (!description) return NextResponse.json({ error: INVALID_INVITATION }, { status: 410 })
    return NextResponse.json(description)
  } catch (error) {
    console.error('[portal] describing invitation failed:', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again in a minute.' }, { status: 500 })
  }
}

/** Public: accept with a password or Microsoft. Body: { token, method, password? }. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const result = await acceptInvitation(portalServiceClient(), {
    token: typeof body?.token === 'string' ? body.token : '',
    method: body?.method === 'microsoft' ? 'microsoft' : 'password',
    password: typeof body?.password === 'string' ? body.password : null,
  })
  return NextResponse.json(result.body, { status: result.status })
}
