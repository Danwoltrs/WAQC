/**
 * Report data fetchers.
 *
 * Aggregates certificate + sample data for the client-facing reports. Each
 * function returns a normalized shape that report PDF templates can render
 * without doing additional queries.
 */

import { SupabaseClient } from '@supabase/supabase-js'

export interface WeeklySSCertRow {
  approval_date: string  // ISO date (display formatter in PDF picks d/m/yyyy)
  certificate_number: string
  exporter_name: string | null
  importer_name: string | null
  importer_contract_nr: string | null
  roaster_name: string | null     // "Roaster Destination" column
  container_nr: string | null
  ico_marks: string | null         // ICO mark numbers from sample
  bags: number | null
}

export interface WeeklySSCertReportData {
  client: {
    id: string
    name: string                  // best-available display name (fantasy_name / company / name)
    logo_url: string | null
  }
  period: {
    start_date: string            // ISO
    end_date: string              // ISO
    issued_at: string             // ISO — generation timestamp
  }
  origin: string | null           // most-represented origin in the rows (drives the flag)
  totals: {
    certificate_count: number
    bag_count: number
    roaster_count: number         // distinct roasters in this batch (Unsold counted once)
    importer_count: number        // distinct importers in this batch
  }
  // For the small "Roasters" and "Importers" blocks in the header — list each
  // distinct destination with its bag total so the user can read share at a glance.
  roaster_breakdown: Array<{ name: string; bags: number }>
  importer_breakdown: Array<{ name: string; bags: number }>
  rows: WeeklySSCertRow[]
}

/**
 * Fetch the data for a Weekly SS Certificates report.
 *
 * Only SS samples that have a certificate dated within [start, end] are
 * included. The cert's created_at is the "approval date" we display — that's
 * when the finalize endpoint stamped the certificate, which matches how the
 * existing legacy Excel reports were structured.
 */
export async function getWeeklySSCertReportData(
  supabase: SupabaseClient,
  params: { clientId: string; startDate: string; endDate: string }
): Promise<WeeklySSCertReportData | null> {
  const { clientId, startDate, endDate } = params

  // Resolve the client — accept any QC client, just for display.
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, name, company, fantasy_name, logo_url')
    .eq('id', clientId)
    .single()
  if (clientError || !client) {
    console.error('[report-data] client not found:', clientId, clientError)
    return null
  }

  // Pull SS certificates created in the window for samples belonging to this
  // client. We exclude sub-contract certs (sample_contract_id IS NOT NULL)
  // because those are aggregated under their mother cert in this report.
  const { data: certs, error: certsError } = await supabase
    .from('certificates')
    .select(`
      id,
      certificate_number,
      created_at,
      is_rejected,
      sample:samples!certificates_sample_id_fkey(
        id,
        sample_type,
        client_id,
        origin,
        container_nr,
        ico_number,
        bag_count,
        equivalent_60kg_bags,
        bags_quantity_mt,
        buyer_contract_nr,
        exporter:exporters!samples_exporter_id_fkey(name),
        importer:importers!samples_importer_id_fkey(name),
        roaster:roasters!samples_roaster_id_fkey(name)
      )
    `)
    .is('sample_contract_id', null)
    .gte('created_at', startDate)
    .lt('created_at', endDate)
    .order('created_at', { ascending: true })

  if (certsError) {
    console.error('[report-data] certificates query failed:', certsError)
    return null
  }

  // Filter to: SS sample type + matches client + approved (not rejected).
  // Doing this in JS rather than in the query because the nested sample fields
  // don't support easy filtering via PostgREST.
  const filtered = (certs || []).filter((c: any) => {
    const s = c.sample
    if (!s) return false
    if (s.client_id !== clientId) return false
    if (s.sample_type !== 'ss') return false
    if (c.is_rejected) return false
    return true
  })

  // Build display rows. Bags = bag_count if set, else equivalent_60kg_bags as
  // a fallback (rounded). The legacy reports show whole-number bags.
  const rows: WeeklySSCertRow[] = filtered.map((c: any) => {
    const s = c.sample
    const bagsRaw = s.bag_count ?? s.equivalent_60kg_bags ?? null
    const bags = typeof bagsRaw === 'number' ? Math.round(bagsRaw) : null
    return {
      approval_date: c.created_at,
      certificate_number: c.certificate_number,
      exporter_name: s.exporter?.name ?? null,
      importer_name: s.importer?.name ?? null,
      importer_contract_nr: s.buyer_contract_nr ?? null,
      // Roaster Destination is "Unsold" when there's no roaster_id assigned yet.
      roaster_name: s.roaster?.name ?? 'Unsold',
      container_nr: s.container_nr ?? null,
      ico_marks: s.ico_number ?? null,
      bags,
    }
  })

  // Aggregates for the header blocks
  const bagCount = rows.reduce((sum, r) => sum + (r.bags ?? 0), 0)
  const roasterMap = new Map<string, number>()
  const importerMap = new Map<string, number>()
  const originCounts = new Map<string, number>()

  for (const r of rows) {
    const roasterKey = r.roaster_name || 'Unsold'
    roasterMap.set(roasterKey, (roasterMap.get(roasterKey) ?? 0) + (r.bags ?? 0))
    if (r.importer_name) {
      importerMap.set(r.importer_name, (importerMap.get(r.importer_name) ?? 0) + (r.bags ?? 0))
    }
  }
  // Cast through any — the supabase generated type marks the nested sample as
  // an array (PostgREST default for FK joins) even though sample_id is a single-
  // value FK, so the actual runtime shape is a single object.
  for (const c of filtered as any[]) {
    const origin = c.sample?.origin
    if (origin) originCounts.set(origin, (originCounts.get(origin) ?? 0) + 1)
  }

  // Most-represented origin drives the flag. If samples span multiple
  // countries, we still pick one — multi-country reports are a future variant.
  const dominantOrigin = [...originCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  return {
    client: {
      id: client.id,
      name: (client as any).fantasy_name || (client as any).company || client.name,
      logo_url: (client as any).logo_url ?? null,
    },
    period: {
      start_date: startDate,
      end_date: endDate,
      issued_at: new Date().toISOString(),
    },
    origin: dominantOrigin,
    totals: {
      certificate_count: rows.length,
      bag_count: bagCount,
      roaster_count: roasterMap.size,
      importer_count: importerMap.size,
    },
    roaster_breakdown: [...roasterMap.entries()]
      .map(([name, bags]) => ({ name, bags }))
      .sort((a, b) => b.bags - a.bags),
    importer_breakdown: [...importerMap.entries()]
      .map(([name, bags]) => ({ name, bags }))
      .sort((a, b) => b.bags - a.bags),
    rows,
  }
}
