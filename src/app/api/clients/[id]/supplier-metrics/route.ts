import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/clients/[id]/supplier-metrics
 * Get top suppliers (sellers) for a client, with sample counts and approval rates.
 * Optional query param: quality_id - filter by quality spec
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: clientId } = await params
    const { searchParams } = new URL(request.url)
    const qualityId = searchParams.get('quality_id')

    // Build query: fetch samples with seller join, filtered by client.
    let query = supabase
      .from('samples')
      .select(`
        id,
        status,
        seller:companies!samples_seller_id_fkey(name, fantasy_name)
      `)
      .eq('client_id', clientId)
      .not('seller_id', 'is', null)
      .is('deleted_at', null)

    if (qualityId) {
      query = query.eq('quality_spec_id', qualityId)
    }

    const { data: samples, error } = await query

    if (error) {
      console.error('Error fetching supplier metrics:', error)
      return NextResponse.json({ error: 'Failed to fetch supplier metrics' }, { status: 500 })
    }

    // Aggregate by supplier name
    const supplierMap = new Map<string, { total: number; approved: number; rejected: number }>()

    for (const sample of samples || []) {
      // Fantasy name first, as everywhere else in the app.
      const seller = sample.seller as { name: string | null; fantasy_name: string | null } | null
      const name = seller?.fantasy_name?.trim() || seller?.name?.trim() || ''
      if (!name) continue

      const entry = supplierMap.get(name) || { total: 0, approved: 0, rejected: 0 }
      entry.total += 1
      if (sample.status === 'approved') entry.approved += 1
      if (sample.status === 'rejected') entry.rejected += 1
      supplierMap.set(name, entry)
    }

    // Sort by total descending and take top 10. The rate is over decided
    // samples, so lots still in the lab don't drag it down.
    const suppliers = Array.from(supplierMap.entries())
      .map(([name, data]) => {
        const decided = data.approved + data.rejected
        return {
          name,
          total: data.total,
          approved: data.approved,
          approvalRate: decided > 0 ? ((data.approved / decided) * 100).toFixed(1) : '0.0',
        }
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)

    return NextResponse.json({ suppliers })
  } catch (error) {
    console.error('Error in GET /api/clients/[id]/supplier-metrics:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
