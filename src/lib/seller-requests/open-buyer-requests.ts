import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchGroup } from '@/lib/sample-group'
import { companyDisplayName } from '@/lib/contract-intake-mapping'

/**
 * The buyer-sample requests (sys 0989) still 'requested' on the contracts of a
 * sample's group: the sample the seller was asked to send the BUYER after a QC
 * pre-approval. Only a pre-approval makes a request point at our row
 * (`pre_approval_of`), so every such open row on the group's contracts is ours.
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

  const read = await db
    .from('shipment_samples')
    .select('id, recipient_company_id, recipient_company_name')
    .in('contract_id', contractIds)
    .not('pre_approval_of', 'is', null)
    .eq('status', 'requested')
  if (read.error) {
    if (read.error.code === '42703' || read.error.code === 'PGRST204') return []
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
      r.recipient_company_name?.trim() || (r.recipient_company_id ? names.get(r.recipient_company_id) : '') || ''
    if (company && !out.some((o) => o.company === company)) out.push({ company })
  }
  return out
}
