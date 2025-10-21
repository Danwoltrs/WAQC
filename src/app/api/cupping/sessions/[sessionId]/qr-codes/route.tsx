import React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { renderToStream } from '@react-pdf/renderer'
import {
  CuppingQRTableDocument,
  CuppingQRData,
} from '@/components/pdf/cupping-qr-table'
import { generateQRCode, getCuppingSessionUrl } from '@/lib/qr-code'

/**
 * GET /api/cupping/sessions/[sessionId]/qr-codes
 * Generate printable QR codes for cupping session samples
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params
    const supabase = await createClient()

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch cupping session
    const { data: session, error: sessionError } = await supabase
      .from('cupping_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Cupping session not found' },
        { status: 404 }
      )
    }

    // Get sample IDs from session
    const sampleIds = session.sample_ids || []

    if (sampleIds.length === 0) {
      return NextResponse.json(
        { error: 'No samples found for this session' },
        { status: 404 }
      )
    }

    // Fetch samples
    const { data: samples, error: samplesError } = await supabase
      .from('samples')
      .select('id, tracking_number, origin, quality_name')
      .in('id', sampleIds)

    if (samplesError || !samples) {
      console.error('Error fetching samples:', samplesError)
      return NextResponse.json(
        { error: 'Failed to fetch session samples' },
        { status: 500 }
      )
    }

    // Generate QR codes for each sample
    const qrCodesData: CuppingQRData[] = await Promise.all(
      samples.map(async (sample: any, index: number) => {
        const cuppingUrl = getCuppingSessionUrl(
          sessionId,
          sample.id
        )
        const qrCode = await generateQRCode(cuppingUrl, {
          width: 300,
          margin: 2,
        })

        return {
          sample_number: (index + 1).toString(),
          tracking_number: sample.tracking_number,
          origin: sample.origin || 'Unknown',
          quality: sample.quality_name || undefined,
          qr_code: qrCode,
          session_id: sessionId,
          sample_id: sample.id,
        }
      })
    )

    // Generate PDF
    const pdfDocument = (
      <CuppingQRTableDocument
        session_name={`Cupping Session ${sessionId.slice(0, 8)}`}
        session_date={
          session.created_at
            ? new Date(session.created_at).toLocaleDateString()
            : new Date().toLocaleDateString()
        }
        qr_codes={qrCodesData}
      />
    )

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
        'Content-Disposition': `attachment; filename="cupping-qr-codes-${sessionId.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.pdf"`,
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('Error generating cupping QR codes:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
