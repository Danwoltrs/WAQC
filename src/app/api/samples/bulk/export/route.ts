import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { selectInChunks } from '@/lib/supabase-in-chunks'
import { sampleLabelText } from '@/lib/sample-reference'

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

    // Fetch samples with entity joins
    const { data: samples, error } = await supabase
      .from('samples')
      .select(`
        *,
        clients:companies!samples_client_id_fkey(company:name, name),
        laboratories!samples_laboratory_id_fkey(name, location),
        seller:companies!samples_seller_id_fkey(name, fantasy_name),
        exporter:companies!samples_exporter_id_fkey(name, fantasy_name),
        importer:companies!samples_importer_id_fkey(name, fantasy_name),
        roaster:companies!samples_roaster_id_fkey(name, fantasy_name)
      `)
      .is('deleted_at', null)
      .in('id', sample_ids)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching samples for export:', error)
      return NextResponse.json({ error: 'Failed to fetch samples' }, { status: 500 })
    }

    // Each sample's newest certificate: the Reference column leads with its
    // number once issued, else the lot's own identifier. Never the internal
    // SAN- lab number.
    const { data: certRows } = await selectInChunks<any>(
      (samples ?? []).map((s: any) => s.id),
      (chunk) =>
        (supabase as any)
          .from('certificates')
          .select('id, sample_id, certificate_number, created_at')
          .in('sample_id', chunk),
    )
    const certBySample = new Map<string, any>()
    for (const c of (certRows ?? []) as any[]) {
      const prev = certBySample.get(c.sample_id)
      if (!prev || String(c.created_at ?? '') > String(prev.created_at ?? '')) certBySample.set(c.sample_id, c)
    }

    // Transform data for Excel export
    const exportData = samples.map((sample: any) => {
      const cert = certBySample.get(sample.id)
      return {
        'Reference': sampleLabelText(
          { ...sample, certificate_id: cert?.id ?? null, certificate_number: cert?.certificate_number ?? null },
          '',
        ),
        'Origin': sample.origin,
        'Quality': sample.quality_name || '',
        'Supplier': sample.seller?.fantasy_name || sample.seller?.name || '',
        'Exporter': sample.exporter?.fantasy_name || sample.exporter?.name || '',
        'Importer': sample.importer?.fantasy_name || sample.importer?.name || '',
        'Roaster': sample.roaster?.fantasy_name || sample.roaster?.name || '',
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
        'Created': sample.created_at ? new Date(sample.created_at).toLocaleString() : '',
        'Last Updated': sample.updated_at ? new Date(sample.updated_at).toLocaleString() : ''
      }
    })

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
