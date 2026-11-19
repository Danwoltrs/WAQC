import { describe, it, expect } from 'vitest'
import { carriesVerdict, outcomeLabel, outcomeOf } from './sample-verdict'

describe('sample verdict', () => {
  it('a type sample carries no verdict, every other sample does', () => {
    expect(carriesVerdict('type')).toBe(false)
    expect(carriesVerdict('TYPE')).toBe(false)
    for (const t of ['pss', 'ss', 'stocklot', 'specialty', null, undefined, '']) expect(carriesVerdict(t)).toBe(true)
  })

  it('names a type sample by its range, any other sample by its verdict', () => {
    expect(outcomeOf('type', false)).toBe('in_range')
    expect(outcomeOf('type', true)).toBe('out_of_range')
    expect(outcomeLabel('type', true)).toBe('Out of range')
    expect(outcomeLabel('type', false)).toBe('In range')
    expect(outcomeLabel('pss', true)).toBe('Rejected')
    expect(outcomeLabel(null, false)).toBe('Approved')
  })
})
