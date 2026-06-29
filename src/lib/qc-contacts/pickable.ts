import { QC_CERTIFICATES_PURPOSE } from '@/lib/approval-notification/resolve-panels'
import { hasQcCertTag, isInternalEmail } from './tags'

/** A raw contact row as read from the shared `contacts` table for the pickable list. */
export interface RawContactRow {
  id: string
  name: string | null
  nickname: string | null
  email: string | null
  is_group: boolean | null
  is_active: boolean | null
  routing_purposes: string[] | null
}

/** A contact the sender can pick as a QC-cert recipient (camelCase, email guaranteed). */
export interface PickableContact {
  id: string
  name: string
  nickname: string | null
  email: string
  isGroup: boolean
}

/**
 * Filter + map a company's contacts to the pickable pool: active, has an email,
 * NOT already tagged qc_certificates (those are already recipients), and NOT an
 * internal @wolthers.com address (house CC, never a TO recipient). Ordered by
 * name then email, case-insensitive. Pure — no DB.
 */
export function toPickableContacts(rows: RawContactRow[]): PickableContact[] {
  const out: PickableContact[] = []
  for (const r of rows) {
    if (r.is_active === false) continue
    const email = (r.email ?? '').trim()
    if (!email) continue
    if (isInternalEmail(email)) continue
    if (hasQcCertTag(r.routing_purposes)) continue
    out.push({
      id: r.id,
      name: (r.name ?? '').trim(),
      nickname: r.nickname,
      email,
      isGroup: !!r.is_group,
    })
  }
  out.sort((a, b) => {
    const aNameLower = a.name.toLowerCase()
    const bNameLower = b.name.toLowerCase()
    // Sort empty names to the end
    if (aNameLower === '' && bNameLower !== '') return 1
    if (aNameLower !== '' && bNameLower === '') return -1
    const byName = aNameLower.localeCompare(bNameLower)
    return byName !== 0 ? byName : a.email.toLowerCase().localeCompare(b.email.toLowerCase())
  })
  return out
}

// Re-export so route/UI import the constant from one place if needed.
export { QC_CERTIFICATES_PURPOSE }
