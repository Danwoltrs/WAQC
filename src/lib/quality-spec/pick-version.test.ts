import { describe, it, expect } from 'vitest'
import { specToday, versionInForce, pickVersion, pendingVersion } from './pick-version'
import type { VersionRow } from './types'

const snap = { template: { parameters: {} }, custom_parameters: {}, cups_per_sample: null, discrepancy_threshold: null }
function v(n: number, effective_from: string, extra: Partial<VersionRow> = {}): VersionRow {
  return {
    id: `v${n}`, client_quality_id: 'q1', version_no: n, effective_from, spec: snap,
    source: 'client', note: null, created_by: null, created_at: '2026-01-01T00:00:00Z',
    applied_at: '2026-01-01T00:00:00Z', notified_at: null, cancelled_at: null, cancelled_by: null, cancel_note: null,
    ...extra,
  }
}
const v1 = v(1, '2000-01-01')
const v2 = v(2, '2026-09-01')
const v3 = v(3, '2027-09-01', { applied_at: null })
const v4 = v(4, '2026-10-01', { cancelled_at: '2026-09-15T00:00:00Z' })
const all = [v3, v1, v4, v2]

describe('versionInForce', () => {
  it('picks by date', () => {
    expect(versionInForce(all, '2026-08-31')?.id).toBe('v1')
    expect(versionInForce(all, '2026-09-01')?.id).toBe('v2')
  })
  it('never returns a cancelled version', () => {
    expect(versionInForce(all, '2026-10-05')?.id).toBe('v2')
  })
  it('higher version_no wins a tie', () => {
    const a = v(5, '2026-09-01')
    expect(versionInForce([v1, v2, a], '2026-09-02')?.id).toBe('v5')
  })
  it('depends on date only, not applied_at', () => {
    const due = v(6, '2026-11-11', { applied_at: null })
    expect(versionInForce([v1, v2, due], '2026-11-11')?.id).toBe('v6')
  })
  it('returns null when nothing is in force', () => {
    expect(versionInForce([v3], '2026-11-11')).toBeNull()
  })
})

describe('pickVersion', () => {
  it('pin wins', () => {
    expect(pickVersion(all, { pinnedId: 'v1', contractDate: '2026-10-01', today: '2026-11-11' })?.id).toBe('v1')
  })
  it('uses contract date', () => {
    expect(pickVersion(all, { pinnedId: null, contractDate: '2026-08-15', today: '2026-11-11' })?.id).toBe('v1')
  })
  it('uses today without contract date; pending never picked', () => {
    expect(pickVersion(all, { pinnedId: null, contractDate: null, today: '2026-11-11' })?.id).toBe('v2')
  })
})

describe('pendingVersion', () => {
  it('returns the unapplied, uncancelled version', () => {
    expect(pendingVersion(all, '2026-11-11')?.id).toBe('v3')
  })
  it('counts a due-but-unapplied version as pending', () => {
    const due = v(6, '2026-11-11', { applied_at: null })
    expect(pendingVersion([v1, v2, due], '2026-11-11')?.id).toBe('v6')
  })
  it('returns null when none; highest version_no on several', () => {
    expect(pendingVersion([v1, v2, v4], '2026-11-11')).toBeNull()
    const x = v(7, '2027-01-01', { applied_at: null })
    expect(pendingVersion([v3, x], '2026-11-11')?.id).toBe('v7')
  })
})

describe('specToday', () => {
  it('uses Sao Paulo', () => {
    expect(specToday(new Date('2026-11-11T02:00:00Z'))).toBe('2026-11-10')
  })
})
