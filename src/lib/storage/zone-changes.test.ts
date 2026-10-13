import { describe, it, expect } from 'vitest'
import { MAX_ZONE_CHANGES, parseZoneChanges } from './zone-changes'

const CO = '11111111-1111-4111-8111-111111111111'

describe('parseZoneChanges', () => {
  it('keeps one change per cubby, the last one winning, and accepts general space', () => {
    expect(parseZoneChanges([
      { code: 'b-a1', company_id: CO }, { code: 'B-A2', company_id: null }, { code: 'B-A1', company_id: null },
    ])).toEqual({ ok: true, value: [{ code: 'B-A1', company_id: null }, { code: 'B-A2', company_id: null }] })
  })

  it('refuses a body that is not a list, a missing code, a bad or missing client id and too many cubbies', () => {
    expect(parseZoneChanges({ code: 'B-A1' }).ok).toBe(false)
    expect(parseZoneChanges([{ company_id: null }]).ok).toBe(false)
    expect(parseZoneChanges([{ code: 'B-A1', company_id: 'ahold' }]).ok).toBe(false)
    expect(parseZoneChanges([{ code: 'B-A1' }]).ok).toBe(false)
    expect(parseZoneChanges(Array.from({ length: MAX_ZONE_CHANGES + 1 }, () => ({ code: 'B-A1', company_id: null }))).ok).toBe(false)
  })
})
