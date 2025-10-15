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

    // Build query with conditional origin filter
    const { data: regions, error } = origin
      ? await supabase
          .from('micro_regions')
          .select('*')
          .eq('is_active', true)
          .eq('origin', origin)
          .order('origin', { ascending: true })
          .order('display_order', { ascending: true })
      : await supabase
          .from('micro_regions')
          .select('*')
          .eq('is_active', true)
          .order('origin', { ascending: true })
          .order('display_order', { ascending: true })

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

/**
 * POST /api/micro-regions
 * Create a new micro-region (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('qc_role')
      .eq('id', user.id)
      .single()

    if (!profile || !['global_admin', 'global_quality_admin'].includes(profile.qc_role)) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    const body = await request.json()

    // Validate required fields
    if (!body.origin || !body.region_name_en) {
      return NextResponse.json({
        error: 'Missing required fields: origin and region_name_en'
      }, { status: 400 })
    }

    // Insert micro-region
    const { data: region, error: insertError } = await supabase
      .from('micro_regions')
      .insert({
        origin: body.origin,
        region_name_en: body.region_name_en,
        region_name_pt: body.region_name_pt || body.region_name_en,
        region_name_es: body.region_name_es || body.region_name_en,
        parent_region: body.parent_region || null,
        altitude_min: body.altitude_min || null,
        altitude_max: body.altitude_max || null,
        description_en: body.description_en || null,
        description_pt: body.description_pt || null,
        description_es: body.description_es || null,
        display_order: body.display_order || 0,
        is_active: body.is_active !== undefined ? body.is_active : true
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error creating micro-region:', insertError)
      return NextResponse.json({
        error: 'Failed to create micro-region',
        details: insertError.message
      }, { status: 500 })
    }

    return NextResponse.json({ region }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/micro-regions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
