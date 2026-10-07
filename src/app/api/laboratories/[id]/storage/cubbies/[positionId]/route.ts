import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { canViewLabStorage, loadStorageProfile } from '@/lib/storage/storage-access'
import { buildCubbySampleRows, STORED_SAMPLE_COLUMNS, type CertRow, type StoredSampleRow } from '@/lib/storage/cubby-samples'

type Ctx = { params: Promise<{ id: string; positionId: string }> }

/** GET: the live samples in one cubby, named by certificate or reference. */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, positionId } = await params
  const profile = await loadStorageProfile(supabase, user.id)
  if (!canViewLabStorage(profile, id)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  const db = supabase as any
  const { data: cubby } = await db
    .from('storage_positions').select('id, position_code, laboratory_id').eq('id', positionId).maybeSingle()
  if (!cubby || cubby.laboratory_id !== id) return NextResponse.json({ error: 'Cubby not found' }, { status: 404 })

  const { data: samples, error } = await db
    .from('samples').select(STORED_SAMPLE_COLUMNS).eq('storage_position_id', positionId).is('deleted_at', null)
  if (error) return NextResponse.json({ error: 'Failed to load the cubby' }, { status: 500 })

  const rows = (samples ?? []) as StoredSampleRow[]
  let certs: CertRow[] = []
  if (rows.length > 0) {
    const { data } = await db
      .from('certificates').select('id, sample_id, certificate_number')
      .in('sample_id', rows.map((s) => s.id)).is('voided_at', null)
    certs = data ?? []
  }

  return NextResponse.json({
    cubby: { id: cubby.id, code: cubby.position_code },
    samples: buildCubbySampleRows(rows, certs),
  })
}
