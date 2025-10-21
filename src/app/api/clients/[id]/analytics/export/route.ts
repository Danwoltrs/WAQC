import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { format } from 'date-fns'

/**
 * GET /api/clients/[id]/analytics/export
 * Export client analytics data as CSV or Excel
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const exportFormat = searchParams.get('format') || 'csv'

    // Fetch client details
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('name, company, fantasy_name')
      .eq('id', id)
      .single()

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Fetch all samples with related data
    const { data: samples, error: samplesError } = await supabase
      .from('samples')
      .select(
        `
        id,
        tracking_number,
        origin,
        status,
        sample_type,
        created_at,
        updated_at,
        cupping_sessions (
          id,
          final_score,
          created_at
        ),
        certificates (
          id,
          certificate_number,
          created_at,
          delivered_at
        ),
        quality_assessments (
          id,
          moisture_percentage,
          defects_total,
          created_at
        )
      `
      )
      .eq('client_id', id)
      .order('created_at', { ascending: false })

    if (samplesError) {
      console.error('Error fetching samples:', samplesError)
      return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
    }

    if (exportFormat === 'csv') {
      const csv = generateCSV(client, samples || [])
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${client.name}-analytics-${format(new Date(), 'yyyy-MM-dd')}.csv"`,
        },
      })
    } else {
      // For Excel, we'll use a simple tab-separated format that Excel can open
      const tsv = generateTSV(client, samples || [])
      return new NextResponse(tsv, {
        headers: {
          'Content-Type': 'application/vnd.ms-excel',
          'Content-Disposition': `attachment; filename="${client.name}-analytics-${format(new Date(), 'yyyy-MM-dd')}.xlsx"`,
        },
      })
    }
  } catch (error) {
    console.error('Error in GET /api/clients/[id]/analytics/export:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function generateCSV(client: any, samples: any[]): string {
  const headers = [
    'Tracking Number',
    'Origin',
    'Status',
    'Sample Type',
    'Created Date',
    'Cupping Score',
    'Moisture %',
    'Total Defects',
    'Certificate Number',
    'Certificate Date',
    'Delivery Date',
  ]

  const rows = samples.map((sample) => {
    const cuppingScore =
      sample.cupping_sessions && sample.cupping_sessions.length > 0
        ? sample.cupping_sessions[0].final_score || ''
        : ''

    const moisture =
      sample.quality_assessments && sample.quality_assessments.length > 0
        ? sample.quality_assessments[0].moisture_percentage || ''
        : ''

    const defects =
      sample.quality_assessments && sample.quality_assessments.length > 0
        ? sample.quality_assessments[0].defects_total || ''
        : ''

    const certNumber =
      sample.certificates && sample.certificates.length > 0
        ? sample.certificates[0].certificate_number || ''
        : ''

    const certDate =
      sample.certificates && sample.certificates.length > 0
        ? format(new Date(sample.certificates[0].created_at), 'yyyy-MM-dd')
        : ''

    const deliveryDate =
      sample.certificates && sample.certificates.length > 0 && sample.certificates[0].delivered_at
        ? format(new Date(sample.certificates[0].delivered_at), 'yyyy-MM-dd')
        : ''

    return [
      sample.tracking_number,
      sample.origin || '',
      sample.status,
      sample.sample_type || '',
      format(new Date(sample.created_at), 'yyyy-MM-dd'),
      cuppingScore,
      moisture,
      defects,
      certNumber,
      certDate,
      deliveryDate,
    ]
  })

  const csvContent = [
    `Client Analytics Report - ${client.name}`,
    `Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`,
    '',
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
  ].join('\n')

  return csvContent
}

function generateTSV(client: any, samples: any[]): string {
  const headers = [
    'Tracking Number',
    'Origin',
    'Status',
    'Sample Type',
    'Created Date',
    'Cupping Score',
    'Moisture %',
    'Total Defects',
    'Certificate Number',
    'Certificate Date',
    'Delivery Date',
  ]

  const rows = samples.map((sample) => {
    const cuppingScore =
      sample.cupping_sessions && sample.cupping_sessions.length > 0
        ? sample.cupping_sessions[0].final_score || ''
        : ''

    const moisture =
      sample.quality_assessments && sample.quality_assessments.length > 0
        ? sample.quality_assessments[0].moisture_percentage || ''
        : ''

    const defects =
      sample.quality_assessments && sample.quality_assessments.length > 0
        ? sample.quality_assessments[0].defects_total || ''
        : ''

    const certNumber =
      sample.certificates && sample.certificates.length > 0
        ? sample.certificates[0].certificate_number || ''
        : ''

    const certDate =
      sample.certificates && sample.certificates.length > 0
        ? format(new Date(sample.certificates[0].created_at), 'yyyy-MM-dd')
        : ''

    const deliveryDate =
      sample.certificates && sample.certificates.length > 0 && sample.certificates[0].delivered_at
        ? format(new Date(sample.certificates[0].delivered_at), 'yyyy-MM-dd')
        : ''

    return [
      sample.tracking_number,
      sample.origin || '',
      sample.status,
      sample.sample_type || '',
      format(new Date(sample.created_at), 'yyyy-MM-dd'),
      cuppingScore,
      moisture,
      defects,
      certNumber,
      certDate,
      deliveryDate,
    ]
  })

  const tsvContent = [
    `Client Analytics Report - ${client.name}`,
    `Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`,
    '',
    headers.join('\t'),
    ...rows.map((row) => row.join('\t')),
  ].join('\n')

  return tsvContent
}
