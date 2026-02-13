import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

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
        importer:importers(id, name, country),
        roaster:roasters(id, name, country),
        end_client:clients!sample_contracts_end_client_id_fkey(id, company, fantasy_name, country),
        qc_client:clients!sample_contracts_client_id_fkey(id, company, fantasy_name, country)
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
      .select('client_id, clients!samples_client_id_fkey(id, fantasy_name, company)')
      .eq('id', sampleId)
      .single()

    const motherQcClientName = sample?.clients?.fantasy_name || sample?.clients?.company || null

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

    const body = await request.json()

    // Fetch mother sample to get tracking number generation params
    const { data: sample, error: sampleError } = await supabase
      .from('samples')
      .select('id, client_id, laboratory_id, origin, quality_spec_id, sample_type')
      .eq('id', sampleId)
      .single()

    if (sampleError || !sample) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    // Generate tracking number using mother sample's params
    // The RPC only checks `samples` table, so we also check `sample_contracts` for conflicts
    // and increment the numeric part if needed.
    const { data: rpcTrackingNumber, error: trackingError } = await supabase
      .rpc('generate_tracking_number', {
        p_client_id: sample.client_id,
        p_laboratory_id: sample.laboratory_id,
        p_origin: sample.origin,
        p_quality_template_id: sample.quality_spec_id,
        p_is_rejected: false,
        p_sample_type: sample.sample_type || 'pss'
      } as any)

    if (trackingError || !rpcTrackingNumber) {
      console.error('Error generating tracking number for sub-contract:', trackingError)
      return NextResponse.json({ error: 'Failed to generate tracking number' }, { status: 500 })
    }

    // Parse tracking number format: "BD1-890231/26" → prefix="BD1", num=890231, suffix="26"
    const tnStr = String(rpcTrackingNumber)
    const slashIdx = tnStr.lastIndexOf('/')
    const tnSuffix = slashIdx >= 0 ? tnStr.substring(slashIdx + 1) : ''
    const tnLeft = slashIdx >= 0 ? tnStr.substring(0, slashIdx) : tnStr
    const dashIdx = tnLeft.lastIndexOf('-')
    const tnPrefix = dashIdx >= 0 ? tnLeft.substring(0, dashIdx) : ''
    const tnNumStr = dashIdx >= 0 ? tnLeft.substring(dashIdx + 1) : tnLeft
    const tnNumLen = tnNumStr.length

    // Find the highest existing number across ALL prefixes for this QC client suffix
    // e.g. if suffix is "26", search "%/26" to find max across BD1-890231/26, ED1-890231/26, etc.
    const suffixPattern = tnSuffix ? `%/${tnSuffix}` : '%'

    const [{ data: existingContracts }, { data: existingSamples }] = await Promise.all([
      supabase.from('sample_contracts').select('tracking_number').like('tracking_number', suffixPattern),
      supabase.from('samples').select('tracking_number').like('tracking_number', suffixPattern).is('deleted_at', null),
    ])

    let maxNum = parseInt(tnNumStr) || 0
    const allTrackingNumbers = [
      ...(existingContracts || []).map((r: any) => r.tracking_number),
      ...(existingSamples || []).map((r: any) => r.tracking_number),
    ]
    for (const ecStr of allTrackingNumbers) {
      if (!ecStr) continue
      const ecSlash = ecStr.lastIndexOf('/')
      const ecLeft = ecSlash >= 0 ? ecStr.substring(0, ecSlash) : ecStr
      const ecDash = ecLeft.lastIndexOf('-')
      const ecNumStr = ecDash >= 0 ? ecLeft.substring(ecDash + 1) : ecLeft
      const ecNum = parseInt(ecNumStr) || 0
      if (ecNum >= maxNum) maxNum = ecNum + 1
    }

    // Build the final tracking number
    const finalNumStr = maxNum.toString().padStart(tnNumLen, '0')
    const finalLeft = tnPrefix ? `${tnPrefix}-${finalNumStr}` : finalNumStr
    const trackingNumber = tnSuffix ? `${finalLeft}/${tnSuffix}` : finalLeft

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
      tracking_number: trackingNumber,
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

    if (insertError) {
      console.error('Error creating sub-contract:', insertError)
      return NextResponse.json({ error: 'Failed to create sub-contract', details: insertError.message }, { status: 500 })
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
        const subCertNumber = isRejected
          ? `R-${contract.tracking_number}`
          : contract.tracking_number

        // Get issued_to from mother sample's client
        const { data: motherSample } = await supabase
          .from('samples')
          .select('client_id, clients!samples_client_id_fkey(fantasy_name, company)')
          .eq('id', sampleId)
          .single()

        const motherClient = motherSample?.clients as { fantasy_name?: string; company?: string } | null
        let issuedTo = motherClient?.fantasy_name || motherClient?.company || 'Unknown Client'

        // If sub-contract has a different QC client, use that name
        if (contract.client_id && contract.client_id !== motherSample?.client_id) {
          const { data: subClient } = await supabase
            .from('clients')
            .select('fantasy_name, company')
            .eq('id', contract.client_id)
            .single()
          if (subClient) {
            issuedTo = subClient.fantasy_name || subClient.company || issuedTo
          }
        }

        await supabase
          .from('certificates')
          .insert({
            sample_id: sampleId,
            sample_contract_id: contract.id,
            certificate_number: subCertNumber,
            issued_to: issuedTo,
            issued_by: user.id,
            status: 'issued',
            valid_from: motherCert.valid_from,
            valid_until: motherCert.valid_until,
            is_rejected: isRejected,
          })
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
    await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const contractId = request.nextUrl.searchParams.get('contract_id')
    if (!contractId) {
      return NextResponse.json({ error: 'Missing contract_id query parameter' }, { status: 400 })
    }

    const body = await request.json()

    const allowedFields = [
      'wolthers_contract_nr', 'seller_contract_nr', 'shipper_contract_nr',
      'buyer_contract_nr', 'roaster_contract_nr', 'qc_client_contract_nr',
      'end_client_contract_nr', 'supplier_contract_nr', 'ico_number', 'container_nr',
      'importer_id', 'importer_is_qc_client', 'roaster_id', 'end_client_id', 'client_id',
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
