import { companyDisplayName } from '@/lib/contract-intake-mapping'

/** A row of GET /api/quality-templates/[id]/clients. */
export interface TemplateClientRow {
  id: string
  name?: string | null
  fantasy_name?: string | null
  company?: string | null
  /** The client uses a private copy made from the template, not the template itself. */
  copy?: boolean
}

export interface TemplateClient {
  id: string
  label: string
  /** True when every quality of this client on the template is a copy. */
  copy: boolean
}

/**
 * The clients a template is in use by, one per company: a client holding the
 * template itself and a copy of it is listed once, as a direct user.
 */
export function templateClientsForDisplay(rows: TemplateClientRow[] | null | undefined): TemplateClient[] {
  const byId = new Map<string, TemplateClient>()
  for (const row of rows ?? []) {
    if (!row?.id) continue
    const seen = byId.get(row.id)
    const copy = !!row.copy
    if (seen) {
      seen.copy = seen.copy && copy
      continue
    }
    const label = companyDisplayName({ id: row.id, name: row.name ?? row.company ?? '', fantasy_name: row.fantasy_name ?? null }) || 'Unnamed client'
    byId.set(row.id, { id: row.id, label, copy })
  }
  return Array.from(byId.values())
}

/** True when some client uses a private copy made from the template (rows of the clients route). */
export function hasClientCopies(rows: TemplateClientRow[] | null | undefined): boolean {
  return Array.isArray(rows) && rows.some((r) => !!r?.copy)
}
