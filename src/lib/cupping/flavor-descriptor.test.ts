import { describe, it, expect } from 'vitest'
import { cleanDescriptor, descriptorMismatch, descriptorOf, withoutNumericDescriptor } from './flavor-descriptor'

/**
 * The cup profile word ("Soft", "Softish", "Rio") rides inside the same
 * cupping_scores.scores map as the numbers, under a Flavor_descriptor key. Two
 * writers put two different things there: the scoring page writes the word,
 * the handwritten-card path writes the number 0 (463 rows in prod on
 * 2026-09-16). Everything that reads it has to tell the two apart.
 */
describe('descriptorOf', () => {
  it('reads the cupper\'s word, trimmed', () => {
    expect(descriptorOf({ Flavor: 3.5, Flavor_descriptor: ' Softish ' })).toBe('Softish')
  })
  it('accepts the spellings around the key', () => {
    expect(descriptorOf({ 'flavor descriptor': 'Hard' })).toBe('Hard')
    expect(descriptorOf({ 'Flavour-Descriptor': 'Rio' })).toBe('Rio')
  })
  it('is null for the card path\'s numeric zero, and for anything that is not a word', () => {
    expect(descriptorOf({ Flavor: 3, Flavor_descriptor: 0 })).toBeNull()
    expect(descriptorOf({ Flavor_descriptor: '' })).toBeNull()
    expect(descriptorOf({ Flavor: 3 })).toBeNull()
    expect(descriptorOf(null)).toBeNull()
    expect(descriptorOf('Soft')).toBeNull()
  })
})

describe('cleanDescriptor', () => {
  it('keeps a short word, trimmed, and refuses everything else', () => {
    expect(cleanDescriptor(' S. Soft ')).toBe('S. Soft')
    expect(cleanDescriptor(0)).toBeNull()
    expect(cleanDescriptor('   ')).toBeNull()
    expect(cleanDescriptor('x'.repeat(41))).toBeNull()
    expect(cleanDescriptor(undefined)).toBeNull()
  })
})

describe('descriptorMismatch', () => {
  it('two cuppers who disagree are a mismatch, to be shown like a score discrepancy', () => {
    expect(descriptorMismatch(['Soft', 'Softish'])).toBe(true)
  })
  it('agreement, a single word, or nothing at all is not', () => {
    expect(descriptorMismatch(['Soft', 'Soft'])).toBe(false)
    expect(descriptorMismatch(['Soft'])).toBe(false)
    expect(descriptorMismatch([])).toBe(false)
  })
  it('a cupper who chose nothing does not count as disagreeing', () => {
    expect(descriptorMismatch(['Soft', null, 'Soft'])).toBe(false)
  })
})

describe('withoutNumericDescriptor', () => {
  it('drops a numeric zero under the descriptor key before it is stored', () => {
    expect(withoutNumericDescriptor({ Body: 7, Flavor_descriptor: 0 })).toEqual({ Body: 7 })
  })
  it('keeps a real word and leaves every other key alone', () => {
    expect(withoutNumericDescriptor({ Body: 7, Flavor_descriptor: 'Soft' })).toEqual({ Body: 7, Flavor_descriptor: 'Soft' })
  })
})
