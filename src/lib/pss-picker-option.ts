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
