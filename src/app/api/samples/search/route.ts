// GET /api/samples/search?q=<text>&limit=20
// Lightweight server-side sample lookup for the Ctrl+K command palette.
// Matches a tracking number (= certificate number) or a Wolthers contract number,
// on the sample itself OR on any of its sub-contracts (a sample spanning several
// contracts is keyed in `sample_contracts`, so e.g. "42068" must still find its
// parent sample even when the sample's own number is "42067").
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { sanitizeOrTerm, buildOrIlike } from '@/lib/search/or-filter'

const SEARCH_FIELDS = ['tracking_number', 'wolthers_contract_nr']
// Sub-contract columns that mirror the sample-level search fields.
const SUB_SEARCH_FIELDS = ['tracking_number', 'wolthers_contract_nr']
// Cap the sub-contract scan; a handful of parent samples is plenty for a palette.
const SUB_SCAN_LIMIT = 100

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const q = (searchParams.get('q') || '').trim()
    const rawLimit = parseInt(searchParams.get('limit') || '20', 10)
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 20, 1), 50)

    const safeQ = sanitizeOrTerm(q)
    if (safeQ.length < 2) {
      return NextResponse.json({ samples: [] })
    }

    // Parent sample ids whose sub-contracts match the query (folded in below).
    const { data: subRows } = await (supabase as any)
      .from('sample_contracts')
      .select('sample_id')
      .or(buildOrIlike(SUB_SEARCH_FIELDS, safeQ))
      .limit(SUB_SCAN_LIMIT)
    const subSampleIds = [
      ...new Set(((subRows as Array<{ sample_id: string | null }> | null) ?? [])
        .map((r) => r.sample_id)
        .filter((id): id is string => !!id)),
    ]

    // One query: samples matching directly OR whose id came from a sub-contract.
    const orFilter = subSampleIds.length
      ? `${buildOrIlike(SEARCH_FIELDS, safeQ)},id.in.(${subSampleIds.join(',')})`
      : buildOrIlike(SEARCH_FIELDS, safeQ)

    const { data: samples, error } = await (supabase as any)
      .from('samples')
      .select('id, tracking_number, wolthers_contract_nr, origin, status')
      .or(orFilter)
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(limit)

    if (error) {
      console.error('[samples/search] query error:', error)
      return NextResponse.json({ error: 'Failed to search samples' }, { status: 500 })
    }

    return NextResponse.json({ samples: samples || [] })
  } catch (err: any) {
    console.error('[samples/search] unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}
