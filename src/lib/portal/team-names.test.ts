// src/lib/portal/team-names.test.ts
import { describe, expect, it } from 'vitest'
import { selfName, targetEmail } from './team-names'

const fake = (row: any) => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }),
}) as any

describe('team names', () => {
  it('names a person by full name, else email', async () => {
    expect(await selfName(fake({ full_name: 'Bea Costa', email: 'bea@c.com' }), 'u1')).toBe('Bea Costa')
    expect(await selfName(fake({ full_name: null, email: 'bea@c.com' }), 'u1')).toBe('bea@c.com')
    expect(await targetEmail(fake({ email: 'bea@c.com' }), 'u1')).toBe('bea@c.com')
  })
  it('falls back without a row', async () => {
    expect(await selfName(fake(null), 'u1')).toBe('Your colleague')
    expect(await targetEmail(fake(null), 'u1')).toBe('u1')
  })
})
