import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/finance/reports/client-billing
 * Get client billing summary report
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const hasOriginPricing = searchParams.get('has_origin_pricing')

    let query = supabase
      .from('client_billing_summary')
      .select('*')
      .order('total_billable_amount', { ascending: false })

    if (hasOriginPricing === 'true') {
      query = query.eq('has_origin_pricing', true)
    } else if (hasOriginPricing === 'false') {
      query = query.eq('has_origin_pricing', false)
    }

    const { data: clientSummaries, error } = await query

    if (error) {
      console.error('Error fetching client billing summary:', error)
      return NextResponse.json({ error: 'Failed to fetch billing summary' }, { status: 500 })
    }

    // Calculate totals
    const totals = {
      total_clients: clientSummaries?.length || 0,
      total_samples: clientSummaries?.reduce((sum, c) => sum + (c.total_samples || 0), 0) || 0,
      total_billable: clientSummaries?.reduce((sum, c) => sum + (c.total_billable_amount || 0), 0) || 0,
      total_potential: clientSummaries?.reduce((sum, c) => sum + (c.total_potential_amount || 0), 0) || 0,
    }

    return NextResponse.json({
      clients: clientSummaries || [],
      totals,
    })
  } catch (error) {
    console.error('Error in GET /api/finance/reports/client-billing:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
