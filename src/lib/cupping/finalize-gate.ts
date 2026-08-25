/**
 * Who may finalize a sample's cupping, and whether enough cuppers have scored it.
 *
 * Pure on purpose. The two protocols count "completed cuppers" differently — the
 * commodity route counts rows with no protocol, the CVA route counts its own —
 * so the count is an input rather than a query, and the rule itself is testable.
 *
 * Lifted verbatim from the commodity route's behaviour (finalize/route.ts:93-131
 * before the extraction). Changing any threshold here changes certification for
 * every lot, commodity and specialty alike.
 */

export interface FinalizeActor {
  id: string
  is_global_admin?: boolean | null
  is_master_cupper?: boolean | null
  is_q_grader?: boolean | null
  qc_role?: string | null
}

export interface FinalizeSession {
  id: string
  sample_ids: string[] | null
  cupper_ids: string[] | null
  master_cupper_id: string | null
  min_cuppers_required: number | null
  allow_single_cupper: boolean | null
}

export interface FinalizeGateInput {
  session: FinalizeSession
  sampleId: string
  actor: FinalizeActor
  /** Cuppers who have a score row for this sample, in this protocol. Duplicates fine. */
  completedCupperIds: string[]
}

export type FinalizeGate =
  | { ok: true; assignedCupperIds: string[]; isSingleCupperSession: boolean }
  | { ok: false; status: number; error: string }

/**
 * Whether this actor may finalize the session at all — global admin, master
 * cupper, Q-grader, or a cupper assigned to the session's roster.
 *
 * This is the permission half only: it does not check that a given sample
 * belongs to the session, nor how many cuppers have completed their scores.
 * assertCanFinalize layers both of those on top of this for the actual
 * finalize call. Exposed separately so a read-only surface (e.g. "should the
 * journey show a Certify step to this viewer at all?") can ask the
 * permission question without a sampleId or a completed-score count on hand.
 */
export function canActorFinalize(session: FinalizeSession, actor: FinalizeActor): boolean {
  const assignedCupperIds = session.cupper_ids ?? []
  return (
    actor.is_global_admin === true ||
    actor.is_master_cupper === true ||
    actor.is_q_grader === true ||
    assignedCupperIds.includes(actor.id)
  )
}

export function assertCanFinalize({
  session,
  sampleId,
  actor,
  completedCupperIds,
}: FinalizeGateInput): FinalizeGate {
  if (!session.sample_ids?.includes(sampleId)) {
    return { ok: false, status: 400, error: 'Sample is not part of this session' }
  }

  if (!canActorFinalize(session, actor)) {
    return { ok: false, status: 403, error: 'You do not have permission to finalize this session' }
  }

  const assignedCupperIds = Array.from(new Set(session.cupper_ids ?? []))

  // A session with one assigned cupper cannot ever reach a two-cupper minimum,
  // so it relaxes automatically rather than deadlocking.
  const isSingleCupperSession = assignedCupperIds.length === 1
  const minCuppersRequired =
    session.allow_single_cupper || isSingleCupperSession ? 1 : session.min_cuppers_required || 2

  const completedCount = new Set(
    completedCupperIds.filter((id) => assignedCupperIds.includes(id)),
  ).size

  if (completedCount < minCuppersRequired) {
    return {
      ok: false,
      status: 400,
      error: `Cannot finalize: only ${completedCount} of ${minCuppersRequired} required cuppers have completed their scores`,
    }
  }

  return { ok: true, assignedCupperIds, isSingleCupperSession }
}
