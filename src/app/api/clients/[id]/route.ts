import { carriesVerdict } from '@/lib/sample-verdict'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { loadLabScope, readsAllLabs } from '@/lib/auth/lab-scope'
import { loadHqLabId, settingsLabFor } from '@/lib/qc-settings/lab-row'
import { serviceRoleClient } from '@/lib/supabase-service'
import { loadSettingsLab } from '@/lib/qc-settings/user-lab'
import {
  withQcClientSelect,
  mapCompanyToClient,
  splitClientPayload,
  fetchClientById,
  resolveCompanyIdFromSlug,
} from '@/lib/qc-client-mapper'

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

/**
 * GET /api/clients/[id]
 * Fetch one QC client (company + qc_client_settings) plus its sample/quality/cert summary.
 *
 * Slug-based lookup is no longer supported post-consolidation — companies has no
 * slug column. UI links should already use UUIDs.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const labId = await loadSettingsLab(supabase as any, user.id)

    const { id: rawId } = await params
    let id = rawId
    if (!isUUID(rawId)) {
      const resolved = await resolveCompanyIdFromSlug(supabase as any, rawId)
      if (!resolved) {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 })
      }
      id = resolved
    }

    // Retried once without the final-word columns until migration
    // 20261118000001 is applied (withQcClientSelect).
    const { data: companyRow, error } = await withQcClientSelect((select) =>
      (supabase as any).from('companies').select(select).eq('id', id).single(),
    )

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 })
      }
      console.error('Error fetching client:', error)
      return NextResponse.json({ error: 'Failed to fetch client' }, { status: 500 })
    }

    const client = mapCompanyToClient(companyRow, labId)
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Samples linked to this company (as the QC client)
    const { data: samples } = await (supabase as any)
      .from('samples')
      .select(
        'id, origin, status, sample_type, created_at, quality_spec_id, container_nr, ico_number, exporter_sample_number, ' +
          'certificates:certificates!certificates_sample_id_fkey(id, certificate_number, status, created_at)',
      )
      .is('deleted_at', null)
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(50)

    const sampleMetrics = {
      total: samples?.length || 0,
      received: samples?.filter((s: any) => s.status === 'received').length || 0,
      in_progress: samples?.filter((s: any) => s.status === 'in_progress').length || 0,
      under_review: samples?.filter((s: any) => s.status === 'under_review').length || 0,
      // A type sample is measured, never approved or rejected.
      approved: samples?.filter((s: any) => s.status === 'approved' && carriesVerdict(s.sample_type)).length || 0,
      rejected: samples?.filter((s: any) => s.status === 'rejected' && carriesVerdict(s.sample_type)).length || 0,
    }

    // Quality specs (client_qualities.client_id now points at companies(id) post #5)
    const { data: qualitySpecs } = await (supabase as any)
      .from('client_qualities')
      .select(`
        id,
        origin,
        custom_parameters,
        created_at,
        template:quality_templates (
          id,
          name,
          description,
          parameters
        )
      `)
      .eq('client_id', id)

    // Certificate count via the sample list
    const sampleIds = (samples || []).map((s: any) => s.id)
    let certificatesCount = 0
    if (sampleIds.length > 0) {
      const { count } = await (supabase as any)
        .from('certificates')
        .select('*', { count: 'exact', head: true })
        .in('sample_id', sampleIds)
      certificatesCount = count || 0
    }

    return NextResponse.json({
      client,
      samples: samples || [],
      sampleMetrics,
      qualitySpecs: qualitySpecs || [],
      certificatesCount,
    })
  } catch (error) {
    console.error('Error in GET /api/clients/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/clients/[id]
 * Update a QC client. Fields are routed to companies vs qc_client_settings
 * based on the registry in qc-client-mapper.ts.
 *
 * If the company doesn't yet have a qc_client_settings row (e.g. it was a
 * trade-only company being upgraded to QC), an INSERT is performed instead.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    if (!isUUID(id)) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Own laboratory only: the row written is (company, caller's laboratory),
    // never one named in the request.
    const labId = await loadSettingsLab(supabase as any, user.id)

    const body = await request.json()
    const { companyFields, settingsFields } = splitClientPayload(body)

    // Confirm the company exists
    const { data: existing } = await (supabase as any)
      .from('companies')
      .select('id')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Update companies if there's anything to write
    if (Object.keys(companyFields).length > 0) {
      const { error: companyError } = await (supabase as any)
        .from('companies')
        .update(companyFields)
        .eq('id', id)

      if (companyError) {
        console.error('Error updating company:', companyError)
        return NextResponse.json({
          error: 'Failed to update client',
          details: companyError.message,
        }, { status: 500 })
      }
    }

    // Upsert qc_client_settings if there's anything to write
    if (Object.keys(settingsFields).length > 0) {
      const { error: settingsError } = await (supabase as any)
        .from('qc_client_settings')
        .upsert(
          { company_id: id, laboratory_id: labId, ...settingsFields },
          { onConflict: 'company_id,laboratory_id' }
        )

      if (settingsError) {
        console.error('Error updating qc_client_settings:', settingsError)
        return NextResponse.json({
          error: 'Failed to update QC settings',
          details: settingsError.message,
        }, { status: 500 })
      }
    }

    const client = await fetchClientById(supabase, id, labId)
    return NextResponse.json({ client })
  } catch (error) {
    console.error('Error in PATCH /api/clients/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/clients/[id]
 * Remove a QC client.
 *
 * Behavior:
 *   - Without ?force=true: returns linked-records counts so the UI can confirm.
 *   - With ?force=true: nullifies sample/contract FKs, removes the qc_client_settings
 *     row, and flips companies.is_qc_client = false. The company itself is NOT
 *     deleted — it may still be a counterparty on other trades. To fully purge
 *     a company, manage it on sys.wolthers.com.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    if (!isUUID(id)) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const [scope, hqLabId] = await Promise.all([
      loadLabScope(supabase as any, user.id),
      loadHqLabId(supabase as any),
    ])
    const labId = settingsLabFor(scope, hqLabId)

    const { data: company } = await (supabase as any)
      .from('companies')
      .select('id')
      .eq('id', id)
      .single()

    if (!company) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const force = request.nextUrl.searchParams.get('force') === 'true'

    // Contract siblings are samples, so one count covers every contract.
    const [
      { count: samplesCount },
      { count: endClientCount },
      { count: qualityCount },
    ] = await Promise.all([
      (supabase as any).from('samples').select('*', { count: 'exact', head: true }).eq('client_id', id),
      (supabase as any).from('samples').select('*', { count: 'exact', head: true }).eq('end_client_id', id),
      (supabase as any).from('client_qualities').select('*', { count: 'exact', head: true }).eq('client_id', id),
    ])

    const linkedRecords = {
      samples: (samplesCount || 0) + (endClientCount || 0),
      qualities: qualityCount || 0,
    }
    const hasLinked = linkedRecords.samples > 0 || linkedRecords.qualities > 0

    if (hasLinked && !force) {
      return NextResponse.json({
        error: 'confirm_delete',
        linked_records: linkedRecords,
        message: 'This client has linked records. Confirm deletion to proceed.',
      }, { status: 409 })
    }

    // Other laboratories may still serve this client. Then only this
    // laboratory's own settings and specs go; the company stays a QC client
    // and its samples keep their client. A confined lab cannot see other
    // labs' rows (RLS), so it always takes this path and never touches the
    // shared flag. HQ and global callers count with the service role, so the
    // decision never depends on their own RLS view.
    let ownLabOnly = !readsAllLabs(scope)
    if (!ownLabOnly) {
      const { count: otherLabRows, error: countError } = await serviceRoleClient()
        .from('qc_client_settings')
        .select('company_id', { count: 'exact', head: true })
        .eq('company_id', id)
        .neq('laboratory_id', labId)
      if (countError || otherLabRows === null || otherLabRows === undefined) {
        console.error('Error counting other labs QC settings:', countError)
        return NextResponse.json({
          error: 'Failed to check other laboratories',
          details: countError?.message,
        }, { status: 500 })
      }
      ownLabOnly = otherLabRows > 0
    }

    if (ownLabOnly) {
      await (supabase as any).from('client_qualities').delete().eq('client_id', id).eq('laboratory_id', labId)
      const { error: ownRowError } = await (supabase as any)
        .from('qc_client_settings')
        .delete()
        .eq('company_id', id)
        .eq('laboratory_id', labId)
      if (ownRowError) {
        console.error('Error removing QC settings:', ownRowError)
        return NextResponse.json({
          error: 'Failed to remove QC settings',
          details: ownRowError.message,
        }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    }

    if (linkedRecords.qualities > 0) {
      await (supabase as any).from('client_qualities').delete().eq('client_id', id)
    }
    if (linkedRecords.samples > 0) {
      await (supabase as any).from('samples').update({ client_id: null }).eq('client_id', id)
      await (supabase as any).from('samples').update({ end_client_id: null }).eq('end_client_id', id)
    }
    // Remove QC enrollment: drop this laboratory's settings row (the only one
    // left), flip the flag.
    // qc_client_settings has ON DELETE CASCADE on company_id, but we're not
    // deleting the company itself.
    await (supabase as any).from('qc_client_settings').delete().eq('company_id', id).eq('laboratory_id', labId)
    const { error: flagError } = await (supabase as any)
      .from('companies')
      .update({ is_qc_client: false })
      .eq('id', id)

    if (flagError) {
      console.error('Error removing QC client status:', flagError)
      return NextResponse.json({
        error: 'Failed to remove QC client status',
        details: flagError.message,
      }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/clients/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
