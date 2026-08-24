import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/clients/co-brokers
 * Companies that act as co-brokers on at least one contract — the pick list for
 * "Deduct QC fees from co-broker". Runs on the service role because WAQC users
 * have no RLS read on `contracts`; the auth check above is the only guard.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Service role not configured' }, { status: 500 })
  }
  const admin = createSupabaseClient(url, key, { auth: { persistSession: false } })

  const { data, error } = await (admin as any)
    .from('contracts')
    .select('co_broker_company_id, company:companies!contracts_co_broker_company_id_fkey ( id, name )')
    .not('co_broker_company_id', 'is', null)
    .limit(5000)

  if (error) {
    console.error('Error listing co-brokers:', error)
    return NextResponse.json({ error: 'Failed to list co-brokers' }, { status: 500 })
  }

  const byId = new Map<string, string>()
  for (const row of (data ?? []) as { company?: { id: string; name: string } | null }[]) {
    if (row.company?.id) byId.set(row.company.id, row.company.name)
  }
  const coBrokers = Array.from(byId, ([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({ coBrokers })
}
