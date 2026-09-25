/**
 * Per-lot inputs for the annual quality findings: the latest green grading,
 * the taints and faults its certificate prints, and — for a lot approved with
 * comments — the issued values the buyer's certificate carries.
 *
 * Every id list is chunked (selectInChunks) because a long `.in()` list breaks
 * the request URL. A failing query is logged and yields an empty result: the
 * quality page degrades, the report never fails because of it.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { selectInChunks } from '@/lib/supabase-in-chunks'
import { excludeCvaScores, excludeCvaSessions } from '@/lib/cupping-protocol-scope'
import { resolveCupDefects, type CuppingScoreRow, type ResolvedDefects } from '@/lib/quality-resolvers'
import type { IssuedValues } from '@/lib/tolerance/issued-values'
import { buyerSafeGreen, type LabUnitQuality } from './annual-quality'

export interface LabUnitRef {
  labUnitId: string
  shipper: string | null
  certificateNumber: string
}

type QaRow = { sample_id: string; green_bean_data: unknown; resolved_defects: unknown; created_at: string | null }
type ScoreRow = { sample_id: string; cupper_id: string | null; defects: CuppingScoreRow['defects'] }
type SessionRow = {
  id: string
  sample_ids: string[] | null
  cupper_ids: string[] | null
  master_cupper_id: string | null
  created_at: string | null
}
type FlagRow = { id: string; approved_with_comments: boolean | null }
type IssuedRow = { sample_id: string; issued_values: IssuedValues | null; decided_at: string | null }

/** The statuses certificate-data.ts reads a session in. */
const SESSION_STATUSES = ['setup', 'active', 'review', 'completed']

function rowsOf<T>(label: string, result: { data: T[] | null; error: unknown }): T[] {
  if (result.error) {
    console.error(`[annual-quality] ${label} query failed:`, result.error)
    return []
  }
  return result.data ?? []
}

/** Newest row per key (chunked results are only sorted within a chunk). */
function latestBy<T>(rows: T[], key: (r: T) => string, at: (r: T) => string | null): Map<string, T> {
  const out = new Map<string, T>()
  const sorted = [...rows].sort((a, b) => (at(b) ?? '').localeCompare(at(a) ?? '', 'en'))
  for (const r of sorted) if (!out.has(key(r))) out.set(key(r), r)
  return out
}

export async function fetchLabUnitQuality(
  db: SupabaseClient<any>,
  admin: SupabaseClient<any> | null,
  refs: LabUnitRef[],
): Promise<LabUnitQuality[]> {
  const firstRef = new Map<string, LabUnitRef>()
  for (const r of refs) if (!firstRef.has(r.labUnitId)) firstRef.set(r.labUnitId, r)
  const ids = [...firstRef.keys()]
  if (ids.length === 0) return []

  const assessments = rowsOf('quality_assessments', await selectInChunks<QaRow>(ids, chunk =>
    db.from('quality_assessments')
      .select('sample_id, green_bean_data, resolved_defects, created_at')
      .in('sample_id', chunk) as unknown as Promise<{ data: QaRow[] | null; error: unknown }>))
  const qaBy = latestBy(assessments, r => r.sample_id, r => r.created_at)

  const scores = rowsOf('cupping_scores', await selectInChunks<ScoreRow>(ids, chunk =>
    excludeCvaScores(db.from('cupping_scores')
      .select('sample_id, cupper_id, defects')
      .in('sample_id', chunk)) as unknown as Promise<{ data: ScoreRow[] | null; error: unknown }>))
  const scoresBy = new Map<string, ScoreRow[]>()
  for (const s of scores) {
    const list = scoresBy.get(s.sample_id) ?? []
    list.push(s)
    scoresBy.set(s.sample_id, list)
  }

  const sessions = rowsOf('cupping_sessions', await selectInChunks<SessionRow>(ids, chunk =>
    excludeCvaSessions(db.from('cupping_sessions')
      .select('id, sample_ids, cupper_ids, master_cupper_id, created_at')
      .overlaps('sample_ids', chunk)
      .in('status', SESSION_STATUSES)) as unknown as Promise<{ data: SessionRow[] | null; error: unknown }>))
  // The latest session containing each lot, as certificate-data.ts picks it.
  const sessionBy = new Map<string, SessionRow>()
  for (const s of [...sessions].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '', 'en'))) {
    for (const sid of s.sample_ids ?? []) if (!sessionBy.has(sid)) sessionBy.set(sid, s)
  }

  const needMaster = [
    ...new Set([...sessionBy.values()].filter(s => !s.master_cupper_id).flatMap(s => s.cupper_ids ?? [])),
  ]
  const flaggedMasters = new Set<string>()
  if (needMaster.length > 0) {
    const profiles = rowsOf('profiles', await selectInChunks<{ id: string }>(needMaster, chunk =>
      db.from('profiles').select('id').in('id', chunk).eq('is_master_cupper', true) as unknown as Promise<{
        data: Array<{ id: string }> | null
        error: unknown
      }>))
    for (const p of profiles) flaggedMasters.add(p.id)
  }

  // Fail CLOSED: an error here can't tell us which lots are flagged, and this
  // report spans many lots at once, so every lot's green is withheld below
  // (flagsFailed) rather than risk a flagged lot's real figures getting out.
  const flagsResult = await selectInChunks<FlagRow>(ids, chunk =>
    db.from('samples').select('id, approved_with_comments').in('id', chunk) as unknown as Promise<{
      data: FlagRow[] | null
      error: unknown
    }>)
  const flags = rowsOf('samples', flagsResult)
  const flagsFailed = flagsResult.error != null
  const flagged = new Set(flags.filter(f => f.approved_with_comments === true).map(f => f.id))

  const issuedBy = new Map<string, IssuedValues>()
  if (flagged.size > 0 && admin) {
    // Service role: sample_tolerance_approvals has no read policy. Only the
    // issued_values column is selected — the buyer-safe half of the row.
    const issued = rowsOf('sample_tolerance_approvals', await selectInChunks<IssuedRow>([...flagged], chunk =>
      admin.from('sample_tolerance_approvals')
        .select('sample_id, issued_values, decided_at')
        .in('sample_id', chunk) as unknown as Promise<{ data: IssuedRow[] | null; error: unknown }>))
    for (const [id, row] of latestBy(issued, r => r.sample_id, r => r.decided_at)) {
      if (row.issued_values) issuedBy.set(id, row.issued_values)
    }
  }

  return ids.map(id => {
    const ref = firstRef.get(id)!
    const qaRow = qaBy.get(id)
    const session = sessionBy.get(id)
    const cupperIds = session?.cupper_ids ?? []
    const lotScores = (scoresBy.get(id) ?? []).filter(
      s => cupperIds.length === 0 || (s.cupper_id !== null && cupperIds.includes(s.cupper_id)),
    )
    const master = session?.master_cupper_id ?? cupperIds.find(c => flaggedMasters.has(c)) ?? null

    let green: unknown = qaRow?.green_bean_data ?? null
    if (flagsFailed) {
      // Cannot tell which lots are flagged — withhold every lot's green rather
      // than risk a flagged lot's real figures reaching this buyer-facing report.
      green = null
    } else if (flagged.has(id)) {
      const issued = issuedBy.get(id)
      green = issued && green ? buyerSafeGreen(green, issued) : null
    }

    return {
      labUnitId: id,
      shipper: ref.shipper,
      certificateNumber: ref.certificateNumber,
      green,
      cupDefects: resolveCupDefects(
        lotScores.map(s => ({ cupper_id: s.cupper_id, scores: null, defects: s.defects })),
        master,
        (qaRow?.resolved_defects ?? null) as ResolvedDefects | null,
      ),
    }
  })
}
