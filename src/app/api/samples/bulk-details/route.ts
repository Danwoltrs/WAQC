import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { isLabUnit, labSourceId, sortGroup, type GroupMember } from '@/lib/sample-group'

/**
 * POST /api/samples/bulk-details
 * Fetch multiple samples with complete relations for cupping card printing
 * Body: { sample_ids: string[] }
 *
 * A cupping card is scored once per PHYSICAL sample, so the cards are built
 * for lab units: a contract sibling in the request resolves to its lab unit,
 * and every sibling of a lab unit comes back under `siblings` so the card can
 * list the whole group's contract numbers.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { sample_ids } = body

    if (!sample_ids || !Array.isArray(sample_ids) || sample_ids.length === 0) {
      return NextResponse.json(
        { error: 'sample_ids must be a non-empty array' },
        { status: 400 }
      )
    }

    // Fetch samples with all necessary relations for cupping cards
    // Exclude soft-deleted samples
    const SAMPLE_SELECT = `
        id,
        lab_source_sample_id,
        contract_ordinal,
        tracking_number,
        sample_type,
        ico_number,
        container_nr,
        wolthers_contract_nr,
        exporter_sample_number,
        origin,
        exporter_legacy,
        exporter_id,
        client_id,
        quality_spec_id,
        laboratory_id,
        created_at,
        client:companies!samples_client_id_fkey(
          id,
          name,
          company:name,
          fantasy_name
        ),
        exporter:companies!samples_exporter_id_fkey(
          id,
          name
        ),
        laboratory:laboratories!samples_laboratory_id_fkey(
          id,
          name,
          code
        ),
        quality_spec:client_qualities!samples_quality_spec_id_fkey(
          id,
          template_id,
          custom_name,
          custom_parameters,
          cups_per_sample,
          template:quality_templates!client_qualities_template_id_fkey(
            id,
            name,
            parameters,
            methodology
          )
        )
      `
    const { data: requested, error } = await supabase
      .from('samples')
      .select(SAMPLE_SELECT)
      .in('id', sample_ids)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching sample details:', error)
      return NextResponse.json(
        { error: 'Failed to fetch sample details', details: error.message },
        { status: 500 }
      )
    }

    // Lab units the request reached only through a sibling.
    const rows = (requested || []) as unknown as GroupMember[]
    const labUnitIds = [...new Set(rows.map(labSourceId))]
    const missingLabIds = labUnitIds.filter(id => !rows.some(r => r.id === id))
    let labUnits = rows.filter(isLabUnit)
    if (missingLabIds.length > 0) {
      const { data: extra, error: extraError } = await supabase
        .from('samples')
        .select(SAMPLE_SELECT)
        .in('id', missingLabIds)
        .is('deleted_at', null)
      if (extraError) {
        console.error('Error fetching lab units for sample details:', extraError)
        return NextResponse.json(
          { error: 'Failed to fetch sample details', details: extraError.message },
          { status: 500 }
        )
      }
      labUnits = [...labUnits, ...((extra || []) as unknown as GroupMember[])]
        .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
    }

    // Every sibling of every lab unit, so the card lists the whole group's
    // contract numbers. A sibling removed on its own is soft-deleted alone.
    const { data: siblingRows, error: siblingError } = await supabase
      .from('samples')
      .select('id, lab_source_sample_id, contract_ordinal, created_at, tracking_number, ico_number, container_nr, wolthers_contract_nr, buyer_contract_nr, exporter_sample_number, importer_id, client_id')
      .in('lab_source_sample_id', labUnits.map(s => s.id))
      .is('deleted_at', null)

    if (siblingError) {
      console.error('Error fetching contract siblings for sample details:', siblingError)
      return NextResponse.json(
        { error: 'Failed to fetch sample details', details: siblingError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      samples: labUnits,
      siblings: sortGroup((siblingRows || []) as GroupMember[]),
    })
  } catch (error: any) {
    console.error('Error in POST /api/samples/bulk-details:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error.message || String(error)
      },
      { status: 500 }
    )
  }
}
