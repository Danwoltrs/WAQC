import type { SearchableSelectOption } from '@/components/ui/searchable-select'

// Builds one row for the "link an approved PSS" picker in SS intake.
//
// People never reference a PSS by its internal SAN lab number — they quote the
// official certificate number, a contract number, the exporter's sample number,
// or the supplier. So the visible label leads with the official reference
// (mirroring the priority used by the /samples/qc tracking list), and `keywords`
// carries every identifier a user might type so cmdk can match on any of them
// while the row stays readable.
//
// Input is the flattened sample shape from GET /api/samples (raw samples.*
// columns + flattened *_name entity labels, all fantasy-preferring).
const str = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : String(v)

// Primary reference shown for a PSS, same priority as the main tracking list:
// official certificate number > container > ICO > exporter sample > internal lab #.
// Used both as the picker row's leading token and for the linked-PSS badge so
// neither ever surfaces the internal SAN number when a real reference exists.
export function pssOfficialRef(pss: any): string | null {
  const certNumber = pss.certificate_id ? str(pss.certificate_number) : null
  return (
    certNumber ||
    str(pss.container_nr) ||
    str(pss.ico_number) ||
    str(pss.exporter_sample_number) ||
    str(pss.tracking_number)
  )
}

export function buildPssPickerOption(pss: any): SearchableSelectOption {
  const officialRef = pssOfficialRef(pss)
  const supplier = str(pss.seller_name) || str(pss.exporter_name)

  const label = [officialRef, supplier, str(pss.origin)].filter(Boolean).join(' · ')

  // Everything searchable — numbers a counterparty might quote plus every party
  // name. The internal SAN tracking number stays here (findable) even though it
  // never leads the label.
  const keywords = [
    str(pss.certificate_number),
    str(pss.tracking_number),
    str(pss.wolthers_contract_nr),
    str(pss.seller_contract_nr),
    str(pss.shipper_contract_nr),
    str(pss.exporter_contract_nr),
    str(pss.buyer_contract_nr),
    str(pss.roaster_contract_nr),
    str(pss.qc_client_contract_nr),
    str(pss.end_client_contract_nr),
    str(pss.supplier_contract_nr),
    str(pss.exporter_sample_number),
    str(pss.ico_number),
    str(pss.container_nr),
    str(pss.seller_name),
    str(pss.exporter_name),
    str(pss.importer_name),
    str(pss.roaster_name),
    str(pss.qc_client_name),
    str(pss.end_client_name),
    str(pss.supplier),
    str(pss.origin),
    str(pss.quality_name),
  ].filter((v): v is string => Boolean(v))

  return { value: pss.id, label, keywords: [...new Set(keywords)] }
}

// A sub-contract's official reference: its minted certificate number, or its
// tracking number when a cert has not been minted yet.
export function subContractRef(sc: any): string | null {
  return str(sc?.certificate_number) || str(sc?.tracking_number)
}

// One picker row for a single sub-contract (container/buyer split). Leads with
// the leaf's own official ref, then its buyer/importer and the mother's origin.
function buildSubContractOption(sc: any, mother: any): SearchableSelectOption {
  const ref = subContractRef(sc)
  const party = str(sc?.importer_name) || str(sc?.roaster_name) || str(sc?.qc_client_name)
  const label = [ref, party, str(mother?.origin)].filter(Boolean).join(' · ')

  const keywords = [
    str(sc?.certificate_number),
    str(sc?.tracking_number),
    str(sc?.wolthers_contract_nr),
    str(sc?.buyer_contract_nr),
    str(sc?.roaster_contract_nr),
    str(sc?.qc_client_contract_nr),
    str(sc?.end_client_contract_nr),
    str(sc?.supplier_contract_nr),
    str(sc?.ico_number),
    str(sc?.container_nr),
    str(sc?.importer_name),
    str(sc?.roaster_name),
    str(sc?.qc_client_name),
    // Mother context so a leaf is also findable by shared identifiers. Sub-contracts
    // split the buyer side; the seller/exporter side (and its contract numbers) is
    // shared and carried only on the mother, so fold those in too.
    str(mother?.seller_name),
    str(mother?.origin),
    str(mother?.quality_name),
    str(mother?.seller_contract_nr),
    str(mother?.shipper_contract_nr),
    str(mother?.exporter_contract_nr),
    str(mother?.exporter_sample_number),
  ].filter((v): v is string => Boolean(v))

  return { value: sc.id, label, keywords: [...new Set(keywords)] }
}

// A PSS expands into its mother row plus one row per sub-contract, so an SS can
// link either the whole PSS or a specific container/buyer split.
export function buildPssPickerOptions(pss: any): SearchableSelectOption[] {
  const subs = Array.isArray(pss?.sub_contracts) ? pss.sub_contracts : []
  return [
    buildPssPickerOption(pss),
    ...subs.filter((sc: any) => sc?.id).map((sc: any) => buildSubContractOption(sc, pss)),
  ]
}

// Maps a chosen picker value back to its target: a mother sample (subContract
// null) or a specific sub-contract plus the mother it belongs to.
export function resolvePssSelection(
  list: any[],
  value: string
): { mother: any; subContract: any | null } | null {
  if (!value) return null
  const mother = list.find((s: any) => s.id === value)
  if (mother) return { mother, subContract: null }
  for (const m of list) {
    const subs = Array.isArray(m?.sub_contracts) ? m.sub_contracts : []
    const sc = subs.find((c: any) => c?.id === value)
    if (sc) return { mother: m, subContract: sc }
  }
  return null
}
