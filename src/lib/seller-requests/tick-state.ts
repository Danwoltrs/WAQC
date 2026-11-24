/**
 * The seller-request ticks as the finalize modal and the send composer show
 * them. Pure and client-safe, so both screens decide alike when "Send sample
 * to buyer" is ticked and when Finalize / Send must wait for an address.
 */

import type { SellerRequests, TickLocks } from './types'

/** One contract's ticks: its starting values, its locks and who the buyer is. */
export interface RequestMember {
  sampleId: string
  /** Shown above the rows; null shows none. */
  heading: string | null
  /** The stored-or-starting values; ticking buyer sample back on restores this destination. */
  requests: SellerRequests
  locks: TickLocks
  clientId: string | null
  clientName: string | null
  importerId: string | null
  roasterId: string | null
}

/**
 * "Send sample to buyer" shows ticked when it has a destination, when it was
 * ticked and waits for one (`pending`), or when a lock holds it on (a fixed
 * pre-approval with no address on file).
 */
export function buyerSampleOn(
  m: RequestMember,
  value: Record<string, SellerRequests>,
  pending: ReadonlySet<string>,
): boolean {
  const current = value[m.sampleId] ?? m.requests
  const lock = m.locks.buyerSample
  return current.buyerSample !== null || pending.has(m.sampleId) || (lock.locked && lock.on)
}

/** "Send sample to final client" is ticked while it has a value, address or not. */
export function finalClientOn(m: RequestMember, value: Record<string, SellerRequests>): boolean {
  // Loose: a value built before the tick existed has no field at all.
  return (value[m.sampleId] ?? m.requests).finalClientSample != null
}

/**
 * True while any member's buyer sample or final-client sample is ticked with
 * no destination: Send and Finalize wait for a pick.
 */
export function missingDestination(
  members: RequestMember[],
  value: Record<string, SellerRequests>,
  pending: ReadonlySet<string>,
): boolean {
  return members.some((m) => {
    const current = value[m.sampleId] ?? m.requests
    if (buyerSampleOn(m, value, pending) && current.buyerSample === null) return true
    return current.finalClientSample != null && current.finalClientSample.destination === null
  })
}

/**
 * Whether a cupping finalize must wait for a buyer-sample address. Only an
 * approval can become the seller email that carries the request, so the
 * approve paths (manual 'approved', and a computed decision: undefined) wait;
 * an explicit 'rejected' never sends an approval email and goes ahead.
 */
export function finalizeWaitsForDestination(
  missing: boolean,
  manualDecision: 'approved' | 'rejected' | undefined,
): boolean {
  return missing && manualDecision !== 'rejected'
}

/**
 * The members that start ticked with no destination: an unfixed pre-approval
 * with nothing stored (no `setAt`: every save stamps it) and no address on
 * file. A stored "unticked" keeps its null and stays unticked. A fixed one
 * needs no entry: its lock holds it on.
 */
export function initialPending(members: RequestMember[]): Set<string> {
  return new Set(
    members
      .filter((m) => {
        const lock = m.locks.buyerSample
        return !lock.locked && lock.on && m.requests.buyerSample === null && m.requests.setAt === null
      })
      .map((m) => m.sampleId),
  )
}
