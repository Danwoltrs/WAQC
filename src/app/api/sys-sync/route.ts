import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { listOpenSyncIssues } from '@/lib/approval-notification/sys-sync-issues'

/** Every open QC→sys mirror issue, newest first, with the sample's numbers.
 *  RLS (sys 0749) admits active internal users only; anyone else sees []. */
export async function GET() {
  const server = await createServerClient()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const issues = await listOpenSyncIssues(server as any)
  const ids = Array.from(new Set(issues.map((i) => i.sample_id).filter((v): v is string => !!v)))
  const numbers = new Map<string, { tracking_number: string | null; wolthers_contract_nr: string | null }>()
  if (ids.length > 0) {
    const { data } = await (server as any)
      .from('samples')
      .select('id, tracking_number, wolthers_contract_nr')
      .in('id', ids)
    for (const s of (data ?? []) as Array<{ id: string; tracking_number: string | null; wolthers_contract_nr: string | null }>) {
      numbers.set(s.id, { tracking_number: s.tracking_number, wolthers_contract_nr: s.wolthers_contract_nr })
    }
  }
  return NextResponse.json({
    issues: issues.map((i) => ({
      ...i,
      tracking_number: (i.sample_id && numbers.get(i.sample_id)?.tracking_number) ?? i.waqc_ref,
      wolthers_contract_nr: (i.sample_id && numbers.get(i.sample_id)?.wolthers_contract_nr) ?? null,
    })),
  })
}
