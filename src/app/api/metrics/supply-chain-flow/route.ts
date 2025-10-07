import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  try {
    // Log cookies for debugging
    const allCookies = request.cookies.getAll()
    console.log('Request cookies:', allCookies.map(c => c.name))
    console.log('Supabase cookies:', allCookies.filter(c => c.name.includes('sb-')).map(c => c.name))

    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams

    // Get filters from query params
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : new Date().getFullYear()
    const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : null
    const laboratoryId = searchParams.get('laboratoryId')
    const minBags = searchParams.get('minBags') ? parseInt(searchParams.get('minBags')!) : 0

    // Check authentication using getUser() which is more reliable for API routes
    console.log('Checking user...')
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    console.log('User result:', { hasUser: !!user, error: userError?.message })

    if (userError) {
      console.error('User error:', userError)
      return NextResponse.json({ error: 'Authentication error', details: userError.message }, { status: 401 })
    }

    if (!user) {
      console.error('No user found - not authenticated')
      return NextResponse.json({ error: 'Unauthorized', details: 'No authenticated user' }, { status: 401 })
    }

    console.log('User found:', user.id)

    // Get user profile for access control
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('Profile error:', profileError)
      return NextResponse.json({ error: 'Profile not found', details: profileError?.message }, { status: 403 })
    }

    if (!profile.qc_enabled) {
      console.error('QC not enabled for user:', user.id)
      return NextResponse.json({ error: 'Access denied', details: 'QC access not enabled' }, { status: 403 })
    }

    console.log('User has QC access, role:', profile.qc_role)

    // Build query for supply chain flow data
    let query = supabase
      .from('samples')
      .select('exporter, importer, roaster, bags, status, created_at')
      .not('exporter', 'is', null)
      .not('importer', 'is', null)
      .not('roaster', 'is', null)
      .in('status', ['approved', 'rejected'])
      .gte('bags', minBags)

    // Apply year filter
    if (year) {
      query = query
        .gte('created_at', `${year}-01-01`)
        .lt('created_at', `${year + 1}-01-01`)
    }

    // Apply month filter if provided
    if (month && month >= 1 && month <= 12) {
      const startDate = new Date(year, month - 1, 1)
      const endDate = new Date(year, month, 1)
      query = query
        .gte('created_at', startDate.toISOString())
        .lt('created_at', endDate.toISOString())
    }

    // Apply lab filter based on user role
    if (profile.qc_role === 'lab_personnel' ||
        profile.qc_role === 'lab_quality_manager' ||
        profile.qc_role === 'lab_finance_manager') {
      // Lab users see only their lab's data
      query = query.eq('laboratory_id', profile.laboratory_id)
    } else if (laboratoryId &&
               (profile.qc_role === 'global_admin' ||
                profile.qc_role === 'global_quality_admin' ||
                profile.qc_role === 'santos_hq_finance' ||
                profile.qc_role === 'global_finance_admin')) {
      // Global users can filter by specific lab
      query = query.eq('laboratory_id', laboratoryId)
    }

    const { data: samples, error } = await query

    if (error) throw error

    // Aggregate flow data
    const flowMap = new Map<string, {
      exporter: string
      importer: string
      roaster: string
      totalBags: number
      totalSamples: number
      approvedSamples: number
    }>()

    samples?.forEach(sample => {
      const key = `${sample.exporter}|${sample.importer}|${sample.roaster}`
      const existing = flowMap.get(key)

      if (existing) {
        existing.totalBags += sample.bags || 0
        existing.totalSamples += 1
        if (sample.status === 'approved') {
          existing.approvedSamples += 1
        }
      } else {
        flowMap.set(key, {
          exporter: sample.exporter,
          importer: sample.importer,
          roaster: sample.roaster,
          totalBags: sample.bags || 0,
          totalSamples: 1,
          approvedSamples: sample.status === 'approved' ? 1 : 0
        })
      }
    })

    // Convert to array and calculate approval rates
    const flows = Array.from(flowMap.values())
      .map(flow => ({
        ...flow,
        approvalRate: flow.totalSamples > 0
          ? Math.round((flow.approvedSamples / flow.totalSamples) * 100)
          : 0
      }))
      .sort((a, b) => b.totalBags - a.totalBags)
      .slice(0, 100) // Limit to top 100 flows to prevent overcrowding

    return NextResponse.json({
      flows,
      userRole: profile.qc_role,
      userId: user.id,
      filters: { year, month, laboratoryId, minBags }
    })

  } catch (error) {
    console.error('Error fetching supply chain flow:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch supply chain flow data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
