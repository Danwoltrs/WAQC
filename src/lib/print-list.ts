/**
 * The certificates print list: ticked certificates kept per user in
 * localStorage so they survive paging, filtering and reloads.
 *
 * An entry is a snapshot built from NAMED fields only. The internal sample
 * number (samples.tracking_number) is never copied: it must not reach storage.
 */
import { clientContractRef, type CertificateListSample } from '@/lib/certificate-list'
import { certificatesToTinSampleIds, type PrintSelectionCertificate } from '@/lib/print-selection'

export const MAX_PRINT_LIST = 300

export interface PrintListEntry {
  id: string
  certificate_number: string
  sample_id: string | null
  lab_source_sample_id: string | null
  client_name: string | null
  contract_ref: string | null
  buyer_id: string | null
  seller_id: string | null
}

export interface PrintListSource {
  id: string
  certificate_number: string
  issued_to?: string | null
  sample_id: string | null
  buyer_id?: string | null
  seller_id?: string | null
  sample?: (CertificateListSample & {
    lab_source_sample_id?: string | null
    client?: { name?: string | null; company?: string | null; fantasy_name?: string | null } | null
  }) | null
}

export function toPrintListEntry(cert: PrintListSource): PrintListEntry {
  const client = cert.sample?.client
  return {
    id: cert.id,
    certificate_number: cert.certificate_number,
    sample_id: cert.sample_id ?? null,
    lab_source_sample_id: cert.sample?.lab_source_sample_id ?? null,
    client_name: client?.fantasy_name || client?.company || client?.name || cert.issued_to || null,
    contract_ref: clientContractRef(cert.sample),
    buyer_id: cert.buyer_id ?? null,
    seller_id: cert.seller_id ?? null,
  }
}

export function printListStorageKey(userId: string): string {
  return `waqc:certificates:print-list:v1:${userId}`
}

const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null)

export function readPrintList(storage: Pick<Storage, 'getItem'> | null, userId: string): PrintListEntry[] {
  if (!storage) return []
  try {
    const raw = storage.getItem(printListStorageKey(userId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const out: PrintListEntry[] = []
    for (const item of parsed) {
      if (out.length >= MAX_PRINT_LIST) break
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      if (typeof o.id !== 'string' || typeof o.certificate_number !== 'string') continue
      out.push({
        id: o.id,
        certificate_number: o.certificate_number,
        sample_id: strOrNull(o.sample_id),
        lab_source_sample_id: strOrNull(o.lab_source_sample_id),
        client_name: strOrNull(o.client_name),
        contract_ref: strOrNull(o.contract_ref),
        buyer_id: strOrNull(o.buyer_id),
        seller_id: strOrNull(o.seller_id),
      })
    }
    return out
  } catch {
    return []
  }
}

export function writePrintList(
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null,
  userId: string,
  entries: PrintListEntry[],
): void {
  if (!storage) return
  try {
    const key = printListStorageKey(userId)
    if (entries.length === 0) storage.removeItem(key)
    else storage.setItem(key, JSON.stringify(entries))
  } catch {
    // Storage denied or full: the list simply is not persisted.
  }
}

export function printListSelection(entries: PrintListEntry[]): PrintSelectionCertificate[] {
  return entries.map((e) => ({
    sample_id: e.sample_id,
    sample: { lab_source_sample_id: e.lab_source_sample_id },
  }))
}

/** "7 certificates → 5 tins": one tin per lab unit, not per certificate. */
export function tinCountLine(entries: PrintListEntry[]): string {
  const tins = certificatesToTinSampleIds(printListSelection(entries)).length
  const n = entries.length
  return `${n} certificate${n === 1 ? '' : 's'} → ${tins} tin${tins === 1 ? '' : 's'}`
}

/** Said before generating, so the operator does not read fewer labels as a failed print. */
export function tinCountNote(entries: PrintListEntry[]): string | undefined {
  const tins = certificatesToTinSampleIds(printListSelection(entries)).length
  if (tins === entries.length) return undefined
  return `${entries.length} certificates -> ${tins} tin label${tins === 1 ? '' : 's'} (contract siblings share their lot's label).`
}
