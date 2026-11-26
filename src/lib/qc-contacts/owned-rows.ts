/**
 * Contacts a laboratory's emails may go to: the ones it owns.
 * `contacts.owner_lab_id` is NULL for contacts added by sys or Santos (HQ) and
 * a lab id for contacts added by another laboratory. Santos's emails go to the
 * NULL rows; a confined lab's emails go to its own rows only.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { HQ_LAB_TYPE, ownsRow, type LabScope } from '@/lib/auth/lab-scope'
import { QC_CERTIFICATES_PURPOSE } from '@/lib/approval-notification/resolve-panels'

export interface OwnedContactOptions {
  /** Only contacts tagged qc_certificates. */
  taggedOnly?: boolean
  /** Only contacts with an email address. */
  withEmailOnly?: boolean
  /** Columns to select; defaults to `*`. */
  columns?: string
}

export async function fetchOwnedContacts<T = Record<string, any>>(
  db: SupabaseClient,
  companyIds: string[],
  ownerLabId: string | null,
  opts: OwnedContactOptions = {},
): Promise<T[]> {
  if (companyIds.length === 0) return []
  let q: any = (db as any)
    .from('contacts')
    .select(opts.columns ?? '*')
    .in('company_id', companyIds)
    .eq('is_active', true)
  q = ownerLabId === null ? q.is('owner_lab_id', null) : q.eq('owner_lab_id', ownerLabId)
  if (opts.taggedOnly) q = q.contains('routing_purposes', [QC_CERTIFICATES_PURPOSE])
  if (opts.withEmailOnly) q = q.not('email', 'is', null)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as T[]
}

// Cached per client object (one per request): lab id -> owner.
const ownerCache = new WeakMap<SupabaseClient, Map<string, Promise<string | null>>>()

/** The owner_lab_id whose contacts a sample's emails use: null for HQ (or no lab), else the lab id. */
export function ownerLabForSample(db: SupabaseClient, labId: string | null): Promise<string | null> {
  if (!labId) return Promise.resolve(null)
  let perClient = ownerCache.get(db)
  if (!perClient) { perClient = new Map(); ownerCache.set(db, perClient) }
  const hit = perClient.get(labId)
  if (hit) return hit
  const p = (async () => {
    const { data, error } = await (db as any).from('laboratories').select('type').eq('id', labId).maybeSingle()
    if (error) throw error
    return String(data?.type ?? '').toLowerCase() === HQ_LAB_TYPE ? null : labId
  })()
  perClient.set(labId, p)
  p.catch(() => perClient!.delete(labId))
  return p
}

/**
 * Whether `contactId` is a contact of `companyId` that this user may touch:
 * HQ, global admins and users with no lab see every owner's rows, a confined
 * lab user its own. For routes on the service role (404 when false).
 */
export async function contactVisibleTo(
  db: SupabaseClient,
  scope: LabScope,
  companyId: string,
  contactId: string,
): Promise<boolean> {
  const { data, error } = await (db as any)
    .from('contacts')
    .select('company_id, owner_lab_id')
    .eq('id', contactId)
    .maybeSingle()
  if (error) throw error
  return !!data && data.company_id === companyId && ownsRow(scope, data.owner_lab_id ?? null)
}
