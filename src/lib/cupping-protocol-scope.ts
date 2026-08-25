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
