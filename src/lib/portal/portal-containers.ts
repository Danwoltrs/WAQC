// src/lib/portal/portal-containers.ts
// Containers tab: sys logistics (shipments -> shipment_containers -> containers) for the client's contracts.
// Logistics fields only: no commission, price or freight column is ever selected.
import type { SupabaseClient } from '@supabase/supabase-js'
import { selectAllPages } from '@/lib/supabase-paged'
import { selectInChunks } from '@/lib/supabase-in-chunks'
import { shownCertificateNumber } from '@/lib/sample-reference'
import { companyDisplayName } from '@/lib/contract-intake-mapping'

export const MILESTONE_LABEL: Record<string, string> = {
  empty_to_shipper: 'Empty container at shipper',
  received_at_cy: 'At container yard',
  loaded_on_vessel: 'Loaded on vessel',
  departed_awaiting_docs: 'Sailed, awaiting documents',
}

export interface PortalContainerRow {
  containerNr: string
  seal: string | null
  certificates: string[]
  contractRefs: string[]
  quality: string | null
  seller: string | null
  vessel: string | null
  voyage: string | null
  bl: string | null
  etd: string | null
  etdActual: boolean
  eta: string | null
  etaActual: boolean
  milestone: string | null
}

const SAMPLE_SELECT = `id, contract_id, wolthers_contract_nr, quality_name,
  seller:companies!samples_seller_id_fkey(name,fantasy_name),
  exporter:companies!samples_exporter_id_fkey(name,fantasy_name)`

const SHIPMENT_SELECT = `id, contract_id, vessel_name, voyage_number, bl_number, etd, etd_actual, eta, eta_actual, transport_milestone,
  shipment_containers!shipment_containers_shipment_id_fkey(container:containers!shipment_containers_container_id_fkey(container_number, seal_number))`

const nonEmpty = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const push = (arr: string[], v: string | null) => { if (v && !arr.includes(v)) arr.push(v) }

interface ContractInfo { refs: string[]; certs: string[]; quality: string | null; seller: string | null }

export async function fetchPortalContainers(admin: SupabaseClient, companyId: string): Promise<PortalContainerRow[]> {
  const { data: samples, error: sErr } = await selectAllPages<any>((from, to) =>
    admin.from('samples').select(SAMPLE_SELECT)
      .or(`client_id.eq.${companyId},end_client_id.eq.${companyId}`)
      .is('deleted_at', null)
      .not('contract_id', 'is', null)
      .order('id')
      .range(from, to) as any)
  if (sErr) throw new Error(sErr.message ?? 'Could not read samples')

  const byContract = new Map<string, ContractInfo>()
  const sampleContract = new Map<string, string>()
  for (const s of samples ?? []) {
    if (!s.contract_id) continue
    sampleContract.set(s.id, s.contract_id)
    const info = byContract.get(s.contract_id) ?? { refs: [], certs: [], quality: null, seller: null }
    push(info.refs, nonEmpty(s.wolthers_contract_nr))
    info.quality ??= nonEmpty(s.quality_name)
    info.seller ??= nonEmpty(companyDisplayName(s.seller) || companyDisplayName(s.exporter))
    byContract.set(s.contract_id, info)
  }
  const contractIds = [...byContract.keys()]
  if (contractIds.length === 0) return []

  const { data: certs, error: cErr } = await selectInChunks<any>([...sampleContract.keys()], chunk =>
    admin.from('certificates').select('sample_id, certificate_number').in('sample_id', chunk).is('voided_at', null) as any)
  if (cErr) throw new Error(cErr.message ?? 'Could not read certificates')
  for (const c of certs ?? []) {
    const info = byContract.get(sampleContract.get(c.sample_id) ?? '')
    if (info) push(info.certs, shownCertificateNumber(c.certificate_number))
  }

  const { data: shipments, error: shErr } = await selectInChunks<any>(contractIds, chunk =>
    admin.from('shipments').select(SHIPMENT_SELECT).in('contract_id', chunk) as any)
  if (shErr) throw new Error(shErr.message ?? 'Could not read shipments')

  const out = new Map<string, PortalContainerRow>()
  for (const sh of shipments ?? []) {
    const info = byContract.get(sh.contract_id)
    if (!info) continue
    const etd = nonEmpty(sh.etd_actual) ?? nonEmpty(sh.etd)
    const eta = nonEmpty(sh.eta_actual) ?? nonEmpty(sh.eta)
    const ms = nonEmpty(sh.transport_milestone)
    for (const link of sh.shipment_containers ?? []) {
      const nr = nonEmpty(link?.container?.container_number)
      if (!nr) continue
      const prev = out.get(nr)
      if (prev) {
        for (const r of info.refs) push(prev.contractRefs, r)
        for (const c of info.certs) push(prev.certificates, c)
        continue
      }
      out.set(nr, {
        containerNr: nr,
        seal: nonEmpty(link.container.seal_number),
        certificates: [...info.certs],
        contractRefs: [...info.refs],
        quality: info.quality,
        seller: info.seller,
        vessel: nonEmpty(sh.vessel_name),
        voyage: nonEmpty(sh.voyage_number),
        bl: nonEmpty(sh.bl_number),
        etd, etdActual: !!nonEmpty(sh.etd_actual),
        eta, etaActual: !!nonEmpty(sh.eta_actual),
        milestone: ms ? (MILESTONE_LABEL[ms] ?? ms) : null,
      })
    }
  }
  return [...out.values()].sort((a, b) => {
    if (a.etd === b.etd) return a.containerNr.localeCompare(b.containerNr)
    if (!a.etd) return 1
    if (!b.etd) return -1
    return a.etd < b.etd ? 1 : -1
  })
}

/** Case-insensitive search over container, contract, certificate, vessel and BL. Empty matches all. */
export function matchContainerSearch(row: PortalContainerRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [row.containerNr, ...row.contractRefs, ...row.certificates, row.vessel, row.bl]
    .some(v => typeof v === 'string' && v.toLowerCase().includes(q))
}
