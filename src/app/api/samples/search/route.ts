// GET /api/samples/search?q=<text>&limit=20
// Lightweight server-side sample lookup for the Ctrl+K command palette.
// Matches a tracking number (= certificate number) or a Wolthers contract number.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { sanitizeOrTerm, buildOrIlike } from '@/lib/search/or-filter'

const SEARCH_FIELDS = ['tracking_number', 'wolthers_contract_nr']

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

    const { data: samples, error } = await (supabase as any)
      .from('samples')
      .select('id, tracking_number, wolthers_contract_nr, origin, status')
      .or(buildOrIlike(SEARCH_FIELDS, safeQ))
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
