import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const envText = readFileSync('/Users/danielwolthers/Documents/GitHub/WAQC/.env.local', 'utf8')
const env: Record<string, string> = {}
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

async function main() {
  // Inspect client_types values for Dunkin, Ahold, Blaser
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, company, fantasy_name, client_types, is_qc_client')
    .or('fantasy_name.ilike.%dunkin%,company.ilike.%dunkin%,name.ilike.%dunkin%,fantasy_name.ilike.%ahold%,company.ilike.%ahold%,name.ilike.%ahold%,fantasy_name.ilike.%blaser%,company.ilike.%blaser%,name.ilike.%blaser%')
  console.log('--- Sample clients ---')
  console.log(JSON.stringify(clients, null, 2))

  // What columns does samples have for shipper/seller/exporter/importer?
  const { data: sampleSample } = await supabase
    .from('samples')
    .select('id, client_id, seller_id, exporter_id, importer_id, roaster_id, tracking_number')
    .limit(1)
  console.log('\n--- Sample row keys ---')
  console.log(Object.keys(sampleSample?.[0] || {}))

  // Count how many samples have seller_id vs exporter_id set
  const { data: counts } = await supabase.rpc('execute_sql' as any, { sql: '' }).maybeSingle()
  // Just do separate counts via the REST count API
  const { count: hasSeller } = await supabase.from('samples').select('id', { count: 'exact', head: true }).not('seller_id', 'is', null)
  const { count: hasExporter } = await supabase.from('samples').select('id', { count: 'exact', head: true }).not('exporter_id', 'is', null)
  const { count: hasBoth } = await supabase.from('samples').select('id', { count: 'exact', head: true }).not('seller_id', 'is', null).not('exporter_id', 'is', null)
  const { count: hasImporter } = await supabase.from('samples').select('id', { count: 'exact', head: true }).not('importer_id', 'is', null)
  console.log('\n--- Samples FK fill rates ---')
  console.log({ hasSeller, hasExporter, hasBoth, hasImporter })

  // Show what client_types values exist (distinct)
  const { data: allClients } = await supabase.from('clients').select('client_types').eq('is_qc_client', true)
  const types = new Set<string>()
  for (const c of allClients || []) for (const t of (c.client_types || [])) types.add(t)
  console.log('\n--- Distinct client_types across QC clients ---')
  console.log([...types])
}
main().catch(e => { console.error(e); process.exit(1) })
