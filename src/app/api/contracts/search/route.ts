// src/app/api/contracts/search/route.ts
//
// GET /api/contracts/search?q=<query>&limit=20
// Typeahead for the Contract Search step in sample intake.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const q = (searchParams.get('q') || '').trim()
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50)

    if (q.length < 2) {
      return NextResponse.json({ contracts: [] })
    }

    // Match against contract_number OR seller_reference OR buyer_reference so the user
    // can paste any of the three reference numbers shown on paperwork.
    const pattern = `%${q}%`
    const { data: contracts, error } = await (supabase as any)
      .from('contracts')
      .select(`
        id,
        contract_number,
        seller_reference,
        buyer_reference,
        contract_date,
        crop,
        volume_bags,
        bag_type,
        quality_description,
        shipment_period_start,
        seller:companies!contracts_seller_id_fkey(id, fantasy_name, name),
        buyer:companies!contracts_buyer_id_fkey(id, fantasy_name, name)
      `)
      .eq('status', 'active')
      .or(`contract_number.ilike.${pattern},seller_reference.ilike.${pattern},buyer_reference.ilike.${pattern}`)
      .order('contract_date', { ascending: false, nullsFirst: false })
      .limit(limit)

    if (error) {
      console.error('[contracts/search] query error:', error)
      return NextResponse.json({ error: 'Failed to search contracts' }, { status: 500 })
    }

    const ids: string[] = (contracts || []).map((c: any) => c.id)
    const sampleCounts: Record<string, number> = {}

    if (ids.length > 0) {
      const { data: samples, error: countErr } = await (supabase as any)
        .from('samples')
        .select('contract_id')
        .in('contract_id', ids)

      if (countErr) {
        console.warn('[contracts/search] sample-count query error (non-fatal):', countErr)
      } else {
        for (const row of samples || []) {
          if (!row.contract_id) continue
          sampleCounts[row.contract_id] = (sampleCounts[row.contract_id] || 0) + 1
        }
      }
    }

    const annotated = (contracts || []).map((c: any) => ({
      ...c,
      sample_count: sampleCounts[c.id] || 0,
    }))

    return NextResponse.json({ contracts: annotated })
  } catch (err: any) {
    console.error('[contracts/search] unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}
