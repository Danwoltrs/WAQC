import { describe, it, expect } from 'vitest'
import {
  isRosterSession,
  mergeGuests,
  mergeRoster,
  normalizeGuestNames,
  pickRosterSession,
} from './roster'

/** Deterministic id minter: guest-1, guest-2, … */
const mint = () => {
  let n = 0
  return () => `guest-${++n}`
}

describe('normalizeGuestNames', () => {
  it('trims, drops blanks and non-strings, dedupes case-insensitively keeping the first spelling', () => {
    expect(normalizeGuestNames(['  Maria ', '', 'maria', 42, null, 'João'])).toEqual(['Maria', 'João'])
  })

  it('caps a name at 60 characters', () => {
    expect(normalizeGuestNames(['x'.repeat(80)])[0]).toHaveLength(60)
  })

  it('returns [] for a non-array', () => {
    expect(normalizeGuestNames(undefined)).toEqual([])
    expect(normalizeGuestNames('Maria')).toEqual([])
  })
})

describe('mergeGuests', () => {
  it('keeps the id of a guest whose name is still on the list and mints ids for new names', () => {
    const existing = [{ id: 'g-old', name: 'Maria' }]
    expect(mergeGuests(existing, ['maria', 'Pedro'], mint())).toEqual([
      { id: 'g-old', name: 'Maria' },
      { id: 'guest-1', name: 'Pedro' },
    ])
  })

  it('drops a guest that is no longer on the list', () => {
    expect(mergeGuests([{ id: 'g-old', name: 'Maria' }], [], mint())).toEqual([])
  })

  it('ignores malformed existing entries', () => {
    expect(mergeGuests([{ id: 1, name: 'Bad' } as any, null as any], ['Ana'], mint())).toEqual([
      { id: 'guest-1', name: 'Ana' },
    ])
  })
})

describe('mergeRoster', () => {
  it('replaces staff, resolves guests against the existing ones, unions samples', () => {
    const existing = {
      id: 's1',
      cupper_ids: ['a', 'b'],
      guest_cuppers: [{ id: 'g1', name: 'Maria' }],
      sample_ids: ['x'],
    }
    const merged = mergeRoster(
      existing,
      { cupper_ids: ['b', 'c', 'b'], guest_names: ['Maria', 'Pedro'], sample_ids: ['y', 'x'] },
      mint(),
    )
    expect(merged.cupper_ids).toEqual(['b', 'c'])
    expect(merged.guest_cuppers).toEqual([
      { id: 'g1', name: 'Maria' },
      { id: 'guest-1', name: 'Pedro' },
    ])
    expect(merged.sample_ids).toEqual(['x', 'y'])
  })

  it('builds a fresh roster when there is no session', () => {
    const merged = mergeRoster(null, { cupper_ids: ['a'], guest_names: ['Ana'], sample_ids: ['x'] }, mint())
    expect(merged).toEqual({
      cupper_ids: ['a'],
      guest_cuppers: [{ id: 'guest-1', name: 'Ana' }],
      sample_ids: ['x'],
    })
  })
})

describe('pickRosterSession', () => {
  const journey = { id: 'j', session_type: 'cva', status: 'active', sample_ids: ['x'] }
  const roster = { id: 'r', session_type: 'cva', status: 'setup', sample_ids: ['x', 'y'] }
  const commodity = { id: 'c', session_type: 'regular', status: 'active', sample_ids: ['z'] }

  it('prefers a roster over a newer journey session holding the same sample', () => {
    expect(pickRosterSession([journey, roster], ['x'])?.id).toBe('r')
  })

  it('falls back to the first (newest) session holding any of the samples', () => {
    expect(pickRosterSession([journey, commodity], ['z'])?.id).toBe('c')
    expect(pickRosterSession([journey, commodity], ['x', 'z'])?.id).toBe('j')
  })

  it('returns null when nothing holds the samples', () => {
    expect(pickRosterSession([journey], ['q'])).toBeNull()
    expect(pickRosterSession([], ['q'])).toBeNull()
  })

  it('isRosterSession is cva + setup only', () => {
    expect(isRosterSession(roster)).toBe(true)
    expect(isRosterSession(journey)).toBe(false)
    expect(isRosterSession({ session_type: 'regular', status: 'setup' })).toBe(false)
  })
})
