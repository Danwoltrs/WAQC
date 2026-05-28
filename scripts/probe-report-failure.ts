import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { generateWeeklySSCertsReport } from '@/lib/reports/weekly-ss-generator'

const envText = readFileSync('/Users/danielwolthers/Documents/GitHub/WAQC/.env.local', 'utf8')
const env: Record<string, string> = {}
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
}
const useAnon = process.argv.includes('--anon')
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL!,
  useAnon ? env.NEXT_PUBLIC_SUPABASE_ANON_KEY! : env.SUPABASE_SERVICE_ROLE_KEY!,
)
console.log('Using key:', useAnon ? 'ANON (RLS-enforced)' : 'SERVICE_ROLE (RLS-bypass)')

async function main() {
  // Find Ahold's client_id
  const { data: clients, error: clientErr } = await supabase
    .from('clients')
    .select('id, name, fantasy_name, company, client_types, is_qc_client')
    .or('fantasy_name.ilike.%ahold%,company.ilike.%ahold%,name.ilike.%ahold%')
  if (clientErr) {
    console.error('client lookup failed:', clientErr)
    process.exit(1)
  }
  console.log('Matching clients:', clients)
  const ahold = clients?.[0]
  if (!ahold) {
    console.error('Ahold not found')
    process.exit(1)
  }

  // Match what the UI sends: start = ISO of selected start_date 00:00,
  // end = ISO of selected end_date + 1 day (exclusive).
  const startDate = new Date('2026-04-01T00:00:00.000Z').toISOString()
  const endDate = new Date('2026-05-01T00:00:00.000Z').toISOString()
  console.log('Generating Ahold report for', startDate, '→', endDate)

  try {
    const report = await generateWeeklySSCertsReport(supabase as any, {
      clientId: ahold.id,
      startDate,
      endDate,
    })
    if (!report) {
      console.log('Generator returned null (data fetch failed)')
      return
    }
    console.log('PDF generated OK, bytes:', report.pdfBuffer.length, 'filename:', report.filename)
  } catch (err: any) {
    console.error('=== Generator threw ===')
    console.error('message:', err?.message)
    console.error('stack:', err?.stack)
    if (err?.cause) console.error('cause:', err.cause)
    process.exit(1)
  }
}
main().catch(e => { console.error('top-level:', e); process.exit(1) })