/**
 * Who may see and who may change a lab's storage. Editing mirrors the check
 * inside save_lab_floor_plan() (migration 20261007000002), which is what
 * actually guards the write.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { isInternalStaffProfile } from '@/lib/auth/sample-access'

export interface StorageProfile {
  qc_role?: string | null
  is_global_admin?: boolean | null
  laboratory_id?: string | null
}

export function canViewLabStorage(p: StorageProfile | null | undefined, labId: string): boolean {
  if (!p || !isInternalStaffProfile(p)) return false
  if (p.is_global_admin === true) return true
  if (typeof p.qc_role === 'string' && p.qc_role.startsWith('global_')) return true
  return p.laboratory_id === labId
}

export function canEditLabStorage(p: StorageProfile | null | undefined, labId: string): boolean {
  if (!p) return false
  if (p.is_global_admin === true) return true
  if (p.qc_role === 'global_admin' || p.qc_role === 'global_quality_admin') return true
  return p.qc_role === 'lab_quality_manager' && p.laboratory_id === labId
}

/**
 * Who may set which client a cubby is for (its zone): anyone who works in that
 * lab, the view rule. save_storage_zones() repeats it (migration 20261013000003).
 */
export function canAssignLabZones(p: StorageProfile | null | undefined, labId: string): boolean {
  return canViewLabStorage(p, labId)
}

export async function loadStorageProfile(supabase: SupabaseClient, userId: string): Promise<StorageProfile | null> {
  const { data } = await (supabase as any)
    .from('profiles')
    .select('qc_role, is_global_admin, laboratory_id')
    .eq('id', userId)
    .maybeSingle()
  return (data as StorageProfile | null) ?? null
}
