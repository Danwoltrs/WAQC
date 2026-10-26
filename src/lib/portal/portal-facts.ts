import type { SupabaseClient } from '@supabase/supabase-js'
import { selectAllPages } from '@/lib/supabase-paged'
import { rejectionViolations } from '@/lib/reports/rejection-reasons'
import { computeBagsAndMt } from '@/lib/report-data'
import { shownCertificateNumber } from '@/lib/sample-reference'
import { companyDisplayName } from '@/lib/contract-intake-mapping'
import type { PortalPeriod } from './portal-period'

export const NOT_RECORDED = 'Not recorded'
export type FlowStep = 'origin' | 'lab' | 'seller' | 'importer' | 'roaster'
export const FLOW_STEPS: readonly FlowStep[] = ['origin', 'lab', 'seller', 'importer', 'roaster']

export interface PortalCertFact {
  id: string
  certificateNumber: string | null
  contractRef: string | null
  issuedAt: string
  type: 'pss' | 'ss'
  rejected: boolean
  violations: string[]
  origin: string
  lab: string
  seller: string
  importer: string
  roaster: string
  quality: string
  crop: string | null
  containerNr: string | null
  mt: number | null
  labSampleId: string
}

const SELECT = `id, certificate_number, created_at, is_rejected, compliance_violations, override_comment,
  sample:samples!certificates_sample_id_fkey!inner(id, deleted_at, lab_source_sample_id, sample_type, client_id, end_client_id, origin, quality_name, crop_year, container_nr, wolthers_contract_nr, importer_is_qc_client, bag_count, bag_weight_kg, bag_type, equivalent_60kg_bags, bags_quantity_mt,
    laboratory:laboratories!samples_laboratory_id_fkey(name),
    seller:companies!samples_seller_id_fkey(name,fantasy_name),
    exporter:companies!samples_exporter_id_fkey(name,fantasy_name),
    importer:companies!samples_importer_id_fkey(name,fantasy_name),
    roaster:companies!samples_roaster_id_fkey(name,fantasy_name))`

const text = (v: unknown): string => (typeof v === 'string' && v.trim() ? v.trim() : NOT_RECORDED)
const party = (c: any): string => companyDisplayName(c) || NOT_RECORDED

export async function fetchPortalCertFacts(
  admin: SupabaseClient,
  params: { companyId: string; period: PortalPeriod; scope: 'client' | 'client_or_end' },
): Promise<PortalCertFact[]> {
  const { companyId, period, scope } = params

  const { data, error } = await selectAllPages<any>((from, to) => {
    let q: any = admin
      .from('certificates')
      .select(SELECT)
      .is('voided_at', null)
      .in('sample.sample_type', ['pss', 'ss'])
      .gte('created_at', period.start)
      .lt('created_at', period.end)
    q = scope === 'client'
      ? q.eq('sample.client_id', companyId)
      : q.or(`client_id.eq.${companyId},end_client_id.eq.${companyId}`, { referencedTable: 'sample' })
    return q.order('created_at', { ascending: false }).order('id').range(from, to)
  })
  if (error) throw new Error(error.message ?? 'Could not read certificates')

  const rows = (data ?? []).filter((r: any) => {
    const s = r.sample
    if (!s || s.deleted_at) return false
    return scope === 'client'
      ? s.client_id === companyId
      : s.client_id === companyId || s.end_client_id === companyId
  })

  let clientName: string | null = null
  if (rows.some((r: any) => !r.sample.importer && r.sample.importer_is_qc_client)) {
    const { data: co } = await admin.from('companies').select('name, fantasy_name').eq('id', companyId).maybeSingle()
    clientName = companyDisplayName(co as any) || null
  }

  return rows.map((r: any): PortalCertFact => {
    const s = r.sample
    const importer = companyDisplayName(s.importer)
      || (s.importer_is_qc_client && clientName ? clientName : '')
    const sellerName = party(s.seller)
    const labName = typeof s.laboratory?.name === 'string' ? s.laboratory.name.trim() : ''
    return {
      id: r.id,
      certificateNumber: shownCertificateNumber(r.certificate_number),
      contractRef: s.wolthers_contract_nr ?? null,
      issuedAt: r.created_at,
      type: s.sample_type === 'ss' ? 'ss' : 'pss',
      rejected: !!r.is_rejected,
      violations: rejectionViolations(!!r.is_rejected, r.compliance_violations, r.override_comment),
      origin: text(s.origin),
      lab: labName ? `${labName} lab` : NOT_RECORDED,
      seller: sellerName !== NOT_RECORDED ? sellerName : party(s.exporter),
      importer: importer || NOT_RECORDED,
      roaster: party(s.roaster),
      quality: text(s.quality_name),
      crop: s.crop_year ?? null,
      containerNr: s.container_nr ?? null,
      mt: computeBagsAndMt(s).mt,
      labSampleId: s.lab_source_sample_id ?? s.id,
    }
  })
}
