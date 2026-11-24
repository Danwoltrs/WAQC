import { describe, it, expect } from 'vitest'
import { resolveRules, tickLocks, startingRequests, enforceLocks } from './rules'
import { dropUnaddressed, sellerRequestsFromDb, sellerRequestsInputSchema, sellerRequestsToDb } from './types'
import type { BuyerSampleDestination, ResolvedRules, SellerRequests } from './types'

const dest = (over: Partial<BuyerSampleDestination> = {}): BuyerSampleDestination => ({
  companyId: 'c1', companyName: 'Blaser', savedAddressId: 'a1', lines: ['Street 1', '3000 Bern'],
  country: 'CH', recipientName: null, attention: 'QC', phone: null, instructions: null, ...over,
})
const rules = (over: Partial<ResolvedRules> = {}): ResolvedRules => ({
  finalWord: 'wolthers', fixed: false, addressId: null, stuffing: 'off',
  finalWordFrom: 'default', stuffingFrom: 'default', ...over,
})
const req = (over: Partial<SellerRequests> = {}): SellerRequests => ({
  buyerSample: null, finalClientSample: null, stuffing: false, additionalSample: false, ssPerContainer: false, setBy: null, setAt: null, ...over,
})

describe('resolveRules', () => {
  it('defaults', () => {
    expect(resolveRules(null, null)).toEqual({
      finalWord: 'wolthers', fixed: false, addressId: null, stuffing: 'off',
      finalWordFrom: 'default', stuffingFrom: 'default',
    })
  })
  it('quality wins per field', () => {
    const r = resolveRules(
      { finalWord: 'wolthers', stuffing: 'prechecked' },
      { finalWord: 'pre_approval', fixed: true, addressId: null, stuffing: null },
    )
    expect(r).toMatchObject({ finalWord: 'pre_approval', fixed: true, stuffing: 'prechecked', finalWordFrom: 'quality', stuffingFrom: 'buyer' })
  })
})

describe('resolveRules fixed follows the final-word source', () => {
  it('stale quality fixed is ignored when the final word is inherited', () => {
    expect(resolveRules({ fixed: false }, { finalWord: null, fixed: true, addressId: null, stuffing: null }).fixed).toBe(false)
  })
  it('buyer fixed is not inherited by a quality final word', () => {
    expect(resolveRules({ finalWord: 'wolthers', fixed: true }, { finalWord: 'pre_approval', fixed: null, addressId: null, stuffing: null }).fixed).toBe(false)
  })
})

describe('tickLocks', () => {
  it('Ahold: wolthers fixed', () => {
    const l = tickLocks(rules({ fixed: true, finalWordFrom: 'buyer' }), { clientName: 'Ahold', qualityName: null })
    expect(l.buyerSample).toEqual({ locked: true, on: false, reason: 'Ahold: Wolthers has the final word' })
  })
  it('Blaser Dulce: pre-approval fixed from quality', () => {
    const l = tickLocks(rules({ finalWord: 'pre_approval', fixed: true, finalWordFrom: 'quality' }), { clientName: 'Blaser', qualityName: 'Dulce' })
    expect(l.buyerSample.reason).toBe('Blaser · Dulce: pre-approval, sample to Blaser')
    expect(l.buyerSample.locked).toBe(true)
    expect(l.buyerSample.on).toBe(true)
  })
  it('stuffing fixed_on from buyer', () => {
    const l = tickLocks(rules({ stuffing: 'fixed_on', stuffingFrom: 'buyer' }), { clientName: 'Blaser', qualityName: 'Dulce' })
    expect(l.stuffing.reason).toBe('Blaser: stuffing request always on')
    expect(l.stuffing.locked).toBe(true)
    expect(l.stuffing.on).toBe(true)
  })
  it('unfixed is unlocked', () => {
    const l = tickLocks(rules(), { clientName: 'X', qualityName: null })
    expect(l).toEqual({ buyerSample: { locked: false, on: false, reason: null }, stuffing: { locked: false, on: false, reason: null } })
  })
  it('an unfixed pre-approval is unlocked but points on (it starts ticked)', () => {
    const l = tickLocks(rules({ finalWord: 'pre_approval' }), { clientName: 'Blaser', qualityName: null })
    expect(l.buyerSample).toEqual({ locked: false, on: true, reason: null })
  })
  it('prechecked stuffing is neither locked nor held on', () => {
    const l = tickLocks(rules({ stuffing: 'prechecked' }), { clientName: 'Blaser', qualityName: null })
    expect(l.stuffing).toEqual({ locked: false, on: false, reason: null })
  })
})

describe('startingRequests', () => {
  it('pre_approval without stored uses default destination', () => {
    expect(startingRequests(rules({ finalWord: 'pre_approval' }), null, dest()).buyerSample).toEqual(dest())
  })
  it('wolthers without stored is null', () => {
    expect(startingRequests(rules(), null, dest()).buyerSample).toBeNull()
  })
  it('stored wins when not fixed', () => {
    const stored = req({ buyerSample: dest({ lines: ['Other'] }) })
    expect(startingRequests(rules(), stored, null).buyerSample).toEqual(stored.buyerSample)
    expect(startingRequests(rules({ finalWord: 'pre_approval' }), req(), dest()).buyerSample).toBeNull()
  })
  it('wolthers fixed nulls stored', () => {
    expect(startingRequests(rules({ fixed: true }), req({ buyerSample: dest() }), null).buyerSample).toBeNull()
  })
  it('pre_approval fixed keeps stored changed address', () => {
    const changed = dest({ lines: ['Changed'] })
    expect(startingRequests(rules({ finalWord: 'pre_approval', fixed: true }), req({ buyerSample: changed }), dest()).buyerSample).toEqual(changed)
  })
  it('stuffing', () => {
    expect(startingRequests(rules({ stuffing: 'prechecked' }), null, null).stuffing).toBe(true)
    expect(startingRequests(rules({ stuffing: 'fixed_on' }), req({ stuffing: false }), null).stuffing).toBe(true)
    expect(startingRequests(rules({ stuffing: 'prechecked' }), req({ stuffing: false }), null).stuffing).toBe(false)
    expect(startingRequests(rules(), null, null).stuffing).toBe(false)
  })
})

describe('enforceLocks', () => {
  it('wolthers fixed refuses a destination', () => {
    const r = enforceLocks(rules({ fixed: true }), req({ buyerSample: dest() }), req())
    expect(r.value.buyerSample).toBeNull()
    expect(r.refused).toEqual(['buyerSample'])
  })
  it('pre_approval fixed refuses null', () => {
    const cur = req({ buyerSample: dest() })
    const r = enforceLocks(rules({ finalWord: 'pre_approval', fixed: true }), req(), cur)
    expect(r.value.buyerSample).toEqual(dest())
    expect(r.refused).toEqual(['buyerSample'])
  })
  it('pre_approval fixed restores the default destination when current is startingRequests', () => {
    const rl = rules({ finalWord: 'pre_approval', fixed: true })
    const r = enforceLocks(rl, req(), startingRequests(rl, null, dest()))
    expect(r.value.buyerSample).toEqual(dest())
    expect(r.refused).toEqual(['buyerSample'])
  })
  it('pre_approval fixed accepts a changed address', () => {
    const inc = req({ buyerSample: dest({ lines: ['New'] }) })
    const r = enforceLocks(rules({ finalWord: 'pre_approval', fixed: true }), inc, req({ buyerSample: dest() }))
    expect(r.value.buyerSample).toEqual(inc.buyerSample)
    expect(r.refused).toEqual([])
  })
  it('fixed_on forces stuffing', () => {
    const r = enforceLocks(rules({ stuffing: 'fixed_on' }), req({ stuffing: false }), req())
    expect(r.value.stuffing).toBe(true)
    expect(r.refused).toEqual(['stuffing'])
  })
})

describe('db shape', () => {
  it('round-trips', () => {
    const r = req({ buyerSample: dest(), finalClientSample: null, stuffing: true, additionalSample: false, ssPerContainer: false, setBy: 'u1', setAt: '2026-11-18T10:00:00Z' })
    expect(sellerRequestsFromDb(sellerRequestsToDb(r))).toEqual(r)
    expect(sellerRequestsToDb(r)).toHaveProperty('set_by', 'u1')
  })
  it('round-trips the final-client sample and the two lab samples', () => {
    const r = req({
      finalClientSample: { destination: dest(), purpose: 'final_approval' },
      additionalSample: true, ssPerContainer: true, setBy: 'u1', setAt: 't',
    })
    expect(sellerRequestsFromDb(sellerRequestsToDb(r))).toEqual(r)
    expect(sellerRequestsToDb(r)).toMatchObject({
      final_client_sample: { purpose: 'final_approval' }, additional_sample: true, ss_per_container: true,
    })
  })
  it('a row stored before those ticks existed reads them as off', () => {
    expect(sellerRequestsFromDb({ buyer_sample: null, stuffing: true, set_by: 'u', set_at: 't' })).toEqual(
      req({ stuffing: true, setBy: 'u', setAt: 't' }),
    )
  })
  it('a POST from a page loaded before those ticks existed still parses, with them off', () => {
    const parsed = sellerRequestsInputSchema.parse({ buyerSample: null, stuffing: false, setBy: null, setAt: null })
    expect(parsed).toEqual(req())
  })
  it('dropUnaddressed drops a final-client tick that never got its address', () => {
    expect(dropUnaddressed(req({ finalClientSample: { destination: null, purpose: 'pre_approval' } })).finalClientSample).toBeNull()
    const kept = req({ finalClientSample: { destination: dest(), purpose: 'pre_approval' } })
    expect(dropUnaddressed(kept)).toBe(kept)
  })
  it('startingRequests keeps the stored final-client and lab ticks', () => {
    const stored = req({ finalClientSample: { destination: dest(), purpose: 'pre_approval' }, additionalSample: true, setAt: 't' })
    const start = startingRequests(rules({}), stored, null)
    expect(start.finalClientSample).toEqual(stored.finalClientSample)
    expect(start.additionalSample).toBe(true)
    expect(start.ssPerContainer).toBe(false)
  })
  it('invalid is null', () => {
    expect(sellerRequestsFromDb({ foo: 1 })).toBeNull()
    expect(sellerRequestsFromDb(null)).toBeNull()
  })
})
