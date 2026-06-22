/**
 * Bi-Weekly Performance report generator.
 *
 * Shared helper used by both the download endpoint (returns inline PDF) and
 * the email-send endpoint (attaches PDF to Graph email). Mirrors
 * weekly-ss-generator so the two routes can't drift apart on asset loading,
 * filename format, or data fetching.
 */

import React from 'react'
import fs from 'fs'
import path from 'path'
import { renderToBuffer } from '@react-pdf/renderer'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BiweeklyPerformanceReport } from '@/components/pdf/reports/biweekly-performance-report'
import { getBiweeklyPerformanceReportData, type BiweeklyPerformanceReportData } from '@/lib/reports/biweekly-data'
import { getCountryCodeFromOrigin, getFlagPath } from '@/lib/country-flags'

export interface GeneratedBiweeklyReport {
  pdfBuffer: Buffer
  filename: string
  data: BiweeklyPerformanceReportData
}

export async function generateBiweeklyReport(
  supabase: SupabaseClient,
  params: { clientId: string; startDate: string; endDate: string },
): Promise<GeneratedBiweeklyReport | null> {
  const data = await getBiweeklyPerformanceReportData(supabase, params)
  if (!data) return null

  // Wolthers logo — read from public/ at request time. Cached by the Node
  // process so repeat requests in the same serverless instance are fast.
  let wolthersLogoBase64: string | undefined
  try {
    const logoPath = path.join(process.cwd(), 'public/images/logos/wolthers-logo-green.png')
    const logoBuffer = fs.readFileSync(logoPath)
    wolthersLogoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`
  } catch (err) {
    console.error('[report] Failed to load Wolthers logo:', err)
  }

  // Country flag for the dominant origin in the report. Missing flag is
  // non-fatal — the header just won't show one.
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

  // Client logo from their hosted URL (Supabase storage usually).
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

  const element = React.createElement(BiweeklyPerformanceReport, {
    data,
    wolthersLogoBase64,
    clientLogoBase64,
    flagBase64,
  })
  const pdfBuffer = await renderToBuffer(element as any)

  // Filename: "{Client}_BiWeekly_{YYYY-MM-DD}_to_{YYYY-MM-DD}.pdf"
  const sanitize = (s: string) => s.replace(/[^\w-]/g, '_').replace(/_+/g, '_')
  const clientSlug = sanitize(data.client.name)
  const startSlug = params.startDate.slice(0, 10)
  const endSlug = params.endDate.slice(0, 10)
  const filename = `${clientSlug}_BiWeekly_${startSlug}_to_${endSlug}.pdf`

  return {
    pdfBuffer: Buffer.from(pdfBuffer),
    filename,
    data,
  }
}
