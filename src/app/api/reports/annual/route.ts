/** GET /api/reports/annual?client_id=...&year=... — streams the Annual PDF. Auth-gated. */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { generateAnnualReport } from '@/lib/reports/annual-generator'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const sp = request.nextUrl.searchParams
    const clientId = sp.get('client_id')
    const yearStr = sp.get('year')
    if (!clientId || !yearStr) {
      return NextResponse.json({ error: 'client_id and year are required' }, { status: 400 })
    }
    const year = Number(yearStr)
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
    }

    const report = await generateAnnualReport(supabase, { clientId, year })
    if (!report) return NextResponse.json({ error: 'Failed to load report data' }, { status: 404 })

    return new NextResponse(new Uint8Array(report.pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${report.filename}"`,
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('Error in GET /api/reports/annual:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `Failed to generate report: ${message}` }, { status: 500 })
  }
}
