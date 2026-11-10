// One list of the people at a company, for the client page's "Contacts and
// portal" tab: the sys contact matrix (contacts.routing_purposes) and QC
// portal access on the same row.
//
// The matrix is sys's own. WAQC and sys share the `contacts` table (same
// Supabase project), so a tick written here is the tick sys shows, with no
// sync step. PURPOSE_GROUPS mirrors sys `src/lib/contacts/purpose-groups.ts`
// (labels, short names, order). Keep them in step: sys's
// contacts_routing_purposes_known_check rejects anything else.

import { QC_PRESETS, type QcKeySet } from '@/lib/portal/qc-keys'
import type { QcMember } from '@/lib/portal/qc-grants'
import type { InvitationSummary } from '@/lib/portal/portal-invitations'

export interface PurposeOption { value: string; label: string; short: string }
export interface PurposeGroup { label: 'Trading' | 'Logistics' | 'Quality'; purposes: PurposeOption[] }

export const PURPOSE_GROUPS: PurposeGroup[] = [
  {
    label: 'Trading',
    purposes: [
      { value: 'sale_confirmations', label: 'Sale confirmations', short: 'SC' },
      { value: 'fixation_letters', label: 'Fixation letters', short: 'PF' },
      { value: 'price_report', label: 'Price report', short: 'PR' },
    ],
  },
  {
    label: 'Logistics',
    purposes: [
      { value: 'booking_requests', label: 'Booking requests', short: 'BKG' },
      { value: 'shipping_instructions_request', label: 'Shipping instructions request', short: 'S/I' },
      { value: 'shipping_advice', label: 'Shipping advice', short: 'S/A' },
      { value: 'shipping_documents', label: 'Shipping documents', short: 'Docs' },
      { value: 'bag_marking_approval', label: 'Bag marking approval', short: 'Bag mark' },
    ],
  },
  {
    label: 'Quality',
    purposes: [
      { value: 'sample_requests', label: 'Sample requests', short: 'PSS' },
      { value: 'sample_approvals', label: 'Sample results / approvals', short: 'Appr.' },
      { value: 'qc_certificates', label: 'QC certificates', short: 'QC certs' },
      { value: 'eudr_files', label: 'EUDR / geolocation files', short: 'EUDR' },
    ],
  },
]

/** The columns QC staff may tick. Trading and Logistics are edited in sys. */
export const QC_EDITABLE_PURPOSES: readonly string[] =
  PURPOSE_GROUPS.find((g) => g.label === 'Quality')!.purposes.map((p) => p.value)

export function isQcEditablePurpose(purpose: unknown): purpose is string {
  return typeof purpose === 'string' && QC_EDITABLE_PURPOSES.includes(purpose)
}

/** `purposes` with one purpose set or cleared; every other tag is left exactly as it was. */
export function setPurpose(purposes: string[] | null | undefined, purpose: string, on: boolean): string[] {
  const base = Array.isArray(purposes) ? purposes.filter((p) => p !== purpose) : []
  if (!on) return base
  // Keep the original position when it was already there.
  const was = Array.isArray(purposes) ? purposes.indexOf(purpose) : -1
  if (was >= 0) return [...purposes!]
  return [...base, purpose]
}

/** A `contacts` row as the people tab reads it. */
export interface PersonContact {
  id: string
  name: string
  nickname: string | null
  email: string | null
  phone: string | null
  whatsapp: string | null
  preferred_language: string | null
  /** sys departments, comma-joined free text ("QC, Trading"). */
  role: string | null
  is_group: boolean
  is_primary: boolean | null
  routing_purposes: string[] | null
}

export const PERSON_CONTACT_COLUMNS =
  'id, name, nickname, email, phone, whatsapp, preferred_language, role, is_group, is_primary, routing_purposes'

export interface PersonRow {
  key: string
  name: string
  email: string | null
  contact: PersonContact | null
  member: QcMember | null
  invitation: InvitationSummary | null
}

const norm = (e: string | null | undefined) => (e ?? '').trim().toLowerCase()

/**
 * Contacts, portal members and pending invitations joined on email. Contacts
 * come first (primary, then name); people known only to the portal follow.
 */
export function mergePeople(
  contacts: PersonContact[],
  members: QcMember[],
  invitations: InvitationSummary[],
): PersonRow[] {
  const memberByEmail = new Map(members.filter((m) => m.email).map((m) => [norm(m.email), m]))
  const inviteByEmail = new Map(invitations.map((i) => [norm(i.email), i]))
  const used = new Set<string>()

  const sorted = [...contacts].sort((a, b) => {
    const ap = a.is_primary ? 0 : 1
    const bp = b.is_primary ? 0 : 1
    if (ap !== bp) return ap - bp
    return (a.name || a.email || '').localeCompare(b.name || b.email || '')
  })

  const rows: PersonRow[] = sorted.map((c) => {
    const e = norm(c.email)
    const member = e ? memberByEmail.get(e) ?? null : null
    const invitation = e && !member ? inviteByEmail.get(e) ?? null : null
    if (e) used.add(e)
    return { key: `c:${c.id}`, name: c.name || c.email || '', email: c.email, contact: c, member, invitation }
  })

  for (const m of members) {
    const e = norm(m.email)
    if (e && used.has(e)) continue
    if (e) used.add(e)
    rows.push({ key: `m:${m.userId}`, name: m.fullName || m.email || '', email: m.email, contact: null, member: m, invitation: null })
  }
  for (const i of invitations) {
    const e = norm(i.email)
    if (used.has(e)) continue
    used.add(e)
    const name = [i.firstName, i.lastName].filter(Boolean).join(' ')
    rows.push({ key: `i:${i.id}`, name: name || i.email, email: i.email, contact: null, member: null, invitation: i })
  }
  return rows
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((k) => b.includes(k))

/** "Full", "Cupper", "Viewer", or "Custom access" for any other key mix. */
export function portalAccessLabel(keys: QcKeySet): string {
  const preset = QC_PRESETS.find((p) => sameSet(p.keys.views, keys.views) && sameSet(p.keys.capabilities, keys.capabilities))
  return preset ? `${preset.label} access` : 'Custom access'
}

/** sys departments ("QC, Trading") as chips. */
export function departments(role: string | null | undefined): string[] {
  return (role ?? '').split(',').map((d) => d.trim()).filter(Boolean)
}
