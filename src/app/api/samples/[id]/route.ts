import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Database } from '@/lib/database.types'
import { isUUID, slugToTrackingNumber } from '@/lib/utils'
import { resolveSampleId } from '@/lib/sample-utils'
import { invalidateCertificatePdf } from '@/lib/certificate-storage'
import { authorizeSampleEdit } from '@/lib/sample-edit-permissions'

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

    // Optional sub-contract context: when present, the response is overridden
    // with that sub-contract's parties/refs/number (the detail modal opened
    // from a sub-contract row should show the sub-contract, not the mother).
    const contractId = request.nextUrl.searchParams.get('contract_id')

    // Determine if id is a UUID or tracking number slug
    const lookupByUUID = isUUID(id)
    const trackingNumber = lookupByUUID ? null : slugToTrackingNumber(id)

    // All counterparty joins now resolve to the canonical `companies` table
    // (post-consolidation, migration 20260528000004). Legacy field names are
    // preserved via PostgREST aliases (company:name, client_types:company_types)
    // so downstream consumers don't need to know about the rename.
    let query = (supabase as any)
      .from('samples')
      .select(`
        *,
        quality_spec:client_qualities(custom_name, quality_code),
        seller:companies!samples_seller_id_fkey(id, name, fantasy_name, country),
        exporter:companies!samples_exporter_id_fkey(id, name, fantasy_name, country),
        importer:companies!samples_importer_id_fkey(id, name, fantasy_name, country),
        roaster:companies!samples_roaster_id_fkey(id, name, fantasy_name, country),
        client:companies!samples_client_id_fkey(id, name, company:name, fantasy_name, country, client_types:company_types),
        end_client:companies!samples_end_client_id_fkey(id, name, company:name, fantasy_name, country),
        certificate:certificates(id, certificate_number, status, created_at, sample_contract_id),
        sample_recipients(id, client_id, contact_emails, status, comments, sent_at, responded_at, responded_by, created_at, updated_at, client:companies!sample_recipients_client_id_fkey(id, name, company:name, fantasy_name, country, email))
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
          seller:companies!samples_seller_id_fkey(id, name, country),
          exporter:companies!samples_exporter_id_fkey(id, name, country),
          importer:companies!samples_importer_id_fkey(id, name, country),
          roaster:companies!samples_roaster_id_fkey(id, name, country),
          client:companies!samples_client_id_fkey(id, name, company:name, fantasy_name, country, client_types:company_types),
          end_client:companies!samples_end_client_id_fkey(id, name, company:name, fantasy_name, country),
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

    // Handle certificate array - a sample with sub-contracts has many cert rows
    // (mother + one per sub-contract). Prefer the mother (sample_contract_id
    // NULL); the contractId branch below overrides with the sub-contract's cert.
    const allCerts: any[] = Array.isArray(sample.certificate)
      ? sample.certificate
      : sample.certificate ? [sample.certificate] : []
    const certificate = allCerts.find((c: any) => c.sample_contract_id === null) || allCerts[0] || null

    // Transform sample to include flattened entity names (matching list API format)
    const transformedSample = {
      ...sample,
      // Prefer sample's own quality_name (for type samples or custom entries),
      // fall back to quality_spec's custom_name
      quality_name: sample.quality_name || sample.quality_spec?.custom_name || null,
      quality_code: sample.quality_spec?.quality_code || null,
      // Seller (farm/producer) from seller_id — prefer fantasy (trade) name
      seller_name: sample.seller?.fantasy_name || sample.seller?.name || null,
      seller_country: sample.seller?.country || null,
      // Exporter/Shipper from exporter_id
      exporter_name: sample.exporter?.fantasy_name || sample.exporter?.name || null,
      exporter_country: sample.exporter?.country || null,
      // Use importer from DB, or fall back to client if they're an importer type
      importer_name: sample.importer?.fantasy_name || sample.importer?.name || (isImporterClient ? clientName : null),
      importer_country: sample.importer?.country || null,
      // Use roaster from DB, or fall back to client if they're a roaster type
      roaster_name: sample.roaster?.fantasy_name || sample.roaster?.name || (isRoasterClient ? clientName : null),
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

    // Sub-contract override: replace commercial fields with the sub-contract's
    // own values so the detail modal reflects the clicked contract (number,
    // importer/roaster, buyer ref, quantity) while keeping shared quality data.
    if (contractId) {
      const { data: sc } = await (supabase as any)
        .from('sample_contracts')
        .select(`
          id, tracking_number, importer_id, roaster_id, end_client_id, client_id,
          importer_is_qc_client, buyer_contract_nr, wolthers_contract_nr,
          roaster_contract_nr, end_client_contract_nr, qc_client_contract_nr,
          supplier_contract_nr, ico_number, container_nr, bags_quantity_mt,
          importer:companies!sample_contracts_importer_id_fkey(id, name, fantasy_name, country),
          roaster:companies!sample_contracts_roaster_id_fkey(id, name, fantasy_name, country),
          end_client:companies!sample_contracts_end_client_id_fkey(id, name, fantasy_name, country),
          qc_client:companies!sample_contracts_client_id_fkey(id, name, fantasy_name, country, client_types:company_types)
        `)
        .eq('id', contractId)
        .maybeSingle()

      if (sc) {
        const dn = (c: any) => c?.fantasy_name || c?.name || null
        const scQc = sc.qc_client
        const scQcName = dn(scQc)
        const scTypes: string[] = scQc?.client_types || []
        const scIsImporterClient = scTypes.some((t: string) => t.includes('importer'))
        const scIsRoasterClient = scTypes.some((t: string) => t.includes('roaster'))

        // Sub-contract certificate (its own minted number), if any
        const { data: scCert } = await supabase
          .from('certificates')
          .select('id, certificate_number, status, created_at')
          .eq('sample_contract_id', contractId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        Object.assign(transformedSample, {
          // Identity / quantity for this contract
          tracking_number: sc.tracking_number ?? transformedSample.tracking_number,
          bags_quantity_mt: sc.bags_quantity_mt ?? transformedSample.bags_quantity_mt,
          ico_number: sc.ico_number ?? transformedSample.ico_number,
          container_nr: sc.container_nr ?? transformedSample.container_nr,
          // Parties (prefer fantasy names), with QC-client fallback like the cert
          importer_id: sc.importer_id ?? null,
          importer_name: dn(sc.importer) || (sc.importer_is_qc_client ? scQcName : null) || (scIsImporterClient ? scQcName : null),
          importer_country: sc.importer?.country ?? null,
          roaster_id: sc.roaster_id ?? null,
          roaster_name: dn(sc.roaster) || (scIsRoasterClient ? scQcName : null),
          roaster_country: sc.roaster?.country ?? null,
          end_client_id: sc.end_client_id ?? null,
          end_client_name: dn(sc.end_client),
          qc_client_name: scQcName ?? transformedSample.qc_client_name,
          // Refs
          wolthers_contract_nr: sc.wolthers_contract_nr ?? null,
          buyer_contract_nr: sc.buyer_contract_nr ?? null,
          roaster_contract_nr: sc.roaster_contract_nr ?? null,
          end_client_contract_nr: sc.end_client_contract_nr ?? null,
          qc_client_contract_nr: sc.qc_client_contract_nr ?? null,
          supplier_contract_nr: sc.supplier_contract_nr ?? null,
          importer_is_qc_client: sc.importer_is_qc_client ?? transformedSample.importer_is_qc_client,
          // Certificate for this contract
          certificate_id: scCert?.id ?? null,
          certificate_number: scCert?.certificate_number ?? sc.tracking_number ?? null,
          certificate_status: scCert?.status ?? null,
          certificate_created_at: scCert?.created_at ?? null,
          // Marks the payload as a sub-contract view (modal locks party editing)
          sub_contract_id: sc.id,
        })
      }
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

    // Validate that sample exists first (include lock fields for authorization)
    const { data: existingSample, error: fetchError } = await (supabase as any)
      .from('samples')
      .select('id, tracking_number, workflow_stage, locked, scanned_at, certificate_generated_at')
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
      'supplier_contract_nr',
      'quality_name',
      'crop_year',
      'certifications',
      'exporter_sample_number',
      // Sample number (also the certificate number). Freely editable by editors;
      // cascaded to the certificate record below so the two never diverge.
      'tracking_number',
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field as keyof SampleUpdate] = body[field]
      }
    }

    // Authorize: only master cuppers / global admins may edit; lock-sensitive
    // (quality) fields are rejected once the content lock applies.
    const { data: editorProfile } = await supabase
      .from('profiles')
      .select('is_master_cupper, is_global_admin, qc_role')
      .eq('id', user.id)
      .single()

    const auth = authorizeSampleEdit({
      profile: editorProfile,
      sample: existingSample,
      changedFields: Object.keys(updateData),
    })
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
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

    // Cascade a sample-number change to the mother certificate so the two never
    // diverge (the certificate number mirrors the sample's tracking number).
    // Scoped by the OLD number so sub-contract certs (different numbers) are untouched.
    if (
      body.tracking_number !== undefined &&
      existingSample.tracking_number &&
      body.tracking_number !== existingSample.tracking_number
    ) {
      await supabase
        .from('certificates')
        .update({ certificate_number: body.tracking_number })
        .eq('sample_id', id)
        .eq('certificate_number', existingSample.tracking_number)
    }

    // Invalidate cached certificate PDF if certificate-relevant fields changed.
    // Must include every field the certificate renders (see quality-certificate
    // + certificate-data), otherwise the cached PDF goes stale after an edit.
    const certFields = [
      'container_nr', 'wolthers_contract_nr', 'buyer_contract_nr', 'exporter_contract_nr',
      'roaster_contract_nr', 'seller_contract_nr', 'shipper_contract_nr', 'qc_client_contract_nr',
      'exporter_id', 'importer_id', 'roaster_id', 'seller_id', 'origin', 'bags',
      'bag_type', 'bag_weight_kg', 'bags_quantity_mt', 'bag_count', 'equivalent_60kg_bags',
      'end_client_id', 'end_client_contract_nr', 'quality_spec_id',
      // Quality / processing / certifications and other rendered fields
      'quality_name', 'processing_method', 'certifications', 'crop_year',
      'micro_origin', 'sample_type', 'ico_number', 'shipment_month',
    ]
    const hasCertFieldChange = certFields.some((f) => body[f] !== undefined)
    if (hasCertFieldChange) {
      invalidateCertificatePdf(supabase, id).catch(() => {})
    }

    // Re-evaluate certificate when quality_spec_id changes
    if (body.quality_spec_id !== undefined) {
      try {
        const { data: cert } = await supabase
          .from('certificates')
          .select('id, approved, is_rejected, status')
          .eq('sample_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (cert) {
          if (cert.approved && !cert.is_rejected) {
            // Approved cert with changed quality → mark rejected for re-evaluation
            await supabase
              .from('certificates')
              .update({
                is_rejected: true,
                approved: false,
                override_comment: 'Quality spec changed, re-evaluation required',
              })
              .eq('id', cert.id)
          } else if (cert.is_rejected) {
            // Already rejected cert with changed quality → flag for re-review
            await supabase
              .from('certificates')
              .update({
                override_comment: 'Quality spec changed, re-review recommended',
              })
              .eq('id', cert.id)
          }
        }
      } catch (certError) {
        console.error('Error re-evaluating certificate after quality change:', certError)
        // Non-blocking: sample update still succeeded
      }
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
      .select('id, tracking_number, deleted_at, workflow_stage')
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

    // Certified/rejected samples cannot be deleted — they hold a permanent certificate number.
    // They can only be archived or voided. Gaps in certificate sequences are acceptable.
    if (existingSample.workflow_stage === 'certified' || existingSample.workflow_stage === 'rejected') {
      return NextResponse.json({
        error: 'Cannot delete a certified sample. Certified samples can only be archived or voided. The certificate number is permanently retired.'
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
