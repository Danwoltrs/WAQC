import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// Quick & dirty .env parser (avoid extra dep)
const envText = readFileSync('/Users/danielwolthers/Documents/GitHub/WAQC/.env.local', 'utf8')
const env: Record<string, string> = {}
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const url = env.NEXT_PUBLIC_SUPABASE_URL!
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
console.log('url:', url ? url.slice(0, 40) + '...' : 'MISSING')
const supabase = createClient(url, key)

async function main() {
  const { data, error } = await supabase
    .from('certificates')
    .select('id, certificate_number, is_rejected, compliance_violations, created_at')
    .eq('is_rejected', true)
    .order('created_at', { ascending: false })
    .limit(25)

  if (error) {
    console.error('ERR:', error)
    process.exit(1)
  }

  console.log(`Found ${data.length} rejected certs (latest 25)\n`)
  const prefixes = new Map<string, number>()
  let withViolations = 0
  for (const c of data) {
    const violations = c.compliance_violations as string[] | null
    if (violations && Array.isArray(violations) && violations.length > 0) {
      withViolations++
      console.log(`${c.certificate_number} (${c.created_at?.slice(0,10)})`)
      for (const v of violations) {
        console.log(`  • ${v}`)
        const m = v.match(/^([^:]{1,50})/)
        const p = m?.[1] ?? v.slice(0, 50)
        prefixes.set(p, (prefixes.get(p) ?? 0) + 1)
      }
      console.log()
    } else {
      console.log(`${c.certificate_number} — NO VIOLATIONS RECORDED (raw: ${JSON.stringify(violations)})`)
    }
  }

  console.log(`\nCerts with non-empty violations: ${withViolations} of ${data.length}`)
  console.log('\n--- unique prefixes (sorted by frequency) ---')
  for (const [p, n] of [...prefixes.entries()].sort((a,b) => b[1]-a[1])) {
    console.log(`  ${n}× "${p}"`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
