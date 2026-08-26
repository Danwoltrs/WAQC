/**
 * The DB-touching half of reading a specialty (SCA CVA) lot's certificate
 * inputs: the newest `protocol = 'cva'` cupping_scores row for the sample,
 * and the persisted verdict columns on quality_assessments.
 *
 * Split out of certificate-data.ts so the session-scoping rule below — which
 * must match Task 9's finalize route exactly, or the certificate can
 * disagree with the decision that actually produced it — is independently
 * testable against a fake Supabase client, the same way compliance.ts is
 * characterized in compliance.characterization.test.ts.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { CVA_PROTOCOL } from '@/lib/cupping-protocol-scope'
import { pickAuthoritativeCvaRow } from '@/lib/cupping/cva-verdict'
import { parseCvaVerdictRow } from '@/lib/cupping/cva-cupping-data'
import type { CvaAssessment } from '@/types/cva'

export interface CvaCertificateInputs {
  /** The authoritative row's assessment blob, or null when none was found. */
  assessment: Pick<CvaAssessment, 'sections'> | null
  /** The persisted verdict triad — see parseCvaVerdictRow. */
  verdict: { score: number | null; minScore: number | null; passed: boolean | null }
}

/**
 * Read a sample's CVA certificate inputs.
 *
 * The verdict is queried separately from certificate-data.ts's main
 * quality_assessments SELECT (rather than folded into it): `cva_score` lives
 * behind a migration that is not yet applied in every environment, and
 * PostgREST fails an ENTIRE select when one requested column is
 * unrecognized. Bundling it into the shared query would take down
 * green_bean_data / clean_cup / uniform_cup for every sample — commodity
 * included — for as long as that gap lasts. A failure here (missing column,
 * RLS, anything) degrades to "nothing recorded" instead.
 *
 * The rail's raw material — the 8 section impressions — lives only in the
 * cupping_scores JSONB blob; it has no persisted equivalent on
 * quality_assessments. Authority follows the same rule the certified verdict
 * was decided against (Task 9's finalize route): candidate rows AND the
 * master cupper id are both scoped to the SAME session — the newest CVA
 * session that has actually scored this sample.
 *
 * Scoping only the master-cupper id to that session while still searching
 * every session's rows for it (the first version of this code) was the bug:
 * a row from an older session could win authority under a different
 * session's master-cupper designation, or a stray newer session with no
 * designation of its own could blank a real, older assessment. Both
 * candidates and the id they are matched against must come from one session.
 *
 * `quality_assessments` records no certifying session, so "the newest
 * session with a row" is a heuristic, not a certainty — a lot re-opened in a
 * stray later session after being certified can still show an empty rail
 * even with this fix, while the persisted score keeps printing (see
 * buildCvaCuppingData). That residual gap is tracked separately; this
 * function only guarantees internal consistency (never mixing which
 * session's authority applies to which session's rows), not which of two
 * sessions is "the right one" when both exist.
 */
export async function loadCvaCertificateInputs(
  supabase: SupabaseClient,
  sampleId: string,
): Promise<CvaCertificateInputs> {
  const { data: cvaVerdictRow, error: cvaVerdictError } = await (supabase as any)
    .from('quality_assessments')
    .select('cva_score, cva_min_score, cva_passed')
    .eq('sample_id', sampleId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (cvaVerdictError) {
    console.error('[cert-data] cva verdict SELECT failed for', sampleId, cvaVerdictError)
  }
  const verdict = parseCvaVerdictRow(cvaVerdictRow ?? undefined)

  const { data: cvaScoreRows } = await (supabase as any)
    .from('cupping_scores')
    .select('cupper_id, scores, session_id')
    .eq('sample_id', sampleId)
    .eq('protocol', CVA_PROTOCOL)
    .order('updated_at', { ascending: false })
  const allRows = (cvaScoreRows ?? []) as Array<{
    cupper_id: string | null
    scores: unknown
    session_id: string | null
  }>

  const newestSessionId = allRows[0]?.session_id ?? null
  let masterCupperId: string | null = null
  if (newestSessionId) {
    const { data: session } = await (supabase as any)
      .from('cupping_sessions')
      .select('master_cupper_id')
      .eq('id', newestSessionId)
      .single()
    masterCupperId = session?.master_cupper_id ?? null
  }

  // Scope candidates to the SAME session the master cupper id came from —
  // pairing an id resolved from one session against rows from a different
  // one is exactly the drift described above.
  const rowsInSession = newestSessionId
    ? allRows.filter((r) => r.session_id === newestSessionId)
    : []
  const authoritativeRow = pickAuthoritativeCvaRow(rowsInSession, masterCupperId)
  const assessment: Pick<CvaAssessment, 'sections'> | null =
    authoritativeRow?.scores && typeof authoritativeRow.scores === 'object'
      ? (authoritativeRow.scores as CvaAssessment)
      : null

  return { assessment, verdict }
}
