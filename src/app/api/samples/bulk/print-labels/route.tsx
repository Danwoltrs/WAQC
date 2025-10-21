import React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { renderToStream } from '@react-pdf/renderer'
import { SampleLabelDocument, SampleLabelData } from '@/components/pdf/sample-label'
import { generateQRCode, getSampleTrackingUrl } from '@/lib/qr-code'

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

    if (!samples || samples.length === 0) {
      return NextResponse.json({ error: 'No samples found' }, { status: 404 })
    }

    // Generate QR codes and prepare label data
    const labelsWithQR: SampleLabelData[] = await Promise.all(
      samples.map(async (sample) => {
        const trackingUrl = getSampleTrackingUrl(sample.tracking_number)
        const qrCode = await generateQRCode(trackingUrl, {
          width: 200,
          margin: 1,
        })

        return {
          tracking_number: sample.tracking_number,
          origin: sample.origin || 'Unknown',
          quality: sample.quality_name || '',
          supplier: sample.supplier || sample.exporter || '',
          storage_position: sample.storage_position || '',
          created_at: sample.created_at
            ? new Date(sample.created_at).toLocaleDateString()
            : '',
          qr_code: qrCode,
        }
      })
    )

    // Generate PDF
    const pdfDocument = <SampleLabelDocument labels={labelsWithQR} />
    const stream = await renderToStream(pdfDocument)

    // Convert stream to buffer
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk))
    }
    const buffer = Buffer.concat(chunks)

    // Return PDF as response
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="sample-labels-${new Date().toISOString().split('T')[0]}.pdf"`,
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('Error in POST /api/samples/bulk/print-labels:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
