/**
 * Zone assignment payloads (spec 2026-10-13-storage-zone-assignment-design §5–§8):
 * the changes Save sends, and the history events the panels show.
 */
export const MAX_ZONE_CHANGES = 5000

/** One cubby's new client; null is general space. */
export interface ZoneChange { code: string; company_id: string | null }

/** One save's worth of cubbies moved from one client to another. */
export interface ZoneEvent {
  changed_at: string
  changed_by_name: string
  from_name: string | null
  to_name: string | null
  codes: string[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The PUT body's changes, one per cubby: the last wins when a code repeats. */
export function parseZoneChanges(input: unknown): { ok: true; value: ZoneChange[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'changes must be a list' }
  if (input.length > MAX_ZONE_CHANGES) return { ok: false, error: `At most ${MAX_ZONE_CHANGES} cubbies at a time` }
  const byCode = new Map<string, ZoneChange>()
  for (const raw of input) {
    const c = raw as { code?: unknown; company_id?: unknown } | null
    if (typeof c?.code !== 'string' || c.code.trim() === '' || c.code.length > 16) {
      return { ok: false, error: 'Each change needs a cubby code' }
    }
    if (c.company_id !== null && !(typeof c.company_id === 'string' && UUID.test(c.company_id))) {
      return { ok: false, error: `Cubby ${c.code}: unknown client` }
    }
    const code = c.code.trim().toUpperCase()
    byCode.set(code, { code, company_id: c.company_id as string | null })
  }
  return { ok: true, value: [...byCode.values()] }
}
