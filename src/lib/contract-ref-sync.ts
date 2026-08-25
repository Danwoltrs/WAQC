/**
 * Auto re-pull of contract reference numbers from the linked sys.wolthers contract.
 *
 * sys.wolthers is the source of truth for a contract's seller (Ecom) reference and
 * buyer reference. QC copies them onto the sample at intake, but never re-syncs — so
 * if the reference is later corrected on sys, the QC sample keeps the stale value and
 * the certificate prints the wrong number.
 *
 * This module refreshes those two fields (mother sample + each sub-contract) from the
 * current sys contract whenever a certificate is opened or a sample/sub-contract is
 * edited — EXCEPT for references a user has corrected by hand, which are recorded in
 * `manual_ref_fields` and from then on win over sys everywhere (stored value, cert
 * render, approval email). Writes only on a real change. Resolves the sys contract by `contract_id`
 * when present, else by an EXACT `contract_number` match — and refuses to guess when a
 * number is ambiguous (contract numbers are not unique) or missing.
 *
 * Field mapping:
 *   mother sample : seller_reference -> seller_contract_nr, buyer_reference -> buyer_contract_nr
 *   sub-contract  : seller_reference -> supplier_contract_nr, buyer_reference -> buyer_contract_nr
 * (the sub-contract UI + certificate render carry the split's seller ref in
 * `supplier_contract_nr`; see certificate-supply-refs.ts.)
 */

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

export interface SysContractRefs {
  seller_reference: string | null
  buyer_reference: string | null
}

/** A sys contract row as fetched by id — carries the number so a FK can be verified. */
export type SysContractRow = SysContractRefs & { contract_number?: string | null }

/**
 * Whether a `contract_id` FK may be trusted for `expectedNumber`.
 *
 * A sample carries BOTH a `contract_id` and its own `wolthers_contract_nr`. When the
 * two disagree the row is mislinked, and following the FK prints a DIFFERENT contract's
 * references on the certificate (prod: SAN-00609/26 said 41868/26 while the FK pointed
 * at 41869/26, so the cert printed 41869/26's seller and buyer refs). Trust the FK only
 * when nothing contradicts it — an absent number on either side is not a contradiction.
 * On a contradiction the caller resolves nothing and keeps its stored QC value, because
 * there is no way to tell whether the FK or the stored number is the wrong one.
 */
export function fkAgreesWithNumber(
  fkContractNumber: string | null | undefined,
  expectedNumber: string | null | undefined,
): boolean {
  const fk = norm(fkContractNumber)
  const expected = norm(expectedNumber)
  if (!fk || !expected) return true
  return fk === expected
}

/**
 * Given the sys-contract rows that matched a link key, return the unique match's
 * references, or null when there are zero or several matches (never guess).
 */
export function chooseUniqueContractRefs(
  rows: Array<SysContractRefs> | null | undefined,
): SysContractRefs | null {
  if (!rows || rows.length !== 1) return null
  return { seller_reference: rows[0].seller_reference ?? null, buyer_reference: rows[0].buyer_reference ?? null }
}

/** Normalize for change detection: treat null/''/whitespace as "no value". */
function norm(v: string | null | undefined): string {
  return (v ?? '').trim()
}

/** Whether `incoming` (from sys) should overwrite `stored`. */
export function refDiffers(stored: string | null | undefined, incoming: string | null | undefined): boolean {
  // Only propagate a real sys value; never blank out a stored ref because sys is empty.
  if (norm(incoming) === '') return false
  return norm(stored) !== norm(incoming)
}

/**
 * Reference columns a user may pin by hand. Once pinned, the sys read-through stops
 * overwriting that column for display — the manual correction is what the certificate
 * and the approval email print.
 *
 * `seller_contract_nr` is the mother sample's seller (Ecom) reference;
 * `supplier_contract_nr` is the same reference on a sub-contract (split).
 */
export const MANUAL_REF_FIELDS = [
  'buyer_contract_nr',
  'seller_contract_nr',
  'supplier_contract_nr',
] as const

export type ManualRefField = (typeof MANUAL_REF_FIELDS)[number]

/** Whether a row's `manual_ref_fields` marker pins this column. */
export function isRefPinned(
  manualRefFields: readonly string[] | null | undefined,
  field: ManualRefField,
): boolean {
  return !!manualRefFields?.includes(field)
}

/**
 * Which value one reference should DISPLAY (certificate, approval email, portal).
 *
 * Not pinned -> sys.wolthers wins (it is the source of truth, and the stored copy may
 * have drifted since intake), falling back to the stored copy when sys has nothing.
 * Pinned     -> the stored manual value wins outright, including a deliberate clear.
 *               Without this, a staff correction made in WAQC is silently dropped at
 *               render time and the certificate prints the old sys number.
 */
export function resolveRefForDisplay(
  stored: string | null | undefined,
  sys: string | null | undefined,
  pinned: boolean,
): string | null {
  if (pinned) return norm(stored) || null
  return norm(sys) || norm(stored) || null
}

/**
 * The new `manual_ref_fields` marker after applying `patch` to `current`.
 *
 * A field is pinned only when the patch genuinely CHANGES its value — several editors
 * post their whole form on every save, so mere presence in the body would pin
 * everything and permanently freeze the sys sync. Pins are sticky: re-saving an
 * already-pinned field unchanged keeps it pinned.
 */
export function pinnedFieldsAfterPatch(
  current: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown> | null | undefined,
  alreadyPinned: readonly string[] | null | undefined,
): string[] {
  const pinned = new Set<string>(
    (alreadyPinned ?? []).filter((f): f is string => MANUAL_REF_FIELDS.includes(f as ManualRefField)),
  )
  for (const field of MANUAL_REF_FIELDS) {
    if (!patch || patch[field] === undefined) continue
    if (norm(patch[field] as string) !== norm((current ?? {})[field] as string)) pinned.add(field)
  }
  return [...pinned]
}

type Admin = SupabaseClient

let cachedAdmin: Admin | null = null
function adminClient(): Admin | null {
  if (cachedAdmin) return cachedAdmin
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  cachedAdmin = createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return cachedAdmin
}

/**
 * Resolve one sys contract's references by id (preferred) or EXACT contract number.
 * Accepts any Supabase client — pass a user-scoped client for read-through display
 * (no writes) or the service-role admin for the persist path. Returns null when the
 * link is missing or a contract number is ambiguous (never guesses).
 */
export async function fetchSysContractRefs(
  client: SupabaseClient,
  link: { contractId?: string | null; contractNumber?: string | null },
): Promise<SysContractRefs | null> {
  if (link.contractId) {
    const { data } = await client
      .from('contracts')
      .select('contract_number, seller_reference, buyer_reference')
      .eq('id', link.contractId)
      .maybeSingle()
    const row = data as SysContractRow | null
    if (row) {
      // Mislinked row (FK contradicted by the caller's own contract number): resolve
      // nothing, so the caller falls back to the stored QC value.
      if (!fkAgreesWithNumber(row.contract_number, link.contractNumber)) return null
      return chooseUniqueContractRefs([row])
    }
  }
  const num = norm(link.contractNumber)
  if (!num) return null
  const { data } = await client
    .from('contracts')
    .select('seller_reference, buyer_reference')
    .eq('contract_number', num)
    .limit(2)
  return chooseUniqueContractRefs(data as SysContractRefs[] | null)
}

/** One thing to resolve refs for, tagged with the caller's own key. */
export interface SysRefLink {
  key: string
  contractId?: string | null
  contractNumber?: string | null
}

/**
 * Pure: match each link to its sys refs. `contract_id` wins — unless the row it points
 * at carries a different contract number than the caller's, in which case the link is
 * mislinked and NOTHING resolves (the caller keeps its stored value). A contract NUMBER
 * only resolves when exactly one contract carries it (numbers are not unique — never
 * guess).
 */
export function matchSysRefsByLink(
  links: SysRefLink[],
  byId: Map<string, SysContractRow>,
  byNumber: Map<string, SysContractRefs[]>,
): Map<string, SysContractRefs> {
  const out = new Map<string, SysContractRefs>()
  for (const link of links) {
    if (link.contractId) {
      const hit = byId.get(link.contractId)
      if (hit) {
        // A FK contradicted by the row's own contract number is a mislink. We cannot
        // tell which side is wrong, so we resolve NOTHING and let the caller keep its
        // stored QC value rather than print some other contract's references.
        if (!fkAgreesWithNumber(hit.contract_number, link.contractNumber)) continue
        out.set(link.key, hit)
        continue
      }
    }
    const num = norm(link.contractNumber)
    if (!num) continue
    const unique = chooseUniqueContractRefs(byNumber.get(num))
    if (unique) out.set(link.key, unique)
  }
  return out
}

/**
 * Batch form of `fetchSysContractRefs`: resolve many links with two IN-queries
 * instead of one round-trip each. Same never-guess rule for ambiguous numbers.
 */
export async function fetchSysContractRefsBatch(
  client: SupabaseClient,
  links: SysRefLink[],
): Promise<Map<string, SysContractRefs>> {
  const ids = new Set<string>()
  const numbers = new Set<string>()
  for (const link of links) {
    if (link.contractId) ids.add(link.contractId)
    const num = norm(link.contractNumber)
    if (num) numbers.add(num)
  }
  const byId = new Map<string, SysContractRow>()
  const byNumber = new Map<string, SysContractRefs[]>()
  if (ids.size > 0) {
    const { data } = await client
      .from('contracts')
      .select('id, contract_number, seller_reference, buyer_reference')
      .in('id', [...ids])
    for (const r of (data ?? []) as Array<SysContractRow & { id: string }>) {
      byId.set(r.id, {
        seller_reference: r.seller_reference ?? null,
        buyer_reference: r.buyer_reference ?? null,
        contract_number: r.contract_number ?? null,
      })
    }
  }
  if (numbers.size > 0) {
    const { data } = await client
      .from('contracts')
      .select('contract_number, seller_reference, buyer_reference')
      .in('contract_number', [...numbers])
    for (const r of (data ?? []) as Array<SysContractRefs & { contract_number: string | null }>) {
      if (!r.contract_number) continue
      const list = byNumber.get(r.contract_number) ?? []
      list.push({ seller_reference: r.seller_reference ?? null, buyer_reference: r.buyer_reference ?? null })
      byNumber.set(r.contract_number, list)
    }
  }
  return matchSysRefsByLink(links, byId, byNumber)
}

/**
 * Persist the MOTHER sample's seller/buyer references from its linked sys contract,
 * so list/search views (which read the stored copy) stay in step with sys after an
 * editor saves the sample. Writes only on a real change; best-effort and non-fatal.
 *
 * Deliberately mother-only: sub-contract references are the user's manual entry and are
 * never overwritten here (see certificate-data.ts, which read-throughs the current sys
 * value for the certificate display without touching stored data). Certificate display
 * correctness therefore never depends on this write.
 */
export async function refreshMotherRefsFromSys(
  sampleId: string,
  opts?: { admin?: Admin },
): Promise<{ motherUpdated: boolean; skipped: boolean }> {
  const admin = opts?.admin ?? adminClient()
  if (!admin) return { motherUpdated: false, skipped: true }

  const { data: sample } = await admin
    .from('samples')
    .select('id, contract_id, wolthers_contract_nr, seller_contract_nr, buyer_contract_nr, manual_ref_fields')
    .eq('id', sampleId)
    .maybeSingle()
  if (!sample) return { motherUpdated: false, skipped: true }

  const motherRefs = await fetchSysContractRefs(admin, {
    contractId: (sample as any).contract_id,
    contractNumber: (sample as any).wolthers_contract_nr,
  })
  if (!motherRefs) return { motherUpdated: false, skipped: true }

  // A hand-pinned reference is never re-synced from sys — the staff correction stands.
  const pins = (sample as any).manual_ref_fields as string[] | null
  const patch: Record<string, string> = {}
  if (
    !isRefPinned(pins, 'seller_contract_nr') &&
    refDiffers((sample as any).seller_contract_nr, motherRefs.seller_reference)
  ) {
    patch.seller_contract_nr = motherRefs.seller_reference as string
  }
  if (
    !isRefPinned(pins, 'buyer_contract_nr') &&
    refDiffers((sample as any).buyer_contract_nr, motherRefs.buyer_reference)
  ) {
    patch.buyer_contract_nr = motherRefs.buyer_reference as string
  }
  if (Object.keys(patch).length === 0) return { motherUpdated: false, skipped: false }

  const { error } = await admin.from('samples').update(patch).eq('id', sampleId)
  return { motherUpdated: !error, skipped: !!error }
}
