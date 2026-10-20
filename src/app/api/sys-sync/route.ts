import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { listOpenSyncIssues } from '@/lib/approval-notification/sys-sync-issues'
import { isLabNumber, sampleLabelText } from '@/lib/sample-reference'

/** Every open QC→sys mirror issue, newest first, with the sample's numbers.
 *  RLS (sys 0749) admits active internal users only; anyone else sees []. */
export async function GET() {
  const server = await createServerClient()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const issues = await listOpenSyncIssues(server as any)
  const ids = Array.from(new Set(issues.map((i) => i.sample_id).filter((v): v is string => !!v)))
  // `reference` names the sample for people: its certificate number, else its
  // own identifier. Never the SAN lab number, which is also what `waqc_ref`
  // holds for a lab unit, so it is dropped from the response.
  const numbers = new Map<string, { reference: string | null; wolthers_contract_nr: string | null }>()
  if (ids.length > 0) {
    const { data } = await (server as any)
      .from('samples')
      .select(
        'id, wolthers_contract_nr, container_nr, ico_number, exporter_sample_number, ' +
          'certificates:certificates!certificates_sample_id_fkey(id, certificate_number, status, created_at)',
      )
      .in('id', ids)
    for (const s of (data ?? []) as any[]) {
      const certs = [...(s.certificates ?? [])].sort((a: any, b: any) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
      const cert = certs.find((c: any) => c.status !== 'revoked') ?? certs[0]
      const reference = sampleLabelText({
        certificate_id: cert?.id ?? null,
        certificate_number: cert?.certificate_number ?? null,
        container_nr: s.container_nr,
        ico_number: s.ico_number,
        exporter_sample_number: s.exporter_sample_number,
      }, '')
      numbers.set(s.id, { reference: reference || null, wolthers_contract_nr: s.wolthers_contract_nr })
    }
  }
  return NextResponse.json({
    issues: issues.map(({ waqc_ref, ...i }) => ({
      ...i,
      waqc_ref: isLabNumber(waqc_ref) ? null : waqc_ref,
      reference: (i.sample_id && numbers.get(i.sample_id)?.reference) ?? null,
      wolthers_contract_nr: (i.sample_id && numbers.get(i.sample_id)?.wolthers_contract_nr) ?? null,
    })),
  })
}
