import type { SupabaseClient } from '@supabase/supabase-js'
import { rejectionDetailOf, type RejectionDetail } from '@/lib/reports/performance-data'
import { selectInChunks } from '@/lib/supabase-in-chunks'

interface QaRow { sample_id: string | null; green_bean_data: unknown; resolved_defects: unknown; created_at: string }

/** The named defects of each lab sample's latest quality assessment; samples without any named defect are absent. */
export async function fetchRejectionDetails(
  admin: SupabaseClient,
  labSampleIds: string[],
): Promise<Map<string, RejectionDetail>> {
  const out = new Map<string, RejectionDetail>()
  const ids = [...new Set(labSampleIds)]
  if (ids.length === 0) return out
  const { data, error } = await selectInChunks<QaRow>(ids, chunk =>
    admin
      .from('quality_assessments')
      .select('sample_id, green_bean_data, resolved_defects, created_at')
      .in('sample_id', chunk)
      .order('created_at', { ascending: false }) as unknown as Promise<{ data: QaRow[] | null; error: unknown }>)
  if (error) throw error
  const latest = new Map<string, QaRow>()
  for (const a of (data ?? []).sort((x, y) => y.created_at.localeCompare(x.created_at))) {
    if (a.sample_id && !latest.has(a.sample_id)) latest.set(a.sample_id, a)
  }
  for (const [id, a] of latest) {
    const detail = rejectionDetailOf({ green: a.green_bean_data, resolved: a.resolved_defects })
    if (detail) out.set(id, detail)
  }
  return out
}
