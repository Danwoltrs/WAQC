/**
 * GET /api/reports/biweekly?client_id=...&start_date=...&end_date=...
 *
 * Streams a generated PDF of the Bi-Weekly Performance report for the given
 * QC client and date window. Auth-gated.
 *
 * PDF generation is delegated to lib/reports/biweekly-generator so the
 * email-send endpoint can reuse the exact same output.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { generateBiweeklyReport } from '@/lib/reports/biweekly-generator'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sp = request.nextUrl.searchParams
    const clientId = sp.get('client_id')
    const startDate = sp.get('start_date')
    const endDate = sp.get('end_date')

    if (!clientId || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'client_id, start_date, end_date are required' },
        { status: 400 }
      )
    }

    const start = new Date(startDate)
    const end = new Date(endDate)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
    }
    if (start >= end) {
      return NextResponse.json({ error: 'start_date must be before end_date' }, { status: 400 })
    }

    const report = await generateBiweeklyReport(supabase, {
      clientId,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    })

    if (!report) {
      return NextResponse.json({ error: 'Failed to load report data' }, { status: 404 })
    }

    return new NextResponse(new Uint8Array(report.pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${report.filename}"`,
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('Error in GET /api/reports/biweekly:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: `Failed to generate report: ${message}` },
      { status: 500 },
    )
  }
}
