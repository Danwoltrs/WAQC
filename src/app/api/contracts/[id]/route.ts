// src/app/api/contracts/[id]/route.ts
//
// GET /api/contracts/:id
// Returns a full contract joined to companies + entity-resolution payload
// (which WAQC client/importer/exporters match the contract's seller/buyer).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import type { ContractWithParties, ContractResolution } from '@/lib/contract-intake-mapping'

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

    // Buyer / end-client → WAQC clients via clients.company_id FK.
    // Prefer is_qc_client=true if multiple clients are linked to the same company.
    let resolved_client_id: string | null = null
    let importer_is_qc_client = false
    if (c.buyer_id) {
      const { data: clientRow } = await (supabase as any)
        .from('clients')
        .select('id, is_qc_client')
        .eq('company_id', c.buyer_id)
        .order('is_qc_client', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (clientRow) {
        resolved_client_id = clientRow.id
        importer_is_qc_client = !!clientRow.is_qc_client
      }
    }

    // Buyer fantasy_name → WAQC importers table (name-based fallback).
    let resolved_importer_id: string | null = null
    const buyerName = c.buyer?.fantasy_name || c.buyer?.name
    if (buyerName) {
      const { data: importerRow } = await (supabase as any)
        .from('importers')
        .select('id')
        .ilike('name', `%${buyerName}%`)
        .limit(1)
        .maybeSingle()
      if (importerRow) resolved_importer_id = importerRow.id
    }

    // Seller / shipper → WAQC exporters (name-based; can return multiple matches).
    const lookupExporters = async (name: string | null | undefined): Promise<string[]> => {
      if (!name) return []
      const { data } = await (supabase as any)
        .from('exporters')
        .select('id')
        .ilike('name', name)
        .limit(5)
      return (data || []).map((r: any) => r.id)
    }
    const sellerName = c.seller?.fantasy_name || c.seller?.name
    const shipperName = c.shipper?.fantasy_name || c.shipper?.name
    const sameAsSeller = !c.shipper_id || c.shipper_id === c.seller_id

    const candidate_seller_exporter_ids = await lookupExporters(sellerName)
    const candidate_shipper_exporter_ids = sameAsSeller ? [] : await lookupExporters(shipperName)

    const resolution: ContractResolution = {
      resolved_client_id,
      importer_is_qc_client,
      resolved_importer_id,
      candidate_seller_exporter_ids,
      candidate_shipper_exporter_ids,
      multiple_seller_matches: candidate_seller_exporter_ids.length > 1,
      multiple_shipper_matches: candidate_shipper_exporter_ids.length > 1,
    }

    return NextResponse.json({ contract: c, resolution })
  } catch (err: any) {
    console.error('[contracts/[id]] unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}
