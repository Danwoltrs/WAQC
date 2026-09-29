import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { isStaffSampleManager } from '@/lib/auth/sample-access'
import { getInitials } from '@/lib/approval-notification/batch-send'
import { loadSendQueue } from '@/lib/approval-notification/send-queue'
import type { ApprovalDecision, ApprovalSide } from '@/lib/approval-notification/types'

const admin = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

export async function GET(req: NextRequest) {
  const server = await createServerClient()
  const {
    data: { user },
  } = await server.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isStaffSampleManager(server as any, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const decisionsParam = sp.get('decisions')
  const wantDecisions = new Set<ApprovalDecision>(
    (decisionsParam ? decisionsParam.split(',') : ['approved', 'rejected'])
      .map((d) => d.trim())
      .filter((d): d is ApprovalDecision => d === 'approved' || d === 'rejected'),
  )
  // Explicit-selection mode: send a chosen set of samples to one side (buyer or
  // seller) regardless of date or prior-send status — used by the certificates
  // page "Send to buyer / Send to seller" buttons.
  const explicitIds = (sp.get('sampleIds') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const sideParam = sp.get('side')
  const onlySide: ApprovalSide | undefined =
    sideParam === 'buyer' || sideParam === 'seller' ? sideParam : undefined
  // "Send unsent" asks first which QC clients have something left to send
  // (`view=clients`), then builds the queue for the ones kept (`clientIds`).
  const clientsView = sp.get('view') === 'clients'
  const clientParam = sp.get('clientIds')
  const chosenClients =
    clientParam === null ? null : new Set(clientParam.split(',').map((s) => s.trim()).filter(Boolean))

  const result = await loadSendQueue(admin(), {
    wantDecisions,
    explicitIds,
    onlySide,
    from: sp.get('from'),
    to: sp.get('to'),
    clientsView,
    chosenClients,
  })
  if (result.status !== 200 || clientsView) return NextResponse.json(result.body, { status: result.status })
  return NextResponse.json({
    ...result.body,
    // Convenience for any caller that wants initials without re-deriving.
    senderInitials: getInitials(user.user_metadata?.full_name as string | undefined),
  })
}
