import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * POST /api/samples/bulk/print-labels
 * Generate printable labels for selected samples (3cm x A4 format for tins)
 * Body: { sample_ids: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { sample_ids } = body

    if (!sample_ids || !Array.isArray(sample_ids) || sample_ids.length === 0) {
      return NextResponse.json({ error: 'sample_ids array is required' }, { status: 400 })
    }

    // Fetch samples
    const { data: samples, error } = await supabase
      .from('samples')
      .select('*')
      .in('id', sample_ids)

    if (error) {
      console.error('Error fetching samples for labels:', error)
      return NextResponse.json({ error: 'Failed to fetch samples' }, { status: 500 })
    }

    // Generate label data
    const labels = samples.map(sample => ({
      tracking_number: sample.tracking_number,
      origin: sample.origin,
      quality: sample.quality_name || '',
      supplier: sample.supplier || sample.exporter || '',
      storage_position: sample.storage_position || '',
      created_at: sample.created_at ? new Date(sample.created_at).toLocaleDateString() : ''
    }))

    // TODO: Implement actual PDF label generation
    // This would use a library like pdfkit or puppeteer to generate 3cm x A4 labels
    // For now, return the label data as JSON

    return NextResponse.json({
      message: 'Label generation endpoint ready',
      labels,
      format: '3cm x A4 for tins',
      note: 'PDF generation to be implemented with pdfkit or puppeteer'
    })
  } catch (error) {
    console.error('Error in POST /api/samples/bulk/print-labels:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
