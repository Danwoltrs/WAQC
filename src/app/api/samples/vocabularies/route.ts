import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/samples/vocabularies
 * Distinct, non-blank processing methods already saved across samples — so a
 * value added via the Processing picker's "+ add new" shows up as a choice later.
 * (Crop year is date-generated client-side and needs no endpoint.)
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('samples')
      .select('processing_method')
      .not('processing_method', 'is', null)
    if (error) {
      console.error('[vocabularies] query error:', error)
      return NextResponse.json({ error: 'Failed to load vocabularies' }, { status: 500 })
    }

    const set = new Set<string>()
    for (const row of data || []) {
      const v = ((row as any).processing_method || '').trim()
      if (v) set.add(v)
    }
    const processing_methods = [...set].sort((a, b) => a.localeCompare(b))
    return NextResponse.json({ processing_methods })
  } catch (error: any) {
    console.error('Error in GET /api/samples/vocabularies:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
