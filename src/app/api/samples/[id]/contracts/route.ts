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

    // Parse the mother sample's tracking number to derive the format for sub-contracts.
    // Sub-contracts share the same prefix (quality+origin code) and suffix (year).
    // Format: "AD1-890239/26" → prefix="AD1", num=890239, suffix="26"
    const motherTN = sample.tracking_number as string
    const slashIdx = motherTN.lastIndexOf('/')
    const tnSuffix = slashIdx >= 0 ? motherTN.substring(slashIdx + 1) : ''
    const tnLeft = slashIdx >= 0 ? motherTN.substring(0, slashIdx) : motherTN
    const dashIdx = tnLeft.lastIndexOf('-')
    const tnPrefix = dashIdx >= 0 ? tnLeft.substring(0, dashIdx) : ''
    const tnNumStr = dashIdx >= 0 ? tnLeft.substring(dashIdx + 1) : tnLeft
    const tnNumLen = tnNumStr.length

    // The sequence number is per client + per lab, shared across ALL quality prefixes.
    // Find the highest existing number in both samples and sample_contracts for this client+lab.
    const clientId = sample.client_id as string
    const laboratoryId = sample.laboratory_id as string | null

    // 1. All tracking numbers from samples for this QC client + lab
    let samplesQuery = supabase
      .from('samples')
      .select('id, tracking_number')
      .eq('client_id', clientId)

    if (laboratoryId) {
      samplesQuery = samplesQuery.eq('laboratory_id', laboratoryId)
    }

    const { data: clientSamples } = await samplesQuery

    const sampleTrackingNumbers = (clientSamples || []).map((s: any) => s.tracking_number)
    const clientSampleIds = (clientSamples || []).map((s: any) => s.id)

    // 2. All tracking numbers from sample_contracts for those samples
    let contractTrackingNumbers: string[] = []
    if (clientSampleIds.length > 0) {
      // Batch in chunks of 200 to avoid URL length limits
      for (let i = 0; i < clientSampleIds.length; i += 200) {
        const chunk = clientSampleIds.slice(i, i + 200)
        const { data: contracts } = await supabase
          .from('sample_contracts')
          .select('tracking_number')
          .in('sample_id', chunk)
        if (contracts) {
          contractTrackingNumbers.push(...contracts.map((c: any) => c.tracking_number))
        }
      }
    }

    // 3. Find the max sequence number across all tracking numbers.
    // Extract the sequence number as the last group of digits before the slash.
    // This correctly handles prefixes with digits (e.g., "AD1-890239/26" → 890239).
    let maxNum = parseInt(tnNumStr) || 0
    for (const ecStr of [...sampleTrackingNumbers, ...contractTrackingNumbers]) {
      if (!ecStr) continue
      const ecSlash = ecStr.lastIndexOf('/')
      const ecLeft = ecSlash >= 0 ? ecStr.substring(0, ecSlash) : ecStr
      const ecDash = ecLeft.lastIndexOf('-')
      const ecNumStr = ecDash >= 0 ? ecLeft.substring(ecDash + 1) : ecLeft
      const ecNum = parseInt(ecNumStr) || 0
      if (ecNum >= maxNum) maxNum = ecNum + 1
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

    // Insert with retry on duplicate key — increment sequence on each retry
    const MAX_CONTRACT_RETRIES = 5
    let contract: any = null

    for (let attempt = 0; attempt < MAX_CONTRACT_RETRIES; attempt++) {
      const currentNum = maxNum + attempt
      const finalNumStr = currentNum.toString().padStart(tnNumLen, '0')
      const finalLeft = tnPrefix ? `${tnPrefix}-${finalNumStr}` : finalNumStr
      const trackingNumber = tnSuffix ? `${finalLeft}/${tnSuffix}` : finalLeft

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

      const { data: insertedContract, error: insertError } = await supabase
        .from('sample_contracts')
        .insert(contractData)
        .select()
        .single()

      if (!insertError) {
        contract = insertedContract
        break
      }

      const isDuplicate = insertError.message?.includes('duplicate key') ||
        insertError.message?.includes('unique constraint') ||
        insertError.code === '23505'

      if (isDuplicate && attempt < MAX_CONTRACT_RETRIES - 1) {
        console.warn(`Duplicate tracking number ${trackingNumber} for sub-contract, retrying with incremented sequence...`)
        continue
      }

      console.error('Error creating sub-contract:', insertError)
      return NextResponse.json({ error: 'Failed to create sub-contract', details: insertError.message }, { status: 500 })
    }

    if (!contract) {
      return NextResponse.json({ error: 'Failed to create sub-contract after retries' }, { status: 500 })
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
