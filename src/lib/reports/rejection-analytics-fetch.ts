/**
 * Certificates for the rejection analytics page: every certificate issued in
 * [start, end), paged past PostgREST's 1000-row cap. A soft-deleted sample's
 * certificate survives for the audit and is not counted, as in the reports.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { selectAllPages } from '@/lib/supabase-paged'
import { companyDisplayName } from '@/lib/contract-intake-mapping'
import type { AnalyticsCertificate } from './rejection-analytics'
import { rejectionViolations } from './rejection-reasons'

const SELECT = `
  id, certificate_number, created_at, is_rejected, compliance_violations, override_comment,
  sample:samples!certificates_sample_id_fkey(
    id, deleted_at, sample_type, wolthers_contract_nr, buyer_contract_nr,
    client:companies!samples_client_id_fkey(name,fantasy_name),
    exporter:companies!samples_exporter_id_fkey(name,fantasy_name)
  )
`

export async function fetchAnalyticsCertificates(
  supabase: SupabaseClient,
  range: { start: string; end: string },
): Promise<AnalyticsCertificate[]> {
  const { data, error } = await selectAllPages<any>((from, to) =>
    supabase
      .from('certificates')
      .select(SELECT)
      .gte('created_at', range.start)
      .lt('created_at', range.end)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  )
  if (error) throw new Error(error.message ?? 'Could not load certificates')
  return (data ?? [])
    .filter(c => c.sample && !c.sample.deleted_at)
    .map(c => ({
      id: c.id,
      sampleId: c.sample.id,
      certificateNumber: c.certificate_number,
      issuedAt: c.created_at,
      isRejected: !!c.is_rejected,
      violations: rejectionViolations(!!c.is_rejected, c.compliance_violations, c.override_comment),
      contract: c.sample.wolthers_contract_nr ?? null,
      buyerContract: c.sample.buyer_contract_nr ?? null,
      client: companyDisplayName(c.sample.client) || null,
      shipper: companyDisplayName(c.sample.exporter) || null,
      sampleType: c.sample.sample_type ?? null,
    }))
}
