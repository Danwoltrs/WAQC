import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { isStaffSampleManager } from '@/lib/auth/sample-access'
import { serviceRoleClient } from '@/lib/supabase-service'
import { loadGroupSellerRequestStates } from '@/lib/seller-requests/store'

/** GET /api/samples/[id]/seller-requests: per-contract seller-request state for the group's PSS members (lab staff). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await isStaffSampleManager(supabase as any, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { id } = await params
    const members = await loadGroupSellerRequestStates(serviceRoleClient(), id)
    return NextResponse.json({ members })
  } catch (e) {
    console.error('[seller-requests] GET failed', e)
    return NextResponse.json({ error: 'Failed to load seller requests' }, { status: 500 })
  }
}
