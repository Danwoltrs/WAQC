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
    const { data: trackingNumber, error: trackingError } = await supabase
      .rpc('generate_tracking_number', {
        p_client_id: sample.client_id,
        p_laboratory_id: sample.laboratory_id,
        p_origin: sample.origin,
        p_quality_template_id: sample.quality_spec_id,
        p_is_rejected: false,
        p_sample_type: sample.sample_type || 'pss'
      } as any)

    if (trackingError || !trackingNumber) {
      console.error('Error generating tracking number for sub-contract:', trackingError)
      return NextResponse.json({ error: 'Failed to generate tracking number' }, { status: 500 })
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
      tracking_number: String(trackingNumber),
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
      'importer_id', 'importer_is_qc_client', 'roaster_id', 'end_client_id', 'client_id'
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
