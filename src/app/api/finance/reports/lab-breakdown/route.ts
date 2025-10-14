import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/finance/reports/lab-breakdown
 * Get per-lab breakdown of samples and approval rates
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: labBreakdown, error } = await supabase
      .from('lab_sample_breakdown')
      .select('*')
      .order('total_samples', { ascending: false })

    if (error) {
      console.error('Error fetching lab breakdown:', error)
      return NextResponse.json({ error: 'Failed to fetch lab breakdown' }, { status: 500 })
    }

    // Calculate totals
    const totals = {
      total_labs: labBreakdown?.length || 0,
      total_samples: labBreakdown?.reduce((sum, l) => sum + (l.total_samples || 0), 0) || 0,
      total_approved: labBreakdown?.reduce((sum, l) => sum + (l.approved_samples || 0), 0) || 0,
      total_rejected: labBreakdown?.reduce((sum, l) => sum + (l.rejected_samples || 0), 0) || 0,
      overall_approval_rate: 0,
    }

    if (totals.total_samples > 0) {
      totals.overall_approval_rate = parseFloat(
        ((totals.total_approved / totals.total_samples) * 100).toFixed(2)
      )
    }

    return NextResponse.json({
      laboratories: labBreakdown || [],
      totals,
    })
  } catch (error) {
    console.error('Error in GET /api/finance/reports/lab-breakdown:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
