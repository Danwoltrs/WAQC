import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { canViewLabStorage, loadStorageProfile } from '@/lib/storage/storage-access'
import {
  buildCubbySampleRows, sanitizeStorageSearch, STORED_SAMPLE_COLUMNS, type CertRow, type StoredSampleRow,
} from '@/lib/storage/cubby-samples'

type Ctx = { params: Promise<{ id: string }> }

const REF_COLUMNS = ['wolthers_contract_nr', 'buyer_contract_nr', 'container_nr', 'ico_number', 'exporter_sample_number']

/** GET ?q=: stored samples of this lab whose certificate, contract or reference matches. */
export async function GET(request: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const profile = await loadStorageProfile(supabase, user.id)
  if (!canViewLabStorage(profile, id)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  const q = sanitizeStorageSearch(request.nextUrl.searchParams.get('q'))
  if (!q) return NextResponse.json({ matches: [] })
  const pattern = `%${q}%`
  const db = supabase as any

  const stored = () =>
    db.from('samples').select(STORED_SAMPLE_COLUMNS)
      .eq('laboratory_id', id).not('storage_position_id', 'is', null).is('deleted_at', null)

  const { data: certHits } = await db
    .from('certificates').select('sample_id').ilike('certificate_number', pattern).is('voided_at', null).limit(20)
  const certSampleIds = [...new Set(((certHits ?? []) as Array<{ sample_id: string }>).map((c) => c.sample_id))]

  const [byCert, byRef] = await Promise.all([
    certSampleIds.length > 0 ? stored().in('id', certSampleIds) : Promise.resolve({ data: [] }),
    stored().or(REF_COLUMNS.map((c) => `${c}.ilike."${pattern}"`).join(',')).limit(20),
  ])

  const byId = new Map<string, StoredSampleRow>()
  for (const s of [...(byCert.data ?? []), ...(byRef.data ?? [])] as StoredSampleRow[]) byId.set(s.id, s)
  const samples = [...byId.values()].slice(0, 20)

  let certs: CertRow[] = []
  if (samples.length > 0) {
    const { data } = await db
      .from('certificates').select('id, sample_id, certificate_number')
      .in('sample_id', samples.map((s) => s.id)).is('voided_at', null)
    certs = data ?? []
  }

  const labels = new Map(buildCubbySampleRows(samples, certs).map((r) => [r.id, r]))
  return NextResponse.json({
    matches: samples.map((s) => {
      const row = labels.get(s.id)
      return {
        sample_id: s.id,
        position_id: s.storage_position_id as string,
        label: [row?.label, row?.contract ? `#${row.contract}` : null].filter(Boolean).join(' · '),
      }
    }),
  })
}
