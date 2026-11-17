import { describe, it, expect } from 'vitest'
import { isMissingColumnError } from './db-errors'

describe('isMissingColumnError', () => {
  it('recognises a select error (42703) and a payload error (PGRST204)', () => {
    expect(isMissingColumnError({ code: '42703', message: 'column "sensory" does not exist' })).toBe(true)
    expect(isMissingColumnError({ code: 'PGRST204', message: "Could not find the 'sensory' column of 'cupping_scores' in the schema cache" })).toBe(true)
  })
  it('narrows by column name when given', () => {
    expect(isMissingColumnError({ code: 'PGRST204', message: "Could not find the 'other' column" }, 'sensory')).toBe(false)
    expect(isMissingColumnError({ code: 'PGRST204', message: "Could not find the 'sensory' column" }, 'sensory')).toBe(true)
  })
  it('rejects other errors and non-errors', () => {
    expect(isMissingColumnError({ code: '23505' })).toBe(false)
    expect(isMissingColumnError(null)).toBe(false)
    expect(isMissingColumnError('42703')).toBe(false)
  })
})
