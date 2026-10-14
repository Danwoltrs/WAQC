// src/lib/portal/qc-grants.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { QC_MANAGE_USERS, isCompanyAdmin, normalizeQcKeys, qcKeysOf, type QcKeySet } from './qc-keys'

/**
 * QC portal access (spec §5.1, ruling R11 of 2026-10-14): one row per person
 * and company in WAQC's own table qc_portal_access, holding only qc_ keys.
 *
 * WAQC never reads or writes sys's company grants. sys opens a company's
 * data to anyone who has a grant row for it, whatever keys the row holds, so
 * a QC-only grant row would leak sys data. A person who also uses the sys
 * portal keeps their sys grant exactly as it is; their QC access is this row.
 *
 *   * QC company admin = qc_manage_users in capabilities, set or cleared only
 *     by the explicit manageUsers flag (staff). A write that does not mention
 *     the flag keeps what the row had.
 *   * Keys are normalized here as well, so only registry keys reach the
 *     table (its CHECK refuses anything that is not a qc_ key).
 *   * Removing access deletes the row. The login, user_profiles and any sys
 *     grant stay.
 *   * Service role only: the table has RLS on and no policies.
 */

const TABLE = 'qc_portal_access'

export interface QcAccess {
  views: string[]
  capabilities: string[]
}

function accessOf(row: { views?: string[] | null; capabilities?: string[] | null }): QcAccess {
  return { views: row.views ?? [], capabilities: row.capabilities ?? [] }
}

export function planQcAccess(existing: QcAccess | null, next: { keys: QcKeySet; manageUsers?: boolean }): QcAccess {
  const keys = normalizeQcKeys(next.keys)
  const admin = next.manageUsers ?? (existing ? isCompanyAdmin(existing) : false)
  return {
    views: [...keys.views],
    capabilities: admin ? [...keys.capabilities, QC_MANAGE_USERS] : [...keys.capabilities],
  }
}

export async function readQcAccess(admin: SupabaseClient<any>, userId: string, companyId: string): Promise<QcAccess | null> {
  const { data, error } = await admin
    .from(TABLE)
    .select('views, capabilities')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .maybeSingle()
  if (error) throw error
  return data ? accessOf(data) : null
}

export async function setQcAccess(
  admin: SupabaseClient<any>,
  args: { userId: string; companyId: string; keys: QcKeySet; manageUsers?: boolean; createdBy: string | null },
): Promise<{ before: QcAccess | null; after: QcAccess }> {
  const before = await readQcAccess(admin, args.userId, args.companyId)
  const after = planQcAccess(before, { keys: args.keys, manageUsers: args.manageUsers })
  const { error } = await admin.from(TABLE).upsert(
    {
      user_id: args.userId,
      company_id: args.companyId,
      views: after.views,
      capabilities: after.capabilities,
      updated_at: new Date().toISOString(),
      // created_by records who first gave access; an update keeps it.
      ...(before ? {} : { created_by: args.createdBy }),
    },
    { onConflict: 'user_id,company_id' },
  )
  if (error) throw error
  return { before, after }
}

export async function removeQcAccess(
  admin: SupabaseClient<any>,
  args: { userId: string; companyId: string },
): Promise<{ before: QcAccess | null }> {
  const { data, error } = await admin
    .from(TABLE)
    .delete()
    .eq('user_id', args.userId)
    .eq('company_id', args.companyId)
    .select('views, capabilities')
  if (error) throw error
  const row = Array.isArray(data) && data.length > 0 ? data[0] : null
  return { before: row ? accessOf(row) : null }
}

export interface QcMember {
  userId: string
  email: string | null
  fullName: string | null
  status: string | null
  keys: QcKeySet
  isCompanyAdmin: boolean
  lastSignInAt: string | null
}

export function toQcMembers(rows: any[], lastSignIns: ReadonlyMap<string, string | null> = new Map()): QcMember[] {
  return rows
    .map((row) => ({
      userId: row.user_id as string,
      email: row.user_profiles?.email ?? null,
      fullName: row.user_profiles?.full_name ?? null,
      status: row.user_profiles?.status ?? null,
      keys: qcKeysOf(row),
      isCompanyAdmin: isCompanyAdmin(row),
      lastSignInAt: lastSignIns.get(row.user_id) ?? null,
    }))
    .sort((a, b) => (a.fullName || a.email || '').localeCompare(b.fullName || b.email || ''))
}

/**
 * auth.users.last_sign_in_at per person. sys's user_profiles copy is only
 * refreshed by its staff heartbeat, so it is stale for portal users. Never
 * throws: a failed lookup leaves the date empty.
 */
async function lastSignInsOf(admin: SupabaseClient<any>, userIds: string[]): Promise<Map<string, string | null>> {
  const entries = await Promise.all(
    userIds.map(async (id): Promise<[string, string | null]> => {
      try {
        const { data } = await admin.auth.admin.getUserById(id)
        return [id, data?.user?.last_sign_in_at ?? null]
      } catch {
        return [id, null]
      }
    }),
  )
  return new Map(entries)
}

export async function listQcMembers(admin: SupabaseClient<any>, companyId: string): Promise<QcMember[]> {
  const { data, error } = await admin
    .from(TABLE)
    .select('user_id, views, capabilities, user_profiles(email, full_name, status)')
    .eq('company_id', companyId)
  if (error) throw error
  const rows = data ?? []
  return toQcMembers(rows, await lastSignInsOf(admin, rows.map((r: any) => r.user_id as string)))
}
