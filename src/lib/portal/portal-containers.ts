// src/lib/portal/portal-containers.ts
// Containers tab. The lab's own record comes first: every SS sample carries the container it was drawn
// from, so QC-only clients (no sys contract, e.g. Dunkin) see their containers too. Where the sample's
// contract has a sys shipment holding the same container, its logistics fill in (vessel, BL, ETD/ETA).
// Sys containers on the client's contracts that no SS sample names are listed after them.
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
  /** Result of the SS certificate: null when the container has no SS certificate yet. */
  rejected: boolean | null
  /** When the lab received the SS sample; null for a container known only from sys. */
  receivedAt: string | null
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

const SAMPLE_COLS = `id, client_id, end_client_id, lab_source_sample_id, sample_type, contract_id, container_nr, created_at,
  wolthers_contract_nr, quality_name,
  seller:companies!samples_seller_id_fkey(name,fantasy_name),
  exporter:companies!samples_exporter_id_fkey(name,fantasy_name)`

const SHIPMENT_SELECT = `id, contract_id, vessel_name, voyage_number, bl_number, etd, etd_actual, eta, eta_actual, transport_milestone,
  shipment_containers!shipment_containers_shipment_id_fkey(container:containers!shipment_containers_container_id_fkey(container_number, seal_number))`

const nonEmpty = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const push = (arr: string[], v: string | null) => { if (v && !arr.includes(v)) arr.push(v) }

/** "MSNU 111.500-4" and "MSNU1115004" are the same container. */
export const normalizeContainerNr = (v: string): string => v.toUpperCase().replace(/[^A-Z0-9]/g, '')

interface ContractInfo { refs: string[]; certs: string[]; quality: string | null; seller: string | null }
interface Logistics { shipmentId: string; nr: string; seal: string | null; sh: any }

const sellerOf = (s: any): string | null => nonEmpty(companyDisplayName(s.seller) || companyDisplayName(s.exporter))

function logisticsFields(l: Logistics | null) {
  const sh = l?.sh
  const ms = nonEmpty(sh?.transport_milestone)
  return {
    seal: l?.seal ?? null,
    vessel: nonEmpty(sh?.vessel_name),
    voyage: nonEmpty(sh?.voyage_number),
    bl: nonEmpty(sh?.bl_number),
    etd: nonEmpty(sh?.etd_actual) ?? nonEmpty(sh?.etd),
    etdActual: !!nonEmpty(sh?.etd_actual),
    eta: nonEmpty(sh?.eta_actual) ?? nonEmpty(sh?.eta),
    etaActual: !!nonEmpty(sh?.eta_actual),
    milestone: ms ? (MILESTONE_LABEL[ms] ?? ms) : null,
  }
}

const etdOf = (l: Logistics) => nonEmpty(l.sh.etd_actual) ?? nonEmpty(l.sh.etd) ?? ''

export async function fetchPortalContainers(admin: SupabaseClient, companyId: string): Promise<PortalContainerRow[]> {
  const scope = `client_id.eq.${companyId},end_client_id.eq.${companyId}`
  const ours = (s: any) => s && (s.client_id === companyId || s.end_client_id === companyId)

  const [ssRes, contractRes] = await Promise.all([
    selectAllPages<any>((from, to) =>
      admin.from('samples').select(SAMPLE_COLS)
        .or(scope).is('deleted_at', null).eq('sample_type', 'ss').not('container_nr', 'is', null)
        .order('id').range(from, to) as any),
    selectAllPages<any>((from, to) =>
      admin.from('samples').select(SAMPLE_COLS)
        .or(scope).is('deleted_at', null).not('contract_id', 'is', null)
        .order('id').range(from, to) as any),
  ])
  if (ssRes.error) throw new Error(ssRes.error.message ?? 'Could not read samples')
  if (contractRes.error) throw new Error(contractRes.error.message ?? 'Could not read samples')

  const ssSamples = (ssRes.data ?? []).filter((s: any) => ours(s) && s.sample_type === 'ss' && nonEmpty(s.container_nr))
  const contractSamples = (contractRes.data ?? []).filter((s: any) => ours(s) && s.contract_id)

  const byContract = new Map<string, ContractInfo>()
  const sampleContract = new Map<string, string>()
  for (const s of contractSamples) {
    sampleContract.set(s.id, s.contract_id)
    const info = byContract.get(s.contract_id) ?? { refs: [], certs: [], quality: null, seller: null }
    push(info.refs, nonEmpty(s.wolthers_contract_nr))
    info.quality ??= nonEmpty(s.quality_name)
    info.seller ??= sellerOf(s)
    byContract.set(s.contract_id, info)
  }
  const contractIds = [...new Set([...byContract.keys(), ...ssSamples.map((s: any) => s.contract_id).filter(Boolean)])]
  const sampleIds = [...new Set([...sampleContract.keys(), ...ssSamples.map((s: any) => s.id)])]
  if (sampleIds.length === 0) return []

  const { data: certs, error: cErr } = await selectInChunks<any>(sampleIds, chunk =>
    admin.from('certificates').select('sample_id, certificate_number, is_rejected, created_at')
      .in('sample_id', chunk).is('voided_at', null) as any)
  if (cErr) throw new Error(cErr.message ?? 'Could not read certificates')
  const certsBySample = new Map<string, any[]>()
  for (const c of certs ?? []) {
    certsBySample.set(c.sample_id, [...(certsBySample.get(c.sample_id) ?? []), c])
    const info = byContract.get(sampleContract.get(c.sample_id) ?? '')
    if (info) push(info.certs, shownCertificateNumber(c.certificate_number))
  }

  // Sys logistics, indexed by contract + normalized container number. A sys number can hold two
  // containers ("MSBU1480571/MSNU2310535"), so each part is indexed on its own.
  const logistics = new Map<string, Logistics[]>()
  const allLogistics: Logistics[] = []
  if (contractIds.length > 0) {
    const { data: shipments, error: shErr } = await selectInChunks<any>(contractIds, chunk =>
      admin.from('shipments').select(SHIPMENT_SELECT).in('contract_id', chunk) as any)
    if (shErr) throw new Error(shErr.message ?? 'Could not read shipments')
    for (const sh of shipments ?? []) {
      if (!contractIds.includes(sh.contract_id)) continue
      for (const link of sh.shipment_containers ?? []) {
        const nr = nonEmpty(link?.container?.container_number)
        if (!nr) continue
        if (allLogistics.some(l => l.shipmentId === sh.id && l.nr === nr)) continue
        const l: Logistics = { shipmentId: sh.id, nr, seal: nonEmpty(link.container.seal_number), sh }
        allLogistics.push(l)
        for (const part of nr.split('/')) {
          const key = `${sh.contract_id}:${normalizeContainerNr(part)}`
          logistics.set(key, [...(logistics.get(key) ?? []), l])
        }
      }
    }
  }

  // One row per physical SS sample: contract siblings share one container and are merged.
  const groups = new Map<string, any[]>()
  for (const s of ssSamples) {
    const key = s.lab_source_sample_id ?? s.id
    groups.set(key, [...(groups.get(key) ?? []), s])
  }

  const used = new Set<Logistics>()
  const lab: PortalContainerRow[] = []
  for (const group of groups.values()) {
    const first = group[0]
    const containerNr = nonEmpty(first.container_nr)!
    const norm = normalizeContainerNr(containerNr)
    const matches = group.flatMap((s: any) => (s.contract_id ? logistics.get(`${s.contract_id}:${norm}`) ?? [] : []))
    const match = matches.sort((a, b) => etdOf(b).localeCompare(etdOf(a)))[0] ?? null
    if (match) used.add(match)

    const certificates: string[] = []
    const contractRefs: string[] = []
    let rejected: boolean | null = null
    for (const s of group) {
      push(contractRefs, nonEmpty(s.wolthers_contract_nr))
      for (const c of certsBySample.get(s.id) ?? []) {
        push(certificates, shownCertificateNumber(c.certificate_number))
        rejected = (rejected ?? false) || !!c.is_rejected
      }
    }
    lab.push({
      containerNr,
      certificates,
      rejected,
      receivedAt: nonEmpty(first.created_at),
      contractRefs,
      quality: group.map((s: any) => nonEmpty(s.quality_name)).find(Boolean) ?? null,
      seller: group.map(sellerOf).find(Boolean) ?? null,
      ...logisticsFields(match),
    })
  }
  lab.sort((a, b) => (b.receivedAt ?? '').localeCompare(a.receivedAt ?? '') || a.containerNr.localeCompare(b.containerNr))

  const sysOnly: PortalContainerRow[] = []
  for (const l of allLogistics) {
    if (used.has(l)) continue
    const info = byContract.get(l.sh.contract_id)
    if (!info) continue
    sysOnly.push({
      containerNr: l.nr,
      certificates: [...info.certs],
      rejected: null,
      receivedAt: null,
      contractRefs: [...info.refs],
      quality: info.quality,
      seller: info.seller,
      ...logisticsFields(l),
    })
  }
  sysOnly.sort((a, b) => {
    if (a.etd === b.etd) return a.containerNr.localeCompare(b.containerNr)
    if (!a.etd) return 1
    if (!b.etd) return -1
    return a.etd < b.etd ? 1 : -1
  })

  return [...lab, ...sysOnly]
}

/** Case-insensitive search over container, contract, certificate, vessel and BL. Empty matches all. */
export function matchContainerSearch(row: PortalContainerRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  // "msnu1115004" finds "MSNU 111.500-4"; only for queries with a letter, so contract numbers stay exact.
  if (/[a-z]/.test(q) && normalizeContainerNr(row.containerNr).includes(normalizeContainerNr(q))) return true
  return [row.containerNr, ...row.contractRefs, ...row.certificates, row.vessel, row.bl]
    .some(v => typeof v === 'string' && v.toLowerCase().includes(q))
}
