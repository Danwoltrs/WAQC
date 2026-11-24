import { describe, expect, it } from 'vitest'
import { buyerSampleOn, finalClientOn, finalizeWaitsForDestination, initialPending, missingDestination, type RequestMember } from './tick-state'
import type { BuyerSampleDestination, SellerRequests, TickLock } from './types'

const dest: BuyerSampleDestination = {
  companyId: 'blaser', companyName: 'Blaser', savedAddressId: null, lines: ['Guterstrasse 4'], country: 'Switzerland',
  recipientName: null, attention: null, phone: null, instructions: null,
}
const free: TickLock = { locked: false, on: false, reason: null }
const preApproval: TickLock = { locked: false, on: true, reason: null }
const fixedOn: TickLock = { locked: true, on: true, reason: 'Blaser · Dulce: pre-approval, sample to Blaser' }
const fixedOff: TickLock = { locked: true, on: false, reason: 'Ahold: Wolthers has the final word' }

const req = (over: Partial<SellerRequests> = {}): SellerRequests => ({
  buyerSample: null, finalClientSample: null, stuffing: false, additionalSample: false, ssPerContainer: false, setBy: null, setAt: null, ...over,
})
const member = (id: string, buyerSample: TickLock, requests: SellerRequests): RequestMember => ({
  sampleId: id, heading: null, requests, locks: { buyerSample, stuffing: free },
  clientId: 'blaser', clientName: 'Blaser', importerId: null, roasterId: null,
})
const valueOf = (ms: RequestMember[]) => Object.fromEntries(ms.map((m) => [m.sampleId, m.requests]))

describe('buyerSampleOn', () => {
  it('is on with a destination, with a pending tick, and under a lock held on', () => {
    const withDest = member('a', free, req({ buyerSample: dest }))
    const waiting = member('b', free, req())
    const locked = member('c', fixedOn, req())
    const off = member('d', fixedOff, req())
    const v = valueOf([withDest, waiting, locked, off])
    expect(buyerSampleOn(withDest, v, new Set())).toBe(true)
    expect(buyerSampleOn(waiting, v, new Set())).toBe(false)
    expect(buyerSampleOn(waiting, v, new Set(['b']))).toBe(true)
    expect(buyerSampleOn(locked, v, new Set())).toBe(true)
    expect(buyerSampleOn(off, v, new Set())).toBe(false)
  })

  it('reads the current value over the starting one', () => {
    const m = member('a', free, req({ buyerSample: dest }))
    expect(buyerSampleOn(m, { a: req() }, new Set())).toBe(false)
  })
})

describe('missingDestination', () => {
  it('is true for a fixed pre-approval with no address', () => {
    const m = member('a', fixedOn, req())
    expect(missingDestination([m], valueOf([m]), new Set())).toBe(true)
  })

  it('is true for a tick waiting on a pick, false once one is picked', () => {
    const m = member('a', free, req())
    expect(missingDestination([m], valueOf([m]), new Set(['a']))).toBe(true)
    expect(missingDestination([m], { a: req({ buyerSample: dest }) }, new Set(['a']))).toBe(false)
  })

  it('is false when nothing is ticked, or every tick has its address', () => {
    const a = member('a', free, req())
    const b = member('b', fixedOn, req({ buyerSample: dest }))
    const c = member('c', fixedOff, req())
    expect(missingDestination([a, b, c], valueOf([a, b, c]), new Set())).toBe(false)
  })

  it('ignores a pending id that is not one of the members', () => {
    const m = member('a', free, req())
    expect(missingDestination([m], valueOf([m]), new Set(['elsewhere']))).toBe(false)
  })
})

describe('initialPending', () => {
  it('starts a pre-approval with nothing stored and no address ticked, waiting on a pick', () => {
    const fresh = member('a', preApproval, req())
    const unticked = member('b', preApproval, req({ setBy: 'u1', setAt: '2026-11-18T10:00:00Z' }))
    const withDest = member('c', preApproval, req({ buyerSample: dest }))
    const wolthers = member('d', free, req())
    const locked = member('e', fixedOn, req())
    expect([...initialPending([fresh, unticked, withDest, wolthers, locked])]).toEqual(['a'])
  })
})

// Finalize in the cupping validation modal: only an approval can become the
// seller email that carries the buyer-sample request, so only the approve
// paths (Approve, Override & Approve, and the computed Validate / Override
// Discrepancies & Finalize) wait for an address. An explicit Reject never
// sends an approval email and stays enabled.
describe('finalizeWaitsForDestination', () => {
  it('blocks approve and computed decisions while an address is missing', () => {
    expect(finalizeWaitsForDestination(true, 'approved')).toBe(true)
    expect(finalizeWaitsForDestination(true, undefined)).toBe(true)
  })
  it('never blocks an explicit reject', () => {
    expect(finalizeWaitsForDestination(true, 'rejected')).toBe(false)
  })
  it('blocks nothing once every ticked buyer sample has its address', () => {
    expect(finalizeWaitsForDestination(false, 'approved')).toBe(false)
    expect(finalizeWaitsForDestination(false, undefined)).toBe(false)
  })
})

describe('missingDestination: the final-client sample', () => {
  it('waits while ticked with no address, and not once it has one or is unticked', () => {
    const m = member('a', free, req())
    const waiting = { a: req({ finalClientSample: { destination: null, purpose: 'final_approval' } }) }
    expect(missingDestination([m], waiting, new Set())).toBe(true)
    expect(finalClientOn(m, waiting)).toBe(true)
    const addressed = { a: req({ finalClientSample: { destination: dest, purpose: 'final_approval' } }) }
    expect(missingDestination([m], addressed, new Set())).toBe(false)
    expect(missingDestination([m], { a: req() }, new Set())).toBe(false)
    expect(finalClientOn(m, { a: req() })).toBe(false)
  })
})

