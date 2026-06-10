// src/app/api/contracts/[id]/route.ts
//
// GET /api/contracts/:id
// Returns a full contract joined to companies + entity-resolution payload
// (which WAQC client/importer/exporters match the contract's seller/buyer).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import type { ContractWithParties, ContractResolution } from '@/lib/contract-intake-mapping'
import { matchQuality, type QualitySpecCandidate } from '@/lib/quality-matching'

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

    const { id } = await params
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: 'Invalid contract id' }, { status: 400 })
    }

    const { data: contract, error } = await (supabase as any)
      .from('contracts')
      .select(`
        id, contract_number, status, contract_date, crop,
        volume_bags, bag_type, bag_weight_kg,
        quality_description, shipment_period_start, shipment_period_end,
        seller_reference, buyer_reference, certifications,
        seller_id, buyer_id, shipper_id, end_buyer_id,
        seller:companies!contracts_seller_id_fkey(id, fantasy_name, name),
        buyer:companies!contracts_buyer_id_fkey(id, fantasy_name, name),
        shipper:companies!contracts_shipper_id_fkey(id, fantasy_name, name),
        end_buyer:companies!contracts_end_buyer_id_fkey(id, fantasy_name, name)
      `)
      .eq('id', id)
      .maybeSingle()

    if (error) {
      console.error('[contracts/[id]] query error:', error)
      return NextResponse.json({ error: 'Failed to load contract' }, { status: 500 })
    }
    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }

    const c = contract as ContractWithParties

    const buyerName = (c.buyer?.fantasy_name || c.buyer?.name || '').trim() || null
    const sellerName = (c.seller?.fantasy_name || c.seller?.name || '').trim() || null
    const shipperName = (c.shipper?.fantasy_name || c.shipper?.name || '').trim() || null
    const sameAsSeller = !c.shipper_id || c.shipper_id === c.seller_id

    // Escape Postgres LIKE wildcards so they can't widen the substring fallback.
    const escapeLike = (s: string) => s.replace(/[\\%_]/g, ch => `\\${ch}`)

    // Helper: try exact (ilike) first, then substring fallback (`%name%`) for
    // cases like contract says "Cooxupé" but WAQC has "Cooperativa Cooxupé".
    // Substring fallback requires name >= 4 chars to avoid pathological matches.
    const lookupOrCreateExporter = async (name: string | null): Promise<string[]> => {
      if (!name) return []
      // Match against companies that are sellers/exporters
      const exporterFilter = 'trading_roles.cs.["seller"],company_types.cs.{exporter}'
      const { data: exact } = await (supabase as any)
        .from('companies')
        .select('id')
        .or(exporterFilter)
        .ilike('name', name)
        .limit(5)
      if (exact && exact.length > 0) return exact.map((r: any) => r.id)

      if (name.length >= 4) {
        const { data: sub } = await (supabase as any)
          .from('companies')
          .select('id')
          .or(exporterFilter)
          .ilike('name', `%${escapeLike(name)}%`)
          .limit(5)
        if (sub && sub.length > 0) return sub.map((r: any) => r.id)
      }

      // No match anywhere — auto-create a stub company tagged as exporter/seller
      const { data: created, error: createErr } = await (supabase as any)
        .from('companies')
        .insert({
          name,
          company_types: ['exporter'],
          trading_roles: ['seller'],
          is_active: true,
          is_qc_client: false,
        })
        .select('id')
        .single()
      if (createErr || !created) {
        console.warn('[contracts/[id]] could not auto-create exporter for', name, createErr?.message)
        return []
      }
      return [created.id]
    }

    // Resolve buyer → WAQC client. Two strategies:
    //   1. clients.company_id FK (cleanest — but only set if someone manually linked the rows)
    //   2. fallback: clients.fantasy_name / clients.company ilike buyerName
    // When (2) succeeds, back-fill clients.company_id so future lookups skip the fallback.
    const resolveClient = async () => {
      // Post-consolidation: companies and "client" are the same UUID. If sys's
      // buyer_id already exists in companies, use it directly — no fuzzy name
      // matching needed when we have the canonical ID.
      if (c.buyer_id) {
        const { data } = await (supabase as any)
          .from('companies')
          .select('id, is_qc_client')
          .eq('id', c.buyer_id)
          .maybeSingle()
        if (data) return data
      }
      if (!buyerName) return null

      // Fallback by name — try fantasy_name then name on companies.
      const tryMatch = async (column: 'fantasy_name' | 'name', pattern: string) => {
        const { data } = await (supabase as any)
          .from('companies')
          .select('id, is_qc_client')
          .ilike(column, pattern)
          .order('is_qc_client', { ascending: false })
          .limit(1)
          .maybeSingle()
        return data
      }

      let match = await tryMatch('fantasy_name', buyerName)
      if (!match) match = await tryMatch('name', buyerName)
      if (!match && buyerName.length >= 4) {
        const wild = `%${escapeLike(buyerName)}%`
        match = await tryMatch('fantasy_name', wild) || await tryMatch('name', wild)
      }
      return match
    }

    // The resolution queries are independent (derived from the contract row),
    // so run them in parallel. Importer lookup-or-create is gated on whether
    // the buyer turned out to be a QC client — if so, no separate importer row.
    const [clientData, sellerIds, shipperIds] = await Promise.all([
      resolveClient(),
      lookupOrCreateExporter(sellerName),
      sameAsSeller ? Promise.resolve<string[]>([]) : lookupOrCreateExporter(shipperName),
    ])

    const resolved_client_id: string | null = clientData?.id ?? null
    const importer_is_qc_client: boolean = !!clientData?.is_qc_client

    // Quality auto-fill — only when a QC client resolved AND the contract carries a
    // free-text quality. Fetch that client's active specs and run the conservative
    // matcher. A 'high' confidence result pins the dropdown; anything else stays
    // manual (the free-text quality_name still flows through as before).
    let resolved_quality_spec_id: string | null = null
    let quality_match: ContractResolution['quality_match'] = null
    if (resolved_client_id && c.quality_description) {
      const { data: specRows, error: specErr } = await (supabase as any)
        .from('client_qualities')
        .select('id, custom_name, quality_code, template:quality_templates(name)')
        .eq('client_id', resolved_client_id)
        .eq('is_active', true)
      if (specErr) {
        console.warn('[contracts/[id]] could not load client_qualities for quality match:', specErr.message)
      }
      const candidates: QualitySpecCandidate[] = (specRows || []).map((r: any) => ({
        id: r.id,
        custom_name: r.custom_name ?? null,
        quality_code: r.quality_code ?? null,
        template_name: r.template?.name ?? null,
      }))
      quality_match = matchQuality(c.quality_description, candidates)
      resolved_quality_spec_id = quality_match.confidence === 'high' ? quality_match.spec_id : null
      if (quality_match.confidence !== 'high') {
        // Observability for tuning the abbreviation dict — logs the misses only.
        console.debug('[contracts/[id]] quality match not high:', {
          source: c.quality_description, confidence: quality_match.confidence, specs: candidates.length,
        })
      }
    }

    // Only resolve / auto-create an importer when the buyer isn't already a QC
    // client. Otherwise the QC client merges into the importer dropdown via the
    // is_qc_client toggle, and creating a duplicate importer row would clutter.
    let resolved_importer_id: string | null = null
    if (!resolved_client_id && buyerName) {
      const importerFilter = 'trading_roles.cs.["buyer"]'
      const { data: exactImporter } = await (supabase as any)
        .from('companies')
        .select('id')
        .filter('trading_roles', 'cs', '["buyer"]')
        .ilike('name', buyerName)
        .limit(1)
        .maybeSingle()
      if (exactImporter) {
        resolved_importer_id = exactImporter.id
      } else if (buyerName.length >= 4) {
        const { data: subImporter } = await (supabase as any)
          .from('companies')
          .select('id')
          .filter('trading_roles', 'cs', '["buyer"]')
          .ilike('name', `%${escapeLike(buyerName)}%`)
          .limit(1)
          .maybeSingle()
        if (subImporter) resolved_importer_id = subImporter.id
      }
      if (!resolved_importer_id) {
        const { data: created, error: createErr } = await (supabase as any)
          .from('companies')
          .insert({
            name: buyerName,
            trading_roles: ['buyer'],
            company_types: [],
            is_active: true,
            is_qc_client: false,
          })
          .select('id')
          .single()
        if (createErr || !created) {
          console.warn('[contracts/[id]] could not auto-create importer for', buyerName, createErr?.message)
        } else {
          resolved_importer_id = created.id
        }
      }
    }

    const candidate_seller_exporter_ids: string[] = sellerIds
    const candidate_shipper_exporter_ids: string[] = shipperIds

    const resolution: ContractResolution = {
      resolved_client_id,
      importer_is_qc_client,
      resolved_importer_id,
      candidate_seller_exporter_ids,
      candidate_shipper_exporter_ids,
      multiple_seller_matches: candidate_seller_exporter_ids.length > 1,
      multiple_shipper_matches: candidate_shipper_exporter_ids.length > 1,
      resolved_quality_spec_id,
      quality_match,
    }

    return NextResponse.json({ contract: c, resolution })
  } catch (err: any) {
    console.error('[contracts/[id]] unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}
