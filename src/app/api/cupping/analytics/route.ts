import { createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams

    // Get filter parameters
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const cupperId = searchParams.get('cupperId')
    const sessionType = searchParams.get('sessionType')
    const origin = searchParams.get('origin')
    const laboratoryId = searchParams.get('laboratoryId')

    // Fetch session summary statistics
    // Views not yet in database.types.ts - using any type
    let sessionQuery = (supabase as any)
      .from('session_summary_stats')
      .select('*')

    if (dateFrom) {
      sessionQuery = sessionQuery.gte('session_date', dateFrom)
    }
    if (dateTo) {
      sessionQuery = sessionQuery.lte('session_date', dateTo)
    }
    if (sessionType && sessionType !== 'all') {
      sessionQuery = sessionQuery.eq('session_type', sessionType)
    }
    if (laboratoryId) {
      sessionQuery = sessionQuery.eq('laboratory_id', laboratoryId)
    }

    const { data: sessionStats, error: sessionError } = await sessionQuery

    if (sessionError) {
      console.error('Error fetching session stats:', sessionError)
      return NextResponse.json(
        { error: 'Failed to fetch session statistics' },
        { status: 500 }
      )
    }

    // Fetch cupper performance statistics
    // Views not yet in database.types.ts - using any type
    let cupperQuery = (supabase as any)
      .from('cupper_performance_stats')
      .select('*')

    if (dateFrom) {
      cupperQuery = cupperQuery.gte('session_date', dateFrom)
    }
    if (dateTo) {
      cupperQuery = cupperQuery.lte('session_date', dateTo)
    }
    if (cupperId && cupperId !== 'all') {
      cupperQuery = cupperQuery.eq('cupper_id', cupperId)
    }
    if (laboratoryId) {
      cupperQuery = cupperQuery.eq('laboratory_id', laboratoryId)
    }

    const { data: cupperStats, error: cupperError } = await cupperQuery

    if (cupperError) {
      console.error('Error fetching cupper stats:', cupperError)
      return NextResponse.json(
        { error: 'Failed to fetch cupper statistics' },
        { status: 500 }
      )
    }

    // Fetch origin performance analysis
    // Views not yet in database.types.ts - using any type
    let originQuery = (supabase as any)
      .from('origin_performance_analysis')
      .select('*')

    if (origin && origin !== 'all') {
      originQuery = originQuery.eq('origin', origin)
    }
    if (laboratoryId) {
      originQuery = originQuery.eq('laboratory_id', laboratoryId)
    }

    const { data: originStats, error: originError } = await originQuery

    if (originError) {
      console.error('Error fetching origin stats:', originError)
      return NextResponse.json(
        { error: 'Failed to fetch origin statistics' },
        { status: 500 }
      )
    }

    // Get available filter options
    const { data: cuppers } = await supabase
      .from('profiles')
      .select('id, full_name')
      .order('full_name')

    const { data: origins } = await supabase
      .from('samples')
      .select('origin')
      .not('origin', 'is', null)
      .order('origin')

    // Get unique origins
    const uniqueOrigins = [...new Set(origins?.map(s => s.origin) || [])]

    return NextResponse.json({
      sessionStats: sessionStats || [],
      cupperStats: cupperStats || [],
      originStats: originStats || [],
      filterOptions: {
        cuppers: cuppers || [],
        origins: uniqueOrigins,
        sessionTypes: ['regular', 'calibration', 'digital', 'handwritten']
      }
    })
  } catch (error) {
    console.error('Error in analytics API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
