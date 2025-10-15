import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/micro-regions
 * List all active micro-regions, optionally filtered by origin
 * Query params: origin (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const origin = searchParams.get('origin')

    // Use rpc to avoid TypeScript depth issues
    // @ts-ignore - Function exists but types not regenerated yet
    const { data: regions, error } = await supabase.rpc('get_active_micro_regions', {
      p_origin: origin
    })

    if (error) {
      console.error('Error fetching micro-regions:', error)
      return NextResponse.json({ error: 'Failed to fetch micro-regions' }, { status: 500 })
    }

    return NextResponse.json({ regions })
  } catch (error) {
    console.error('Error in GET /api/micro-regions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
