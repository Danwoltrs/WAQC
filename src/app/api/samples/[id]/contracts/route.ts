import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { invalidateCertificatePdf } from '@/lib/certificate-storage'
import { isSampleEditor } from '@/lib/sample-edit-permissions'

/**
 * Only master cuppers / global admins may edit a sample's sub-contracts.
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
 * GET /api/samples/[id]/contracts
 * List sub-contracts for a sample, with joined entity names
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sampleId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: contracts, error } = await (supabase as any)
      .from('sample_contracts')
      .select(`
        *,
        importer:companies!sample_contracts_importer_id_fkey(id, name, country),
        roaster:companies!sample_contracts_roaster_id_fkey(id, name, country),
        end_client:companies!sample_contracts_end_client_id_fkey(id, name, company:name, fantasy_name, country),
        qc_client:companies!sample_contracts_client_id_fkey(id, name, company:name, fantasy_name, country)
      `)
      .eq('sample_id', sampleId)
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('Error fetching contracts:', error)
      return NextResponse.json({ error: 'Failed to fetch contracts' }, { status: 500 })
    }

    // Also fetch the mother sample's QC client name for fallback
    const { data: sample } = await (supabase as any)
      .from('samples')
      .select('client_id, clients:companies!samples_client_id_fkey(id, fantasy_name, name)')
      .eq('id', sampleId)
      .single()

    const motherQcClientName = sample?.clients?.fantasy_name || sample?.clients?.name || null

    const transformed = (contracts || []).map((c: any) => {
      const qcClientName = c.qc_client?.fantasy_name || c.qc_client?.company || motherQcClientName
      return {
        ...c,
        importer_name: c.importer?.name || (c.importer_is_qc_client ? qcClientName : null),
        importer_country: c.importer?.country || null,
        roaster_name: c.roaster?.name || null,
        roaster_country: c.roaster?.country || null,
        end_client_name: c.end_client?.fantasy_name || c.end_client?.company || null,
        end_client_country: c.end_client?.country || null,
        qc_client_name: qcClientName,
        qc_client_country: c.qc_client?.country || null,
        // Remove nested objects
        importer: undefined,
        roaster: undefined,
        end_client: undefined,
        qc_client: undefined,
      }
    })

    return NextResponse.json({ contracts: transformed })
  } catch (error: any) {
    console.error('Error in GET /api/samples/[id]/contracts:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/samples/[id]/contracts
 * Create a new sub-contract. Generates a tracking number using mother sample's params.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sampleId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const forbidden = await requireEditor(supabase, user.id)
    if (forbidden) return forbidden

    const body = await request.json()

    // Fetch mother sample to get tracking number format
    const { data: sample, error: sampleError } = await supabase
      .from('samples')
      .select('id, tracking_number, client_id, laboratory_id, origin, quality_spec_id, sample_type')
      .eq('id', sampleId)
      .single()

    if (sampleError || !sample) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    if (!sample.tracking_number) {
      return NextResponse.json({ error: 'Mother sample has no tracking number' }, { status: 400 })
    }

    const clientId = sample.client_id as string | null
    const laboratoryId = sample.laboratory_id as string | null

    // Containers/sub-contracts are commercial shipment splits and always belong to
    // a sample with a QC client + laboratory. Without those we cannot draw from the
    // atomic per-(client, lab, year) sequence, so block rather than fall back to a
    // racy manual scan (which previously produced duplicate/out-of-order numbers).
    if (!clientId || !laboratoryId) {
      return NextResponse.json(
        { error: 'Cannot add a container: this sample has no QC client and laboratory.' },
        { status: 400 }
      )
    }

    // Get current max sort_order
    const { data: maxSort } = await supabase
      .from('sample_contracts')
      .select('sort_order')
      .eq('sample_id', sampleId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextSortOrder = (maxSort?.sort_order ?? -1) + 1

    const contractData = {
      sample_id: sampleId,
      tracking_number: null as unknown as string,
      wolthers_contract_nr: body.wolthers_contract_nr || null,
      seller_contract_nr: body.seller_contract_nr || null,
      shipper_contract_nr: body.shipper_contract_nr || null,
      buyer_contract_nr: body.buyer_contract_nr || null,
      roaster_contract_nr: body.roaster_contract_nr || null,
      qc_client_contract_nr: body.qc_client_contract_nr || null,
      end_client_contract_nr: body.end_client_contract_nr || null,
      supplier_contract_nr: body.supplier_contract_nr || null,
      ico_number: body.ico_number || null,
      container_nr: body.container_nr || null,
      importer_id: body.importer_id || null,
      importer_is_qc_client: body.importer_is_qc_client ?? true,
      roaster_id: body.roaster_id || null,
      end_client_id: body.end_client_id || null,
      client_id: body.client_id || null,
      bag_count: body.bag_count || null,
      bag_weight_kg: body.bag_weight_kg || null,
      bag_type: body.bag_type || null,
      bags_quantity_mt: body.bags_quantity_mt || null,
      equivalent_60kg_bags: body.equivalent_60kg_bags || null,
      exporter_sample_number: body.exporter_sample_number || null,
      shipment_month: body.shipment_month || null,
      sort_order: nextSortOrder,
      created_by: user.id,
    }

    const { data: contract, error: insertError } = await supabase
      .from('sample_contracts')
      .insert(contractData)
      .select()
      .single()

    if (insertError || !contract) {
      console.error('Error creating sub-contract:', insertError)
      return NextResponse.json(
        { error: 'Failed to create sub-contract', details: insertError?.message },
        { status: 500 }
      )
    }

    // Auto-create certificate if mother sample already has one
    try {
      const { data: motherCert } = await supabase
        .from('certificates')
        .select('id, issued_by, valid_from, valid_until, is_rejected')
        .eq('sample_id', sampleId)
        .is('sample_contract_id', null)
        .maybeSingle()

      if (motherCert && contract) {
        const isRejected = motherCert.is_rejected ?? false

        // Get issued_to from mother sample's client (now companies)
        const { data: motherSample } = await (supabase as any)
          .from('samples')
          .select('client_id, clients:companies!samples_client_id_fkey(fantasy_name, name)')
          .eq('id', sampleId)
          .single()

        const motherClient = motherSample?.clients as { fantasy_name?: string; name?: string } | null
        let issuedTo = motherClient?.fantasy_name || motherClient?.name || 'Unknown Client'

        // If sub-contract has a different QC client, use that name
        if (contract.client_id && contract.client_id !== motherSample?.client_id) {
          const { data: subClient } = await (supabase as any)
            .from('companies')
            .select('fantasy_name, name')
            .eq('id', contract.client_id)
            .single()
          if (subClient) {
            issuedTo = subClient.fantasy_name || subClient.name || issuedTo
          }
        }

        await supabase
          .from('certificates')
          .insert({
            sample_id: sampleId,
            sample_contract_id: contract.id,
            certificate_number: null as unknown as string,
            issued_to: issuedTo,
            issued_by: user.id,
            status: 'issued',
            valid_from: motherCert.valid_from,
            valid_until: motherCert.valid_until,
            is_rejected: isRejected,
          })

        const { data: refreshed } = await supabase
          .from('sample_contracts')
          .select('tracking_number')
          .eq('id', contract.id)
          .single()
        if (refreshed?.tracking_number) {
          (contract as any).tracking_number = refreshed.tracking_number
        }
      }
    } catch (certErr) {
      console.error('Error auto-creating certificate for sub-contract:', certErr)
      // Non-fatal: sub-contract was still created
    }

    return NextResponse.json({ contract }, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/samples/[id]/contracts:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/samples/[id]/contracts?contract_id=uuid
 * Update a sub-contract's entity IDs and contract references
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sampleId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const forbidden = await requireEditor(supabase, user.id)
    if (forbidden) return forbidden

    const contractId = request.nextUrl.searchParams.get('contract_id')
    if (!contractId) {
      return NextResponse.json({ error: 'Missing contract_id query parameter' }, { status: 400 })
    }

    const body = await request.json()

    const allowedFields = [
      'wolthers_contract_nr', 'seller_contract_nr', 'shipper_contract_nr',
      'buyer_contract_nr', 'roaster_contract_nr', 'qc_client_contract_nr',
      'end_client_contract_nr', 'supplier_contract_nr', 'ico_number', 'container_nr',
      'importer_id', 'importer_is_qc_client', 'roaster_id', 'end_client_id',
      'bag_count', 'bag_weight_kg', 'bag_type', 'bags_quantity_mt',
      'equivalent_60kg_bags', 'exporter_sample_number', 'shipment_month'
    ]

    const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    const { data: contract, error } = await supabase
      .from('sample_contracts')
      .update(updateData)
      .eq('id', contractId)
      .select()
      .single()

    if (error) {
      console.error('Error updating sub-contract:', error)
      return NextResponse.json({ error: 'Failed to update sub-contract' }, { status: 500 })
    }

    // Every editable sub-contract field renders on the sub-contract certificate,
    // so a successful update invalidates the sample's cached cert PDFs.
    invalidateCertificatePdf(supabase, sampleId).catch(() => {})

    return NextResponse.json({ contract })
  } catch (error: any) {
    console.error('Error in PATCH /api/samples/[id]/contracts:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/samples/[id]/contracts?contract_id=uuid
 * Delete a sub-contract and its associated certificate
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const forbidden = await requireEditor(supabase, user.id)
    if (forbidden) return forbidden

    const contractId = request.nextUrl.searchParams.get('contract_id')
    if (!contractId) {
      return NextResponse.json({ error: 'Missing contract_id query parameter' }, { status: 400 })
    }

    // Delete associated certificate first
    await supabase
      .from('certificates')
      .delete()
      .eq('sample_contract_id', contractId)

    // Delete the sub-contract (CASCADE would handle this, but explicit is clearer)
    const { error } = await supabase
      .from('sample_contracts')
      .delete()
      .eq('id', contractId)

    if (error) {
      console.error('Error deleting sub-contract:', error)
      return NextResponse.json({ error: 'Failed to delete sub-contract' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in DELETE /api/samples/[id]/contracts:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
