/**
 * Which laboratory's data a lab user may read and write.
 *
 *   - A user of the HQ laboratory (`laboratories.type = 'hq'`: Santos), and any
 *     global admin, may READ every laboratory.
 *   - Every other lab user reads their own laboratory only.
 *   - Everybody WRITES in their own laboratory only; a global admin anywhere.
 *     HQ looking at another laboratory is looking, not working in it.
 *
 * Nothing here names a laboratory or a country: HQ is whichever lab is typed
 * 'hq'. The same rule is enforced in the database by the RESTRICTIVE policies
 * of migration 20261119000002 (qc_read_scope_lab / qc_write_scope_lab); this
 * file is the copy the server routes and the screens use.
 *
 * A user with no laboratory (a global admin without one, or a sys user who
 * reads QC rows from sys) reads every laboratory; one who is not a global
 * admin writes in HQ only (canWriteLab).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export const HQ_LAB_TYPE = 'hq'
const GLOBAL_ROLES = new Set(['global_admin', 'global_quality_admin'])

export interface LabScope {
  /** The user's own laboratory; null when they have none. */
  ownLabId: string | null
  /** Global admin: reads and writes every laboratory. */
  isGlobal: boolean
  /** Their own laboratory is the HQ. */
  isHq: boolean
}

export function buildLabScope(
  profile: { laboratory_id?: string | null; qc_role?: string | null; is_global_admin?: boolean | null } | null | undefined,
  ownLabType: string | null | undefined,
): LabScope {
  const ownLabId = profile?.laboratory_id ?? null
  return {
    ownLabId,
    isGlobal: profile?.is_global_admin === true || GLOBAL_ROLES.has(String(profile?.qc_role ?? '')),
    isHq: ownLabId !== null && String(ownLabType ?? '').toLowerCase() === HQ_LAB_TYPE,
  }
}

/** May read every laboratory: HQ staff, global admins, and users bound to no laboratory. */
export function readsAllLabs(scope: LabScope): boolean {
  return scope.isGlobal || scope.isHq || scope.ownLabId === null
}

export function canReadLab(scope: LabScope, labId: string | null | undefined): boolean {
  return readsAllLabs(scope) || (!!labId && labId === scope.ownLabId)
}

/**
 * May write in `labId`: a global admin anywhere, everyone else in their own
 * laboratory only. A non-global user with no laboratory works in HQ (their
 * settings laboratory, settingsLabFor; the database default for their rows,
 * qc_default_settings_lab()), so they write in `hqLabId` only, the same rule
 * otherLabBlock applies to their edits. (qc_write_scope_lab() is NULL for
 * them, so here the screens are the stricter of the two.)
 */
export function canWriteLab(scope: LabScope, labId: string | null | undefined, hqLabId: string | null): boolean {
  if (scope.isGlobal) return true
  const writeLab = scope.ownLabId ?? hqLabId
  return !!labId && labId === writeLab
}

/**
 * The `owner_lab_id` a register row (contact, holder, bank account) written by
 * this user carries. For routes that write with the service role, which skip
 * the database trigger that stamps it. NULL for HQ, global admins and users
 * with no laboratory: those rows belong to sys / Santos. Mirrors
 * qc_stamp_owner_lab() and qc_read_scope_lab() in migration
 * 20261124000000_company_register_lab_scope.sql.
 * Staff-gated routes only: qc_read_scope_lab() treats portal roles (client /
 * supplier / buyer) as not confined, while buildLabScope treats them as confined.
 */
export function ownerLabFor(scope: LabScope): string | null {
  return readsAllLabs(scope) ? null : scope.ownLabId
}

/**
 * Whether this user may see a register row with the given `owner_lab_id`.
 * HQ, global admins and users with no laboratory see every row; a confined
 * lab user sees its own laboratory's rows only. Mirrors the RESTRICTIVE read
 * policies of migration 20261124000000_company_register_lab_scope.sql.
 */
export function ownsRow(scope: LabScope, ownerLabId: string | null): boolean {
  return readsAllLabs(scope) || ownerLabId === scope.ownLabId
}

/**
 * The laboratory a list shows. Without a request it is the user's own; a
 * requested laboratory is honoured only when the user may read it (anything
 * else falls back to their own, never to "all").
 *
 * `readOnly` is true when the user is looking at a laboratory that is not
 * theirs: nothing may be changed from that view, not even by a global admin.
 * `labId` null means no laboratory filter (a user with none of their own).
 */
export function resolveLabView(
  scope: LabScope,
  requestedLabId: string | null | undefined,
): { labId: string | null; readOnly: boolean } {
  const requested = requestedLabId?.trim() || null
  if (requested && requested !== scope.ownLabId && canReadLab(scope, requested)) {
    return { labId: requested, readOnly: true }
  }
  return { labId: scope.ownLabId, readOnly: false }
}

/** Load the caller's scope. `db` may be the session client: a user can read their own profile and the labs. */
export async function loadLabScope(db: SupabaseClient, userId: string): Promise<LabScope> {
  const { data: profile } = await (db as any)
    .from('profiles')
    .select('laboratory_id, qc_role, is_global_admin')
    .eq('id', userId)
    .maybeSingle()
  let labType: string | null = null
  if (profile?.laboratory_id) {
    const { data: lab } = await (db as any)
      .from('laboratories')
      .select('type')
      .eq('id', profile.laboratory_id)
      .maybeSingle()
    labType = lab?.type ?? null
  }
  return buildLabScope(profile, labType)
}

export const OTHER_LAB_WRITE_ERROR =
  'This sample belongs to another laboratory: it can be viewed from here, not changed'

/**
 * Null when the caller may change this sample; otherwise the message for a 403.
 * For routes that write with the service role, where the database policies do
 * not apply. `db` is the caller's session client: the sample is read under
 * their own access, so a sample they cannot even read is refused as well.
 */
export async function labWriteBlock(db: SupabaseClient, userId: string, sampleId: string): Promise<string | null> {
  const scope = await loadLabScope(db, userId)
  if (scope.isGlobal || scope.ownLabId === null) return null
  const { data: sample } = await (db as any)
    .from('samples')
    .select('laboratory_id')
    .eq('id', sampleId)
    .maybeSingle()
  // A user with no laboratory was let through above, so no HQ id is needed here.
  return canWriteLab(scope, sample?.laboratory_id ?? null, null) ? null : OTHER_LAB_WRITE_ERROR
}
