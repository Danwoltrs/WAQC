import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { isUUID } from '@/lib/utils'
import { isSampleEditor } from '@/lib/sample-edit-permissions'
import { writeDecisionToShipmentSamples } from '@/lib/approval-notification/sys-decision-writeback'
import { createSiblingSamples, fetchGroup, type ContractInput } from '@/lib/sample-group'

// Admin client bypasses RLS to re-sync the shared sys shipment_samples rows.
const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

/**
 * Only master cuppers / global admins may add contracts to a sample.
 * Returns an error response if the user is not an editor, otherwise null.
 */
async function requireEditor(supabase: any, userId: string): Promise<NextResponse | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_master_cupper, is_global_admin, qc_role')
    .eq('id', userId)
    .single()
  if (!isSampleEditor(profile)) {
    return NextResponse.json(
      { error: 'Forbidden: Only master cuppers and global admins can edit samples.' },
      { status: 403 }
    )
  }
  return null
}

/**
 * POST /api/samples/[id]/siblings
 * Body: { contracts: ContractInput[] }
 *
 * Adds contracts to an existing sample as sibling rows of its lab unit. The
 * id may be any member of the group — a sibling resolves to its lab unit, so
 * "add a contract" from a sibling's overlay lands in the same group. Siblings
 * are created server-side by createSiblingSamples (numbering, bulk
 * normalisation, certificates on an already-certified lot); the sys leaves
 * are then re-synced once for the group.
 *
 * Response: 201 { created: GroupMember[], failed: [{ index, error }] } —
 * `failed` is per input and may name an input that WAS created but has no
 * certificate; the caller shows those as warnings.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const forbidden = await requireEditor(supabase, user.id)
    if (forbidden) return forbidden

    if (!isUUID(id)) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    let body: { contracts?: unknown } | null = null
    try {
      body = await request.json()
    } catch {
      body = null
    }
    const contracts = body?.contracts
    if (!Array.isArray(contracts) || contracts.length === 0) {
      return NextResponse.json({ error: 'contracts must be a non-empty array' }, { status: 400 })
    }
    if (!contracts.every((c) => c && typeof c === 'object' && !Array.isArray(c))) {
      return NextResponse.json({ error: 'Each contract must be an object' }, { status: 400 })
    }

    const [labUnit] = await fetchGroup(supabase, id)
    if (!labUnit || labUnit.deleted_at) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    const { created, failed } = await createSiblingSamples(
      supabase, labUnit, contracts as ContractInput[], user.id,
    )

    // Re-sync sys instantly: a new contract on a decided sample propagates the
    // decision (+ reason) to its sys leaves. Self-guarded + sync-only, once
    // for the whole group.
    if (created.length > 0) {
      await writeDecisionToShipmentSamples(supabaseAdmin, labUnit.id, user.id, null, { syncOnly: true })
    }

    return NextResponse.json({ created, failed }, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/samples/[id]/siblings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
