/**
 * GET /api/reports/weekly-ss?client_id=...&start_date=...&end_date=...
 *
 * Streams a generated PDF of the Weekly SS Certificates report for the given
 * QC client and date window. Authenticated — restricted to lab personnel and
 * up (RLS on samples/certificates already enforces per-lab scope where needed).
 *
 * Reports are generated on-demand; no caching yet (cache layer is Phase 4 if
 * we move to scheduled email delivery).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import fs from 'fs'
import path from 'path'
import { getWeeklySSCertReportData } from '@/lib/report-data'
import { WeeklySSCertsReport } from '@/components/pdf/reports/weekly-ss-certs-report'
import { getCountryCodeFromOrigin, getFlagPath } from '@/lib/country-flags'

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

    // Validate date inputs — must be ISO-parseable and start before end.
    const start = new Date(startDate)
    const end = new Date(endDate)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
    }
    if (start >= end) {
      return NextResponse.json({ error: 'start_date must be before end_date' }, { status: 400 })
    }

    const data = await getWeeklySSCertReportData(supabase, {
      clientId,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    })

    if (!data) {
      return NextResponse.json({ error: 'Failed to load report data' }, { status: 404 })
    }

    // Load assets. Same pattern as the certificate PDF route — reads from
    // public/ at build time and base64-encodes for embedding.
    let wolthersLogoBase64: string | undefined
    try {
      const logoPath = path.join(process.cwd(), 'public/images/logos/wolthers-logo-green.png')
      const logoBuffer = fs.readFileSync(logoPath)
      wolthersLogoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`
    } catch (err) {
      console.error('[report] Failed to load Wolthers logo:', err)
    }

    let flagBase64: string | undefined
    const countryCode = data.origin ? getCountryCodeFromOrigin(data.origin) : null
    if (countryCode) {
      try {
        const flagRelativePath = getFlagPath(countryCode)
        const flagPath = path.join(process.cwd(), 'public', flagRelativePath)
        const flagBuffer = fs.readFileSync(flagPath)
        flagBase64 = `data:image/png;base64,${flagBuffer.toString('base64')}`
      } catch (err) {
        console.error('[report] Failed to load flag:', err)
      }
    }

    let clientLogoBase64: string | undefined
    if (data.client.logo_url) {
      try {
        const res = await fetch(data.client.logo_url)
        if (res.ok) {
          const arr = await res.arrayBuffer()
          const ct = res.headers.get('content-type') || 'image/png'
          clientLogoBase64 = `data:${ct};base64,${Buffer.from(arr).toString('base64')}`
        }
      } catch (err) {
        console.error('[report] Failed to load client logo:', err)
      }
    }

    const element = React.createElement(WeeklySSCertsReport, {
      data,
      wolthersLogoBase64,
      clientLogoBase64,
      flagBase64,
    })
    const pdfBuffer = await renderToBuffer(element as any)

    // Filename: "{Client}_Weekly_SS_{YYYY-MM-DD}_to_{YYYY-MM-DD}.pdf"
    const sanitize = (s: string) => s.replace(/[^\w-]/g, '_').replace(/_+/g, '_')
    const clientSlug = sanitize(data.client.name)
    const startSlug = startDate.slice(0, 10)
    const endSlug = endDate.slice(0, 10)
    const filename = `${clientSlug}_Weekly_SS_${startSlug}_to_${endSlug}.pdf`

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('Error in GET /api/reports/weekly-ss:', error)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
