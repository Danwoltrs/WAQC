import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Database } from '@/lib/database.types'
import { isUUID, slugToTrackingNumber } from '@/lib/utils'
import { resolveSampleId } from '@/lib/sample-utils'
import { invalidateCertificatePdf } from '@/lib/certificate-storage'

type SampleUpdate = Database['public']['Tables']['samples']['Update']

/**
 * GET /api/samples/[id]
 * Get a single sample by ID (UUID) or tracking number slug
 * Supports: UUID like 89ed925b-65d2-4a1c-8dd3-db18447b4e4b
 * Or tracking number slug like SAK-048524_25 (converted from SAK-048524/25)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Await params (Next.js 15)
    const { id } = await params

    // Determine if id is a UUID or tracking number slug
    const lookupByUUID = isUUID(id)
    const trackingNumber = lookupByUUID ? null : slugToTrackingNumber(id)

    // Cast to any because TypeScript types don't recognize the seller FK
    // (two FKs to exporters table: exporter_id and seller_id)
    let query = (supabase as any)
      .from('samples')
      .select(`
        *,
        quality_spec:client_qualities(custom_name, quality_code),
        seller:exporters!samples_seller_id_fkey(id, name, country),
        exporter:exporters!samples_exporter_id_fkey(id, name, country),
        importer:importers(id, name, country),
        roaster:roasters(id, name, country),
        client:clients!samples_client_id_fkey(id, company, fantasy_name, country, client_types),
        end_client:clients!samples_end_client_id_fkey(id, company, fantasy_name, country),
        certificate:certificates(id, certificate_number, status, created_at)
      `)

    // Query by UUID or tracking number
    if (lookupByUUID) {
      query = query.eq('id', id)
    } else {
      query = query.eq('tracking_number', trackingNumber!)
    }

    let { data: sample, error } = await query.single()

    // If slug lookup returned no rows, try case-insensitive fallback
    if (!lookupByUUID && error?.code === 'PGRST116') {
      const fallbackQuery = (supabase as any)
        .from('samples')
        .select(`
          *,
          quality_spec:client_qualities(custom_name, quality_code),
          seller:exporters!samples_seller_id_fkey(id, name, country),
          exporter:exporters!samples_exporter_id_fkey(id, name, country),
          importer:importers(id, name, country),
          roaster:roasters(id, name, country),
          client:clients!samples_client_id_fkey(id, company, fantasy_name, country, client_types),
          end_client:clients!samples_end_client_id_fkey(id, company, fantasy_name, country),
          certificate:certificates(id, certificate_number, status, created_at)
        `)
        .ilike('tracking_number', trackingNumber!)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle()

      const fallbackResult = await fallbackQuery
      if (fallbackResult.data) {
        sample = fallbackResult.data
        error = null
      }
    }

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
      }
      console.error('Error fetching sample:', error)
      return NextResponse.json({ error: 'Failed to fetch sample' }, { status: 500 })
    }

    // Check if client is a roaster type (roaster_final_buyer, roaster, etc.)
    const clientObj = sample.client as { fantasy_name?: string; company?: string; country?: string; client_types?: string[] } | null
    const clientTypes = clientObj?.client_types || []
    const isRoasterClient = clientTypes.some((t: string) => t.includes('roaster'))
    const isImporterClient = clientTypes.some((t: string) => t.includes('importer'))
    const clientName = clientObj?.fantasy_name || clientObj?.company || null

    // Handle certificate array - Supabase returns array for one-to-many relations
    // A sample can have at most one certificate, so we take the first one
    const certificate = Array.isArray(sample.certificate)
      ? sample.certificate[0] || null
      : sample.certificate || null

    // Transform sample to include flattened entity names (matching list API format)
    const transformedSample = {
      ...sample,
      // Prefer sample's own quality_name (for type samples or custom entries),
      // fall back to quality_spec's custom_name
      quality_name: sample.quality_name || sample.quality_spec?.custom_name || null,
      quality_code: sample.quality_spec?.quality_code || null,
      // Seller (farm/producer) from seller_id
      seller_name: sample.seller?.name || null,
      seller_country: sample.seller?.country || null,
      // Exporter/Shipper from exporter_id
      exporter_name: sample.exporter?.name || null,
      exporter_country: sample.exporter?.country || null,
      // Use importer from DB, or fall back to client if they're an importer type
      importer_name: sample.importer?.name || (isImporterClient ? clientName : null),
      importer_country: sample.importer?.country || null,
      // Use roaster from DB, or fall back to client if they're a roaster type
      roaster_name: sample.roaster?.name || (isRoasterClient ? clientName : null),
      roaster_country: sample.roaster?.country || null,
      // QC Client (who hired Wolthers) from client_id
      qc_client_name: clientName,
      qc_client_country: clientObj?.country || null,
      // End client (final buyer) - when NULL, QC client IS the end client
      end_client_name: sample.end_client?.fantasy_name || sample.end_client?.company || null,
      end_client_country: sample.end_client?.country || null,
      // Certificate info (flattened)
      certificate_id: certificate?.id || null,
      certificate_number: certificate?.certificate_number || null,
      certificate_status: certificate?.status || null,
      certificate_created_at: certificate?.created_at || null,
      // Remove nested objects to keep response clean
      quality_spec: undefined,
      seller: undefined,
      exporter: undefined,
      importer: undefined,
      roaster: undefined,
      end_client: undefined,
      client: undefined,
      certificate: undefined
    }

    return NextResponse.json({ sample: transformedSample })
  } catch (error) {
    console.error('Error in GET /api/samples/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/samples/[id]
 * Update a sample (supports UUID or tracking number slug)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Await params (Next.js 15)
    const { id: idOrSlug } = await params

    // Resolve to UUID
    const { id, error: resolveError } = await resolveSampleId(supabase, idOrSlug)
    if (!id) {
      return NextResponse.json({ error: resolveError || 'Sample not found' }, { status: 404 })
    }

    const body = await request.json()

    // Validate that sample exists first
    const { data: existingSample, error: fetchError } = await supabase
      .from('samples')
      .select('id, workflow_stage')
      .eq('id', id)
      .single()

    if (fetchError || !existingSample) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    // Prepare update data
    const updateData: SampleUpdate = {}

    // Allow updating these fields
    const allowedFields = [
      'client_id',
      'laboratory_id',
      'quality_spec_id',
      'origin',
      'micro_origin',
      'supplier',
      'status',
      'storage_position',
      'contract_number',
      'wolthers_contract_nr',
      'exporter_contract_nr',
      'buyer_contract_nr',
      'roaster_contract_nr',
      'seller_contract_nr',
      'shipper_contract_nr',
      'qc_client_contract_nr',
      'ico_number',
      'container_nr',
      'sample_type',
      'bags',
      'bag_type',
      'bag_weight_kg',
      'bags_quantity_mt',
      'bag_count',
      'equivalent_60kg_bags',
      'shipment_month',
      'processing_method',
      'workflow_stage',
      'assigned_to',
      // Supply chain entity references
      'exporter_id',
      'importer_id',
      'roaster_id',
      'seller_id',
      'supplier_type',
      'same_seller_shipper',
      'importer_is_qc_client',
      'end_client_id',
      'end_client_contract_nr',
      'supplier_contract_nr'
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field as keyof SampleUpdate] = body[field]
      }
    }

    // Validate bag quantities if being updated
    if (updateData.bags_quantity_mt && updateData.bags_quantity_mt <= 0) {
      return NextResponse.json({ error: 'bags_quantity_mt must be positive' }, { status: 400 })
    }
    if (updateData.bag_count && updateData.bag_count <= 0) {
      return NextResponse.json({ error: 'bag_count must be positive' }, { status: 400 })
    }

    // Update sample
    const { data: sample, error: updateError } = await supabase
      .from('samples')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      // Check for workflow stage validation error
      if (updateError.message?.includes('Invalid workflow stage transition')) {
        return NextResponse.json({
          error: 'Invalid workflow stage transition',
          details: updateError.message
        }, { status: 400 })
      }

      console.error('Error updating sample:', updateError)
      return NextResponse.json({
        error: 'Failed to update sample',
        details: updateError.message
      }, { status: 500 })
    }

    // Invalidate cached certificate PDF if certificate-relevant fields changed
    const certFields = [
      'container_nr', 'wolthers_contract_nr', 'buyer_contract_nr', 'exporter_contract_nr',
      'roaster_contract_nr', 'seller_contract_nr', 'shipper_contract_nr', 'qc_client_contract_nr',
      'exporter_id', 'importer_id', 'roaster_id', 'seller_id', 'origin', 'bags',
      'bag_type', 'bag_weight_kg', 'bags_quantity_mt', 'bag_count', 'equivalent_60kg_bags',
      'end_client_id', 'end_client_contract_nr', 'quality_spec_id',
    ]
    const hasCertFieldChange = certFields.some((f) => body[f] !== undefined)
    if (hasCertFieldChange) {
      invalidateCertificatePdf(supabase, id).catch(() => {})
    }

    return NextResponse.json({ sample })
  } catch (error) {
    console.error('Error in PATCH /api/samples/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/samples/[id]
 * Soft delete a sample (global admins only, supports UUID or tracking number slug)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is a global admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_global_admin, qc_role')
      .eq('id', user.id)
      .single()

    if (!profile?.is_global_admin && profile?.qc_role !== 'global_admin') {
      return NextResponse.json({
        error: 'Forbidden: Only global admins can delete samples'
      }, { status: 403 })
    }

    // Await params (Next.js 15)
    const { id: idOrSlug } = await params

    // Resolve to UUID
    const { id, error: resolveError } = await resolveSampleId(supabase, idOrSlug)
    if (!id) {
      return NextResponse.json({ error: resolveError || 'Sample not found' }, { status: 404 })
    }

    // Check if sample exists and is not already deleted
    const { data: existingSample, error: fetchError } = await supabase
      .from('samples')
      .select('id, tracking_number, deleted_at')
      .eq('id', id)
      .single()

    if (fetchError || !existingSample) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    if (existingSample.deleted_at) {
      return NextResponse.json({
        error: 'Sample already deleted',
        deleted_at: existingSample.deleted_at
      }, { status: 400 })
    }

    // Soft delete the sample by setting deleted_at and deleted_by
    const { error: deleteError } = await supabase
      .from('samples')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user.id
      })
      .eq('id', id)

    if (deleteError) {
      console.error('Error soft deleting sample:', deleteError)
      return NextResponse.json({
        error: 'Failed to delete sample',
        details: deleteError.message
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Sample ${existingSample.tracking_number} deleted successfully`,
      deleted_by: user.id,
      deleted_at: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error in DELETE /api/samples/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
