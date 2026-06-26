import { QC_CERTIFICATES_PURPOSE } from '@/lib/approval-notification/resolve-panels'

/** A contact row as the QC-contacts feature reads/writes it (a subset of the shared `contacts` table). */
export interface QcContactRecord {
  id: string
  company_id: string
  email: string | null
  name: string
  nickname: string | null
  phone: string | null
  whatsapp: string | null
  preferred_language: string | null
  is_group: boolean
  is_primary: boolean | null
  is_active: boolean
  routing_purposes: string[]
}

/** Columns to select for a QcContactRecord — shared by the module and routes. */
export const QC_CONTACT_COLUMNS =
  'id, company_id, email, name, nickname, phone, whatsapp, preferred_language, is_group, is_primary, is_active, routing_purposes'

/** True when `purposes` already contains the QC-certificate tag. */
export function hasQcCertTag(purposes: string[] | null | undefined): boolean {
  return Array.isArray(purposes) && purposes.includes(QC_CERTIFICATES_PURPOSE)
}

/** `purposes` with the QC-cert tag added (set-union; no duplicates; preserves order + other tags). */
export function addQcCertTag(purposes: string[] | null | undefined): string[] {
  const base = Array.isArray(purposes) ? [...purposes] : []
  return hasQcCertTag(base) ? base : [...base, QC_CERTIFICATES_PURPOSE]
}

/** `purposes` with ONLY the QC-cert tag removed (every other tag untouched). */
export function removeQcCertTag(purposes: string[] | null | undefined): string[] {
  const base = Array.isArray(purposes) ? purposes : []
  return base.filter((p) => p !== QC_CERTIFICATES_PURPOSE)
}

/** Wolthers internal address — the resolver treats these as house CC, not a TO recipient. */
export function isInternalEmail(email: string | null | undefined): boolean {
  return !!email && /@wolthers\.com$/i.test(email)
}

/** Split QC-cert contacts into people and group inboxes, each ordered primary-first then name. */
export function splitQcContacts(rows: QcContactRecord[]): {
  people: QcContactRecord[]
  groups: QcContactRecord[]
} {
  const order = (a: QcContactRecord, b: QcContactRecord): number => {
    const ap = a.is_primary ? 0 : 1
    const bp = b.is_primary ? 0 : 1
    if (ap !== bp) return ap - bp
    return (a.name || '').localeCompare(b.name || '')
  }
  return {
    people: rows.filter((r) => !r.is_group).sort(order),
    groups: rows.filter((r) => r.is_group).sort(order),
  }
}
