import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { isInternalStaff } from '@/lib/auth/sample-access'
import { loadLabScope, resolveLabView } from '@/lib/auth/lab-scope'
import { searchStandbyRows, toStandbyRows, type StandbyCertificateRecord } from '@/lib/pre-certificate-list'

/**
 * GET /api/certificates/standby
 * The pre-certificates waiting for their container, oldest first, for the
 * caller's own laboratory (HQ may ask for another one and gets it read-only).
 * Query: search (ICO number, shipper or certificate number), laboratory_id.
 * `available` is false when pre-certificates are not set up on the database.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await isInternalStaff(supabase as any, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const params = request.nextUrl.searchParams
    const labView = resolveLabView(await loadLabScope(supabase as any, user.id), params.get('laboratory_id'))

    let query = (supabase as any)
      .from('certificates')
      .select(`
        id, certificate_number, standby_at, sample_id,
        sample:samples!certificates_sample_id_fkey!inner(
          id, deleted_at, laboratory_id, ico_number, sample_type, origin, quality_name,
          wolthers_contract_nr, buyer_contract_nr,
          exporter:companies!samples_exporter_id_fkey(name, fantasy_name),
          seller:companies!samples_seller_id_fkey(name, fantasy_name),
          client:companies!samples_client_id_fkey(name, fantasy_name)
        )
      `)
      .not('standby_at', 'is', null)
      .is('finalized_at', null)
      .is('voided_at', null)
      .order('standby_at', { ascending: true })
      .limit(1000)
    if (labView.labId) query = query.eq('sample.laboratory_id', labView.labId)

    const { data, error } = await query
    const lab_view = { laboratory_id: labView.labId, read_only: labView.readOnly }

    // Does the laboratory listed work with pre-certificates at all? (Brazil does not.)
    let enabled = false
    if (labView.labId) {
      const { data: lab, error: labError } = await (supabase as any)
        .from('laboratories')
        .select('pre_cert_check')
        .eq('id', labView.labId)
        .maybeSingle()
      if (!labError) enabled = lab?.pre_cert_check === true
    }
    if (error) {
      console.error('[certificates/standby] list failed:', error)
      return NextResponse.json({ certificates: [], total: 0, available: false, enabled: false, lab_view })
    }
    const rows = toStandbyRows((data ?? []) as StandbyCertificateRecord[])
    return NextResponse.json({
      certificates: searchStandbyRows(rows, params.get('search')),
      total: rows.length,
      available: true,
      enabled,
      lab_view,
    })
  } catch (error) {
    console.error('Error in GET /api/certificates/standby:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
