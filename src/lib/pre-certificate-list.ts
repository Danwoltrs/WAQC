import { shownCertificateNumber } from './sample-reference'
import { daysWaiting } from './pre-certificate'

/** One pre-certificate waiting for its container, as the Standby view lists it. */
export interface StandbyRow {
  id: string
  sampleId: string
  certificateNumber: string | null
  standbyAt: string
  daysWaiting: number
  ico: string | null
  shipper: string | null
  client: string | null
  quality: string | null
  origin: string | null
  contract: string | null
  sampleType: string | null
}

type Company = { name?: string | null; fantasy_name?: string | null } | null | undefined
const display = (c: Company): string | null => c?.fantasy_name?.trim() || c?.name?.trim() || null

export interface StandbyCertificateRecord {
  id: string
  certificate_number: string | null
  standby_at: string
  sample_id: string
  sample: {
    id: string
    deleted_at?: string | null
    ico_number: string | null
    sample_type: string | null
    origin: string | null
    quality_name: string | null
    wolthers_contract_nr: string | null
    buyer_contract_nr: string | null
    exporter?: Company
    seller?: Company
    client?: Company
  } | null
}

/** Shape the rows, oldest first: the one that has waited longest leads. */
export function toStandbyRows(records: StandbyCertificateRecord[], now: Date = new Date()): StandbyRow[] {
  return records
    .filter((r) => r.sample && !r.sample.deleted_at)
    .map((r) => ({
      id: r.id,
      sampleId: r.sample_id,
      // Never the internal lab number.
      certificateNumber: shownCertificateNumber(r.certificate_number),
      standbyAt: r.standby_at,
      daysWaiting: daysWaiting(r.standby_at, now) ?? 0,
      ico: r.sample!.ico_number?.trim() || null,
      // The shipper is the exporter; a lot that names none falls back to its seller.
      shipper: display(r.sample!.exporter) ?? display(r.sample!.seller),
      client: display(r.sample!.client),
      quality: r.sample!.quality_name?.trim() || null,
      origin: r.sample!.origin?.trim() || null,
      contract: r.sample!.wolthers_contract_nr?.trim() || r.sample!.buyer_contract_nr?.trim() || null,
      sampleType: r.sample!.sample_type,
    }))
    .sort((a, b) => a.standbyAt.localeCompare(b.standbyAt))
}

const fold = (s: string | null) => (s ?? '').toLowerCase().replace(/[\s/-]+/g, '')

/** Find by ICO number, shipper or certificate number (spaces, dashes and slashes do not matter). */
export function searchStandbyRows(rows: StandbyRow[], query: string | null | undefined): StandbyRow[] {
  const q = fold(query ?? '')
  if (!q) return rows
  return rows.filter((r) => fold(r.ico).includes(q) || fold(r.shipper).includes(q) || fold(r.certificateNumber).includes(q))
}
