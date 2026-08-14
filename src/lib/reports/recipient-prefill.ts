/**
 * Merge a client company's saved QC contacts with the addresses used on the
 * last send into the single ordered list that pre-fills the report To field.
 *
 * Contacts are the durable list; `report_recipients` remembers one-off
 * additions. Contacts therefore come first and win on a collision, carrying
 * the name and contact id the chips need to show provenance.
 */

import { isInternalEmail, type QcContactRecord } from '@/lib/qc-contacts/tags'

export interface PrefilledRecipient {
  email: string
  name: string | null
  isGroup: boolean
  /** null means this address is not a saved contact. */
  contactId: string | null
  source: 'contact' | 'last_send'
}

/**
 * `contacts` must arrive in display order (the API route sorts primary-first
 * then name; the caller concatenates people then groups). Order is preserved.
 *
 * Internal @wolthers.com CONTACTS are dropped — they are house CC, added
 * server-side, never a TO recipient. Internal addresses in `lastSendTo` are
 * kept: a deliberate manual addition is not second-guessed.
 */
export function buildToList(
  contacts: QcContactRecord[],
  lastSendTo: string[],
): PrefilledRecipient[] {
  const out: PrefilledRecipient[] = []
  const seen = new Set<string>()

  for (const c of contacts) {
    const email = (c.email ?? '').trim()
    if (!email) continue
    if (isInternalEmail(email)) continue
    const key = email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      email,
      name: (c.name ?? '').trim() || null,
      isGroup: !!c.is_group,
      contactId: c.id,
      source: 'contact',
    })
  }

  for (const raw of lastSendTo) {
    const email = (raw ?? '').trim()
    if (!email) continue
    const key = email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ email, name: null, isGroup: false, contactId: null, source: 'last_send' })
  }

  return out
}
