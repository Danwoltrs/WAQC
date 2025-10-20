import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/quality-templates/[id]/analytics
 * Get usage analytics and performance metrics for a quality template
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

    const { id: templateId } = await params

    // Verify template exists
    const { data: template, error: templateError } = await supabase
      .from('quality_templates')
      .select('id, name_en')
      .eq('id', templateId)
      .single()

    if (templateError || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // Get all client_qualities using this template
    const { data: clientQualities, error: qualitiesError } = await supabase
      .from('client_qualities')
      .select(`
        id,
        client_id,
        clients!inner(id, name)
      `)
      .eq('template_id', templateId)

    if (qualitiesError) {
      console.error('Error fetching client qualities:', qualitiesError)
      return NextResponse.json(
        { error: 'Failed to fetch template usage data' },
        { status: 500 }
      )
    }

    const qualityIds = clientQualities?.map(q => q.id) || []
    const activeClients = new Set(clientQualities?.map(q => q.client_id) || []).size

    // Get all samples using these quality specs
    const { data: samples, error: samplesError } = await supabase
      .from('samples')
      .select('id, origin, status, created_at, client_id')
      .in('quality_spec_id', qualityIds)
      .order('created_at', { ascending: true })

    if (samplesError) {
      console.error('Error fetching samples:', samplesError)
    }

    const totalSamples = samples?.length || 0
    const approvedSamples = samples?.filter(s => s.status === 'approved').length || 0
    const rejectedSamples = samples?.filter(s => s.status === 'rejected').length || 0

    // Calculate usage by month
    const usageByMonth: { [key: string]: number } = {}
    samples?.forEach(sample => {
      if (sample.created_at) {
        const month = new Date(sample.created_at).toISOString().slice(0, 7) // YYYY-MM
        usageByMonth[month] = (usageByMonth[month] || 0) + 1
      }
    })

    const usageByMonthData = Object.entries(usageByMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }))

    // Calculate usage by origin
    const usageByOrigin: { [key: string]: number } = {}
    samples?.forEach(sample => {
      if (sample.origin) {
        usageByOrigin[sample.origin] = (usageByOrigin[sample.origin] || 0) + 1
      }
    })

    const usageByOriginData = Object.entries(usageByOrigin)
      .sort(([, a], [, b]) => b - a)
      .map(([origin, count]) => ({ origin, count }))

    // Calculate top clients
    const clientUsage: { [key: string]: { name: string; count: number } } = {}
    samples?.forEach(sample => {
      if (sample.client_id) {
        const clientQuality = clientQualities?.find(cq => cq.client_id === sample.client_id)
        if (clientQuality) {
          const clientName = (clientQuality.clients as any)?.name || 'Unknown'
          if (!clientUsage[sample.client_id]) {
            clientUsage[sample.client_id] = { name: clientName, count: 0 }
          }
          clientUsage[sample.client_id].count++
        }
      }
    })

    const topClients = Object.values(clientUsage)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(({ name, count }) => ({
        client_name: name,
        usage_count: count
      }))

    // Get first and last used dates
    const firstUsed = samples && samples.length > 0 ? samples[0].created_at : null
    const lastUsed = samples && samples.length > 0 ? samples[samples.length - 1].created_at : null

    const analytics = {
      template_id: templateId,
      template_name: (template as any).name_en || 'Unknown Template',
      usage_count: qualityIds.length,
      active_clients: activeClients,
      total_samples: totalSamples,
      approved_samples: approvedSamples,
      rejected_samples: rejectedSamples,
      avg_approval_rate: totalSamples > 0 ? (approvedSamples / totalSamples) * 100 : 0,
      first_used: firstUsed,
      last_used: lastUsed,
      usage_by_month: usageByMonthData,
      usage_by_origin: usageByOriginData,
      top_clients: topClients
    }

    return NextResponse.json({ analytics })
  } catch (error) {
    console.error('Error in GET /api/quality-templates/[id]/analytics:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
