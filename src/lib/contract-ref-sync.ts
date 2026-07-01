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
 * edited. Writes only on a real change. Resolves the sys contract by `contract_id`
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
      .select('seller_reference, buyer_reference')
      .eq('id', link.contractId)
      .maybeSingle()
    if (data) return chooseUniqueContractRefs([data as SysContractRefs])
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
    .select('id, contract_id, wolthers_contract_nr, seller_contract_nr, buyer_contract_nr')
    .eq('id', sampleId)
    .maybeSingle()
  if (!sample) return { motherUpdated: false, skipped: true }

  const motherRefs = await fetchSysContractRefs(admin, {
    contractId: (sample as any).contract_id,
    contractNumber: (sample as any).wolthers_contract_nr,
  })
  if (!motherRefs) return { motherUpdated: false, skipped: true }

  const patch: Record<string, string> = {}
  if (refDiffers((sample as any).seller_contract_nr, motherRefs.seller_reference)) {
    patch.seller_contract_nr = motherRefs.seller_reference as string
  }
  if (refDiffers((sample as any).buyer_contract_nr, motherRefs.buyer_reference)) {
    patch.buyer_contract_nr = motherRefs.buyer_reference as string
  }
  if (Object.keys(patch).length === 0) return { motherUpdated: false, skipped: false }

  const { error } = await admin.from('samples').update(patch).eq('id', sampleId)
  return { motherUpdated: !error, skipped: !!error }
}
