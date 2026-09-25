/** Annual report generator — data, assets (logos, origin flags), render. */
import React from 'react'
import fs from 'fs'
import path from 'path'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AnnualReport } from '@/components/pdf/reports/annual/annual-report'
import { getAnnualPerformanceReportData, type AnnualPerformanceReportData } from '@/lib/reports/annual-data'
import { getCountryCodeFromOrigin, getFlagPath } from '@/lib/country-flags'
import { serviceRoleClient } from '@/lib/reports/service-role'

const MAX_FLAGS = 4

export interface GeneratedAnnualReport {
  pdfBuffer: Buffer
  filename: string
  data: AnnualPerformanceReportData
}

function publicPng(rel: string): string | undefined {
  try {
    return `data:image/png;base64,${fs.readFileSync(path.join(process.cwd(), 'public', rel)).toString('base64')}`
  } catch (err) {
    console.error(`[annual] Failed to load ${rel}:`, err)
    return undefined
  }
}

async function remoteImage(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url)
    if (!res.ok) return undefined
    const ct = res.headers.get('content-type') || 'image/png'
    return `data:${ct};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`
  } catch (err) {
    console.error('[annual] Failed to load client logo:', err)
    return undefined
  }
}

export async function generateAnnualReport(
  supabase: SupabaseClient,
  params: { clientId: string; year: number },
): Promise<GeneratedAnnualReport | null> {
  const data = await getAnnualPerformanceReportData(supabase, params, { admin: serviceRoleClient() })
  if (!data) return null

  const wolthersLogoBase64 = publicPng('images/logos/wolthers-logo-green.png')
  const flagsBase64: string[] = []
  for (const origin of data.agg.originsCovered.slice(0, MAX_FLAGS)) {
    const code = getCountryCodeFromOrigin(origin)
    const flag = code ? publicPng(getFlagPath(code)) : undefined
    if (flag) flagsBase64.push(flag)
  }
  const clientLogoBase64 = data.client.logo_url ? await remoteImage(data.client.logo_url) : undefined

  const element = React.createElement(AnnualReport, { data, wolthersLogoBase64, clientLogoBase64, flagsBase64 })
  const pdfBuffer = await renderToBuffer(element as unknown as React.ReactElement<DocumentProps>)

  const sanitize = (s: string) => s.replace(/[^\w-]/g, '_').replace(/_+/g, '_')
  return {
    pdfBuffer: Buffer.from(pdfBuffer),
    filename: `${sanitize(data.client.name)}_Annual_${params.year}.pdf`,
    data,
  }
}
