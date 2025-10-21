import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * POST /api/samples/bulk/export
 * Export selected samples to Excel format
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
      .select(`
        *,
        clients!samples_client_id_fkey(company, name),
        laboratories!samples_laboratory_id_fkey(name, location)
      `)
      .in('id', sample_ids)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching samples for export:', error)
      return NextResponse.json({ error: 'Failed to fetch samples' }, { status: 500 })
    }

    // Transform data for Excel export
    const exportData = samples.map(sample => ({
      'Tracking Number': sample.tracking_number,
      'Origin': sample.origin,
      'Quality': sample.quality_name || '',
      'Supplier': sample.supplier || '',
      'Exporter': sample.exporter || '',
      'Importer': sample.importer || '',
      'Roaster': sample.roaster || sample.buyer || '',
      'Status': sample.status,
      'Workflow Stage': sample.workflow_stage || '',
      'Sample Type': sample.sample_type || '',
      'Storage Position': sample.storage_position || '',
      'Wolthers Contract': sample.wolthers_contract_nr || '',
      'Exporter Contract': sample.exporter_contract_nr || '',
      'Buyer Contract': sample.buyer_contract_nr || '',
      'Roaster Contract': sample.roaster_contract_nr || '',
      'ICO Number': sample.ico_number || '',
      'ICO Marks': sample.ico_marks || '',
      'Container Nr': sample.container_nr || '',
      'Bags (MT)': sample.bags_quantity_mt || '',
      'Bag Count': sample.bag_count || '',
      'Processing Method': sample.processing_method || '',
      'Created': new Date(sample.created_at).toLocaleString(),
      'Last Updated': sample.updated_at ? new Date(sample.updated_at).toLocaleString() : ''
    }))

    // TODO: Implement actual Excel generation using a library like exceljs or xlsx
    // For now, return CSV data
    const headers = Object.keys(exportData[0] || {})
    const csvRows = [
      headers.join(','),
      ...exportData.map(row =>
        headers.map(header => {
          const value = (row as any)[header]
          // Escape commas and quotes in CSV
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`
          }
          return value
        }).join(',')
      )
    ]
    const csv = csvRows.join('\n')

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="samples-export-${new Date().toISOString().split('T')[0]}.csv"`
      }
    })
  } catch (error) {
    console.error('Error in POST /api/samples/bulk/export:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
