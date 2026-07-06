/** Annual report generator — mirrors performance-generator (asset loading, renderToBuffer). */
import React from 'react'
import fs from 'fs'
import path from 'path'
import { renderToBuffer } from '@react-pdf/renderer'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AnnualPerformanceReport } from '@/components/pdf/reports/annual-performance-report'
import { getAnnualPerformanceReportData, type AnnualPerformanceReportData } from '@/lib/reports/annual-data'
import { getCountryCodeFromOrigin, getFlagPath } from '@/lib/country-flags'

export interface GeneratedAnnualReport {
  pdfBuffer: Buffer
  filename: string
  data: AnnualPerformanceReportData
}

export async function generateAnnualReport(
  supabase: SupabaseClient,
  params: { clientId: string; year: number },
): Promise<GeneratedAnnualReport | null> {
  const data = await getAnnualPerformanceReportData(supabase, params)
  if (!data) return null

  let wolthersLogoBase64: string | undefined
  try {
    const logoPath = path.join(process.cwd(), 'public/images/logos/wolthers-logo-green.png')
    wolthersLogoBase64 = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`
  } catch (err) { console.error('[annual] Failed to load Wolthers logo:', err) }

  let flagBase64: string | undefined
  const countryCode = data.origin ? getCountryCodeFromOrigin(data.origin) : null
  if (countryCode) {
    try {
      const flagPath = path.join(process.cwd(), 'public', getFlagPath(countryCode))
      flagBase64 = `data:image/png;base64,${fs.readFileSync(flagPath).toString('base64')}`
    } catch (err) { console.error('[annual] Failed to load flag:', err) }
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
    } catch (err) { console.error('[annual] Failed to load client logo:', err) }
  }

  const element = React.createElement(AnnualPerformanceReport, { data, wolthersLogoBase64, clientLogoBase64, flagBase64 })
  const pdfBuffer = await renderToBuffer(element as any)

  const sanitize = (s: string) => s.replace(/[^\w-]/g, '_').replace(/_+/g, '_')
  const filename = `${sanitize(data.client.name)}_Annual_${params.year}.pdf`

  return { pdfBuffer: Buffer.from(pdfBuffer), filename, data }
}
