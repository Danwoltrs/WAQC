/**
 * Two cupping protocols share the `cupping_sessions` and `cupping_scores`
 * tables.
 *
 * The commodity table writes one number per attribute and leaves
 * `cupping_scores.protocol` null. The specialty journey (SCA CVA 2024) writes a
 * whole CvaAssessment blob into `scores` and stamps `protocol = 'cva'` on the
 * row plus `session_type = 'cva'` on its session.
 *
 * Every commodity-side "which session does this sample belong to?" lookup takes
 * the NEWEST session containing the sample. So the moment a lot is cupped on
 * both surfaces, the commodity side silently binds to the CVA session and three
 * things break at once:
 *
 *   1. Saving a commodity score resolves to the CVA session, then inserts
 *      against it and violates uniq_cupping_scores_session_sample_cupper —
 *      surfacing as "Failed to save cupping score".
 *   2. Validation reads the CVA session's roster, which holds one participant
 *      and designates no master cupper, so the other cuppers' scores are
 *      filtered away and the master cupper's reading loses its authority.
 *   3. Aggregation and certificate rendering treat the CVA blob's keys
 *      (`version`, `score`, `u`, `d`, `sections`, …) as cupping attributes.
 *
 * Apply these helpers to every commodity-side session and score query. The CVA
 * route does the mirror-image thing with `.eq('session_type', 'cva')`.
 */

export const CVA_SESSION_TYPE = 'cva'
export const CVA_PROTOCOL = 'cva'

/** Keep a `cupping_sessions` query on the commodity protocol. */
export function excludeCvaSessions<Q>(query: Q): Q {
  return (query as any).neq('session_type', CVA_SESSION_TYPE)
}

/**
 * A ROSTER is a 'cva' session that only records who is assigned (staff +
 * guests) — written at assignment, see lib/cupping/roster.ts. It holds no
 * scores. Journey sessions are born 'active', so 'setup' is the roster
 * marker; every reader that hands a session to the journey or to finalize
 * must skip it.
 */
export const ROSTER_SESSION_STATUS = 'setup'

/** Keep a `cupping_sessions` query on journey sessions — never a roster. */
export function excludeRosterSessions<Q>(query: Q): Q {
  return (query as any).neq('status', ROSTER_SESSION_STATUS)
}

/**
 * Keep a `cupping_scores` query on the commodity protocol.
 *
 * Commodity rows leave `protocol` null, so the null branch is what matches
 * today; the `neq` branch keeps working if a future protocol is named
 * explicitly.
 */
export function excludeCvaScores<Q>(query: Q): Q {
  return (query as any).or(`protocol.is.null,protocol.neq.${CVA_PROTOCOL}`)
}

/** In-memory equivalent of `excludeCvaScores`, for rows already fetched. */
export function isCvaScoreRow(row: { protocol?: string | null } | null | undefined): boolean {
  return row?.protocol === CVA_PROTOCOL
}

/**
 * Which of these samples belong to the SPECIALTY protocol.
 *
 * A lot is specialty when its quality sits on a `quality_templates` row whose
 * `methodology` is 'cva' — the same chain the CVA picker walks
 * (samples.quality_spec_id -> client_qualities.template_id ->
 * quality_templates.methodology). It is a property of the QUALITY, not of any
 * session, which is why it has to be resolved rather than read off the row.
 *
 * The protocol split is otherwise enforced only at the session level, so
 * nothing stopped a specialty lot from being dropped into a commodity session:
 * SAN-00762/26 was assigned to cuppers minutes after intake and got a
 * `session_type: 'regular'` session, landing it on the commodity grid instead
 * of the specialty journey. Callers that build commodity sessions must filter
 * with this first.
 *
 * Fails CLOSED on a query error — returning an empty set would silently route
 * specialty lots to the commodity grid, which is the bug this exists to stop.
 */
export async function cvaSampleIds(db: any, sampleIds: string[]): Promise<Set<string>> {
  const empty = new Set<string>()
  if (!sampleIds || sampleIds.length === 0) return empty

  const { data: samples, error: samplesError } = await db
    .from('samples')
    .select('id, quality_spec_id')
    .in('id', sampleIds)
  if (samplesError) throw new Error(`cvaSampleIds: ${samplesError.message}`)

  const specIds = [...new Set(
    (samples ?? []).map((s: any) => s.quality_spec_id).filter((id: string | null): id is string => !!id),
  )]
  if (specIds.length === 0) return empty

  const { data: qualities, error: qualityError } = await db
    .from('client_qualities')
    .select('id, template_id')
    .in('id', specIds)
  if (qualityError) throw new Error(`cvaSampleIds: ${qualityError.message}`)

  const templateIds = [...new Set(
    (qualities ?? []).map((q: any) => q.template_id).filter((id: string | null): id is string => !!id),
  )]
  if (templateIds.length === 0) return empty

  const { data: templates, error: templateError } = await db
    .from('quality_templates')
    .select('id')
    .in('id', templateIds)
    .eq('methodology', CVA_PROTOCOL)
  if (templateError) throw new Error(`cvaSampleIds: ${templateError.message}`)

  const cvaTemplates = new Set((templates ?? []).map((t: any) => t.id))
  const cvaQualities = new Set(
    (qualities ?? []).filter((q: any) => cvaTemplates.has(q.template_id)).map((q: any) => q.id),
  )
  return new Set(
    (samples ?? []).filter((s: any) => cvaQualities.has(s.quality_spec_id)).map((s: any) => s.id as string),
  )
}
