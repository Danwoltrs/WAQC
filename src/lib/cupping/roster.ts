/**
 * Cupping rosters: who is on a session, staff and guests.
 *
 * Staff cuppers are profile ids in `cupping_sessions.cupper_ids`. Guests have
 * no profile; they live in `cupping_sessions.guest_cuppers` as
 * `[{ id, name }]` (ids minted server-side) so they can be printed on cards
 * and, later, compared. Nothing is scored against a guest yet —
 * `cupping_scores.cupper_id` is an FK to `profiles`.
 *
 * Specialty lots have had no session at all since 72b4e2b (the CVA journey
 * mints per-cupper sessions lazily, born 'active'), so their assignment now
 * creates a ROSTER session: `session_type 'cva'`, `status 'setup'`. That
 * status is what tells a roster apart from a journey session; the journey's
 * reuse query skips it.
 */
export interface GuestCupper {
  id: string
  name: string
}

export interface RosterSessionRow {
  id: string
  session_type?: string | null
  status?: string | null
  cupper_ids?: string[] | null
  guest_cuppers?: GuestCupper[] | null
  sample_ids?: string[] | null
}

export const GUEST_NAME_MAX = 60

const nameKey = (name: string) => name.trim().toLowerCase()

const mintUuid = () => globalThis.crypto.randomUUID()

/** Trim, drop blanks and non-strings, cap length, dedupe case-insensitively (first spelling wins). */
export function normalizeGuestNames(names: unknown): string[] {
  if (!Array.isArray(names)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of names) {
    if (typeof raw !== 'string') continue
    const name = raw.trim().slice(0, GUEST_NAME_MAX)
    if (!name) continue
    const key = nameKey(name)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

/**
 * The incoming name list is definitive. A name already on the session keeps
 * its id (and its stored spelling); a new name gets a fresh id; a name that
 * is gone is dropped.
 */
export function mergeGuests(
  existing: GuestCupper[] | null | undefined,
  names: unknown,
  mintId: () => string = mintUuid,
): GuestCupper[] {
  const kept = (existing ?? []).filter(
    (g): g is GuestCupper => !!g && typeof g.id === 'string' && typeof g.name === 'string',
  )
  const byKey = new Map(kept.map((g) => [nameKey(g.name), g]))
  return normalizeGuestNames(names).map((name) => byKey.get(nameKey(name)) ?? { id: mintId(), name })
}

export interface RosterInput {
  cupper_ids: string[]
  guest_names: string[]
  sample_ids: string[]
}

export interface RosterMerge {
  cupper_ids: string[]
  guest_cuppers: GuestCupper[]
  sample_ids: string[]
}

/**
 * The assign dialog's roster is definitive for staff and guests (the user
 * sees the full list and unticks to remove — same rule as the commodity
 * session); samples accumulate.
 */
export function mergeRoster(
  existing: RosterSessionRow | null,
  incoming: RosterInput,
  mintId: () => string = mintUuid,
): RosterMerge {
  return {
    cupper_ids: [...new Set(incoming.cupper_ids)],
    guest_cuppers: mergeGuests(existing?.guest_cuppers, incoming.guest_names, mintId),
    sample_ids: [...new Set([...(existing?.sample_ids ?? []), ...incoming.sample_ids])],
  }
}

export function isRosterSession(s: Pick<RosterSessionRow, 'session_type' | 'status'>): boolean {
  return s.session_type === 'cva' && s.status === 'setup'
}

/**
 * Among sessions (newest first) holding any of `sampleIds`, prefer a roster —
 * it is the one that knows everybody — else the first match.
 */
export function pickRosterSession<T extends RosterSessionRow>(sessions: T[], sampleIds: string[]): T | null {
  const wanted = new Set(sampleIds)
  const holding = sessions.filter((s) => (s.sample_ids ?? []).some((id) => wanted.has(id)))
  return holding.find(isRosterSession) ?? holding[0] ?? null
}
