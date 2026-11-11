import type { SupabaseClient } from '@supabase/supabase-js'
import type { VersionRow } from '@/lib/quality-spec/types'

export interface PortalQualityRow {
  id: string
  name: string
  origin: string | null
  versions: VersionRow[]
}

const COLS = 'id, client_id, custom_name, origin, is_active, template_id, template:quality_templates!client_qualities_template_id_fkey(name, name_en)'

export function qualityName(r: any): string {
  return r.custom_name?.trim() || r.template?.name_en?.trim() || r.template?.name?.trim() || 'Quality'
}

/** Active qualities of the company with all their versions. Explicit columns: no fee_* ever. */
export async function fetchCompanyQualities(
  admin: SupabaseClient<any>,
  companyId: string,
  onlyId?: string,
): Promise<PortalQualityRow[]> {
  let q: any = admin.from('client_qualities').select(COLS).eq('client_id', companyId).eq('is_active', true)
  if (onlyId) q = q.eq('id', onlyId)
  const { data, error } = await q
  if (error) throw new Error(error.message ?? 'Could not read qualities')
  const rows = ((data ?? []) as any[]).filter((r) => r.client_id === companyId && r.is_active !== false && (!onlyId || r.id === onlyId))
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const { data: vs, error: vErr } = await admin.from('client_quality_versions').select('*').in('client_quality_id', ids)
  if (vErr) throw new Error(vErr.message ?? 'Could not read versions')
  const versions = (vs ?? []) as VersionRow[]
  return rows.map((r) => ({
    id: r.id,
    name: qualityName(r),
    origin: r.origin ?? null,
    versions: versions.filter((v) => v.client_quality_id === r.id),
  }))
}

export async function fetchAuthorNames(admin: SupabaseClient<any>, versions: VersionRow[]): Promise<Map<string, string>> {
  const ids = [...new Set(versions.filter((v) => v.source === 'client' && v.created_by).map((v) => v.created_by as string))]
  const names = new Map<string, string>()
  if (ids.length === 0) return names
  const { data } = await admin.from('user_profiles').select('id, full_name, email').in('id', ids)
  for (const p of (data ?? []) as any[]) {
    const n = p.full_name || p.email
    if (n) names.set(p.id, n)
  }
  return names
}
