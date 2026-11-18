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

/** True while any member's buyer sample is ticked with no destination: Send and Finalize wait for a pick. */
export function missingDestination(
  members: RequestMember[],
  value: Record<string, SellerRequests>,
  pending: ReadonlySet<string>,
): boolean {
  return members.some(
    (m) => buyerSampleOn(m, value, pending) && (value[m.sampleId] ?? m.requests).buyerSample === null,
  )
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
