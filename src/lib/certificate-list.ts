/**
 * What a row of the Certificates list prints, as pure functions of the row the
 * list API returns. A search for a contract number returns every certificate
 * filed under it (PSS and SS, rejected and approved, one per container), so a
 * row must tell itself apart: the Wolthers contract, the quality, each client's
 * own contract reference, and the decision at a glance.
 */

export interface CertificateListSample {
  sample_type?: string | null
  client_id?: string | null
  importer_id?: string | null
  roaster_id?: string | null
  end_client_id?: string | null
  importer_is_qc_client?: boolean | null
  buyer_contract_nr?: string | null
  roaster_contract_nr?: string | null
  qc_client_contract_nr?: string | null
  end_client_contract_nr?: string | null
  quality_name?: string | null
  quality_spec?: { custom_name?: string | null; template?: { name?: string | null } | null } | null
}

const text = (v: string | null | undefined) => (v ?? '').trim() || null

/**
 * The QC client's own contract reference, taken from the role the client
 * plays on the sample: an end client's, a roaster's, the buyer's when the
 * importer is the QC client, else the QC client's own slot. Falls back to the
 * buyer's ref, which is what every QC client file carried before the per-role
 * slots existed.
 */
export function clientContractRef(s: CertificateListSample | null | undefined): string | null {
  if (!s) return null
  const client = s.client_id ?? null
  if (client && client === s.end_client_id && text(s.end_client_contract_nr)) return text(s.end_client_contract_nr)
  if (client && client === s.roaster_id && text(s.roaster_contract_nr)) return text(s.roaster_contract_nr)
  if ((s.importer_is_qc_client || (client && client === s.importer_id)) && text(s.buyer_contract_nr)) {
    return text(s.buyer_contract_nr)
  }
  return text(s.qc_client_contract_nr) ?? text(s.buyer_contract_nr)
}

/** The quality as the lot was registered, else its specification's name. */
export function qualityLine(s: CertificateListSample | null | undefined): string | null {
  if (!s) return null
  return text(s.quality_name) ?? text(s.quality_spec?.custom_name) ?? text(s.quality_spec?.template?.name)
}

export type CertificateDecision = 'approved' | 'rejected' | 'other'

/** Approved or rejected, as the status badge reads it: the certificate's flag, the sample's stage as fallback. */
export function certificateDecision(cert: {
  status: string
  is_rejected?: boolean | null
  sample?: { workflow_stage?: string | null } | null
}): CertificateDecision {
  if (cert.status !== 'issued') return 'other'
  return cert.is_rejected === true || cert.sample?.workflow_stage === 'rejected' ? 'rejected' : 'approved'
}

/** PSS / SS / Type as a short tag, or null. */
export function sampleTypeTag(sampleType: string | null | undefined): string | null {
  const t = (sampleType || '').toLowerCase()
  if (t === 'pss' || t === 'ss') return t.toUpperCase()
  if (t === 'type') return 'Type'
  if (t === 'stocklot') return 'Stocklot'
  return null
}
