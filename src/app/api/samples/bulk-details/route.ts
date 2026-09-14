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
        contract_id,
        linked_pss_sample_id,
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
          name,
          fantasy_name
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
      .select('id, lab_source_sample_id, contract_ordinal, created_at, tracking_number, ico_number, container_nr, wolthers_contract_nr, contract_id, buyer_contract_nr, exporter_sample_number, importer_id, client_id')
      .in('lab_source_sample_id', labUnits.map(s => s.id))
      .is('deleted_at', null)

    if (siblingError) {
      console.error('Error fetching contract siblings for sample details:', siblingError)
      return NextResponse.json(
        { error: 'Failed to fetch sample details', details: siblingError.message },
        { status: 500 }
      )
    }

    // The card prints the Wolthers contract number top right. Since 2026-09-10
    // intake saves it only when typed, so a lot linked to a sys contract (or an
    // SS linked to a PSS that has one) would print without it. Resolve it for
    // the card only: typed number, else the linked contract's, else the PSS's.
    // A failed lookup costs the number on the card, never the print.
    type CardRow = GroupMember & {
      wolthers_contract_nr?: string | null
      contract_id?: string | null
      linked_pss_sample_id?: string | null
    }
    const units = labUnits as CardRow[]
    const sibs = (siblingRows || []) as CardRow[]

    const pssIds = [...new Set(units
      .filter(s => !s.wolthers_contract_nr && s.linked_pss_sample_id)
      .map(s => s.linked_pss_sample_id as string))]
    const pssById = new Map<string, CardRow>()
    if (pssIds.length > 0) {
      const { data, error: pssError } = await supabase
        .from('samples')
        .select('id, wolthers_contract_nr, contract_id')
        .in('id', pssIds)
      if (pssError) console.error('Error fetching linked PSS for card contract numbers:', pssError)
      for (const p of (data || []) as CardRow[]) pssById.set(p.id, p)
    }

    const contractIds = [...new Set([...units, ...sibs, ...pssById.values()]
      .filter(r => !r.wolthers_contract_nr && r.contract_id)
      .map(r => r.contract_id as string))]
    const contractNumber = new Map<string, string>()
    if (contractIds.length > 0) {
      const { data, error: contractError } = await supabase
        .from('contracts')
        .select('id, contract_number')
        .in('id', contractIds)
      if (contractError) console.error('Error fetching contracts for card contract numbers:', contractError)
      for (const c of data || []) if (c.contract_number) contractNumber.set(c.id, c.contract_number)
    }

    const ownNr = (r: CardRow | undefined) =>
      r?.wolthers_contract_nr || (r?.contract_id ? contractNumber.get(r.contract_id) : undefined) || null
    const withNr = (r: CardRow) => ({
      ...r,
      wolthers_contract_nr: ownNr(r)
        || (r.linked_pss_sample_id ? ownNr(pssById.get(r.linked_pss_sample_id)) : null),
    })

    return NextResponse.json({
      samples: units.map(withNr),
      siblings: sortGroup(sibs.map(r => ({ ...r, wolthers_contract_nr: ownNr(r) })) as GroupMember[]),
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
