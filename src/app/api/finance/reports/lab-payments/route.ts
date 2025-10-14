import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/finance/reports/lab-payments
 * Get 3rd party lab payment summary report
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: labSummaries, error } = await supabase
      .from('lab_payment_summary')
      .select('*')
      .order('total_owed_amount', { ascending: false })

    if (error) {
      console.error('Error fetching lab payment summary:', error)
      return NextResponse.json({ error: 'Failed to fetch payment summary' }, { status: 500 })
    }

    // Calculate totals
    const totals = {
      total_labs: labSummaries?.length || 0,
      total_samples: labSummaries?.reduce((sum, l) => sum + (l.total_samples || 0), 0) || 0,
      total_owed: labSummaries?.reduce((sum, l) => sum + (l.total_owed_amount || 0), 0) || 0,
      total_potential: labSummaries?.reduce((sum, l) => sum + (l.total_potential_amount || 0), 0) || 0,
    }

    return NextResponse.json({
      laboratories: labSummaries || [],
      totals,
    })
  } catch (error) {
    console.error('Error in GET /api/finance/reports/lab-payments:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
