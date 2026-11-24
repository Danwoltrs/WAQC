import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchGroup } from '@/lib/sample-group'
import { companyDisplayName } from '@/lib/contract-intake-mapping'

/**
 * The buyer-sample requests (sys 0989) still 'requested' on the contracts of a
 * sample's group: the sample the seller was asked to send the BUYER after a QC
 * pre-approval. Only a pre-approval makes a request point at our row
 * (`pre_approval_of`), so we read this lot's claimed rows first and follow only requests pointing at them.
 * Read by the Override Status dialog to warn staff before they reverse. Empty
 * where sys has not applied the columns yet.
 */
export async function findOpenBuyerRequests(
  db: SupabaseClient<any>,
  sampleId: string,
): Promise<Array<{ company: string }>> {
  const group = await fetchGroup(db, sampleId)
  const contractIds = [...new Set(group.map((m) => m.contract_id as string | null).filter((id): id is string => !!id))]
  if (contractIds.length === 0) return []

  // Claim refs, as the write-back keys our rows: the lab unit's tracking number;
  // a contract sibling's own certificate number with the rejection 'R-' stripped.
  // Join keys only, never shown.
  const siblingIds = group.filter((m) => m.lab_source_sample_id).map((m) => m.id)
  const certNumbers = new Map<string, string>()
  if (siblingIds.length > 0) {
    const certs = await db.from('certificates').select('sample_id, certificate_number').in('sample_id', siblingIds)
    for (const c of (certs.data ?? []) as Array<{ sample_id: string; certificate_number: string | null }>) {
      if (c.certificate_number) certNumbers.set(c.sample_id, c.certificate_number.replace(/^R-/, ''))
    }
  }
  const refs = [
    ...new Set(
      group
        .map((m) => (m.lab_source_sample_id ? certNumbers.get(m.id) : (m.tracking_number as string | null)))
        .filter((r): r is string => !!r),
    ),
  ]
  if (refs.length === 0) return []

  const missingColumn = (e: { code?: string }) => e.code === '42703' || e.code === 'PGRST204'

  // This lot's own rows only: a contract can also carry another lot's PSS (a
  // re-sample) with its own buyer request, which is not ours to warn about.
  const claimed = await db
    .from('shipment_samples')
    .select('id')
    .in('contract_id', contractIds)
    .in('waqc_ref', refs)
    .is('pre_approval_of', null)
  if (claimed.error) {
    if (missingColumn(claimed.error)) return []
    throw claimed.error
  }
  const claimedIds = ((claimed.data ?? []) as Array<{ id: string }>).map((r) => r.id)
  if (claimedIds.length === 0) return []

  const read = await db
    .from('shipment_samples')
    .select('id, recipient_company_id, recipient_company_name')
    .in('pre_approval_of', claimedIds)
    .eq('status', 'requested')
  if (read.error) {
    if (missingColumn(read.error)) return []
    throw read.error
  }
  const requests = (read.data ?? []) as Array<{
    id: string
    recipient_company_id: string | null
    recipient_company_name: string | null
  }>

  const companyIds = [...new Set(requests.map((r) => r.recipient_company_id).filter((id): id is string => !!id))]
  const names = new Map<string, string>()
  if (companyIds.length > 0) {
    const companies = await db.from('companies').select('id, name, fantasy_name').in('id', companyIds)
    for (const c of (companies.data ?? []) as Array<{ id: string; name: string | null; fantasy_name: string | null }>) {
      names.set(c.id, companyDisplayName(c))
    }
  }

  const out: Array<{ company: string }> = []
  for (const r of requests) {
    const company =
      r.recipient_company_name?.trim() ||
      (r.recipient_company_id ? names.get(r.recipient_company_id) : '') ||
      'a buyer'
    if (!out.some((o) => o.company === company)) out.push({ company })
  }
  return out
}
