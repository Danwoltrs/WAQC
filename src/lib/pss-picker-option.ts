import type { SearchableSelectOption } from '@/components/ui/searchable-select'

// Builds the rows for the "link an approved PSS" picker in SS intake.
//
// People never reference a PSS by its internal SAN lab number — they quote the
// official certificate number, a contract number, the exporter's sample number,
// or the supplier. So the visible label leads with the official reference
// (mirroring the priority used by the /samples/qc tracking list), and `keywords`
// carries every identifier a user might type so cmdk can match on any of them
// while the row stays readable.
//
// Input is the flattened sample shape from GET /api/samples (raw samples.*
// columns + flattened *_name entity labels, all fantasy-preferring). A sample
// that covers several contracts arrives as its LAB UNIT row plus
// `sub_contracts`: one row per contract sibling, keyed by the sibling's own
// sample id and carrying only the sibling's own commercial fields.
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

// Everything searchable — numbers a counterparty might quote plus every party
// name. The internal SAN tracking number stays here (findable) even though it
// never leads the label.
function keywordsFor(pss: any): string[] {
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
  return [...new Set(keywords)]
}

export function buildPssPickerOption(pss: any): SearchableSelectOption {
  const officialRef = pssOfficialRef(pss)
  const supplier = str(pss.seller_name) || str(pss.exporter_name)
  const label = [officialRef, supplier, str(pss.origin)].filter(Boolean).join(' · ')
  return { value: pss.id, label, keywords: keywordsFor(pss) }
}

// A contract sibling as a full sample. The list endpoint sends a sibling as a
// slim row (its own id, number, certificate, buy side, refs and quantity) under
// its lab unit; everything the group shares — seller, shipper, quality, origin,
// certifications, the supply-side contract numbers — is on the lab unit row
// only. Overlaying the sibling's row on the lab unit's yields the sibling as
// GET /api/samples/[sibling id] would return it, so one prefill mapper serves
// both. The sibling's own values win outright, null included: a contract with
// no roaster has no roaster, even though the lab unit sells contract #1 to one.
export function siblingAsSample(labUnit: any, sibling: any): any {
  return {
    ...labUnit,
    ...sibling,
    lab_source_sample_id: labUnit.id,
    sub_contracts: [],
  }
}

// One picker row for a contract sibling. Leads with the sibling's own official
// ref, then its buyer (the side that differs between contracts of one lot),
// then the origin. Searchable by everything on the merged sample, so a sibling
// is reachable by the seller/shipper references the whole group shares.
function buildSiblingOption(sibling: any): SearchableSelectOption {
  const ref = pssOfficialRef(sibling)
  const party = str(sibling.importer_name) || str(sibling.roaster_name) || str(sibling.qc_client_name)
  const label = [ref, party, str(sibling.origin)].filter(Boolean).join(' · ')
  return { value: sibling.id, label, keywords: keywordsFor(sibling) }
}

// A PSS expands into its lab unit plus one row per contract sibling, so an SS
// links the exact contract it ships against.
export function buildPssPickerOptions(labUnit: any): SearchableSelectOption[] {
  const siblings = Array.isArray(labUnit?.sub_contracts) ? labUnit.sub_contracts : []
  return [
    buildPssPickerOption(labUnit),
    ...siblings.filter((sc: any) => sc?.id).map((sc: any) => buildSiblingOption(siblingAsSample(labUnit, sc))),
  ]
}

// Maps a chosen picker value back to the sample it names: a lab unit as
// listed, or a sibling merged into a full sample (see siblingAsSample).
export function resolvePssSelection(list: any[], value: string): { sample: any } | null {
  if (!value) return null
  const labUnit = list.find((s: any) => s.id === value)
  if (labUnit) return { sample: labUnit }
  for (const lu of list) {
    const siblings = Array.isArray(lu?.sub_contracts) ? lu.sub_contracts : []
    const sc = siblings.find((c: any) => c?.id === value)
    if (sc) return { sample: siblingAsSample(lu, sc) }
  }
  return null
}
