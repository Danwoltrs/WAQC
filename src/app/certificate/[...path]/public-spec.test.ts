import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The public QR page reads the lot's spec version and its checklist through
 * the resolver, which throws on a read error (where the old live join just
 * came back empty and the gate approved). A buyer scanning a tin must still
 * get the certificate: on a failure the page renders without the checklist,
 * as it did before, and the error goes to the logs.
 */

const spec = vi.hoisted(() => ({ resolveSampleSpec: vi.fn(), resolveSampleSpecs: vi.fn(), specVersionStatus: vi.fn() }))
vi.mock('@/lib/quality-spec/resolve', () => spec)
const compliance = vi.hoisted(() => ({ evaluateSampleCompliance: vi.fn() }))
vi.mock('@/lib/compliance', () => compliance)

import { loadPublicSpec } from './public-spec'

const db = {} as any
const sibling = { id: 'sib-1', quality_spec_id: 'cq-2' }
const resolved = { id: 'cq-2', custom_name: 'Fine Cup', template: { parameters: {} } }
const criterion = { key: 'moisture_max', label: 'Moisture', passed: true }

describe('loadPublicSpec', () => {
  beforeEach(() => {
    spec.resolveSampleSpec.mockReset().mockResolvedValue(resolved)
    compliance.evaluateSampleCompliance.mockReset().mockResolvedValue([criterion])
  })

  it('reads the row\'s own version and judges the lab unit by the row\'s quality on issued values', async () => {
    const out = await loadPublicSpec(db, sibling, 'lab-1')
    expect(out).toEqual({ spec: resolved, criteria: [criterion] })
    expect(spec.resolveSampleSpec).toHaveBeenCalledWith('sib-1')
    expect(compliance.evaluateSampleCompliance).toHaveBeenCalledWith(db, 'lab-1', 'cq-2', undefined, { values: 'issued' })
  })

  it('reads nothing for a sample without a quality', async () => {
    const out = await loadPublicSpec(db, { id: 'sib-1', quality_spec_id: null }, 'lab-1')
    expect(out).toEqual({ spec: null, criteria: [] })
    expect(spec.resolveSampleSpec).not.toHaveBeenCalled()
    expect(compliance.evaluateSampleCompliance).not.toHaveBeenCalled()
  })

  it.each([
    ['the resolver', () => spec.resolveSampleSpec.mockRejectedValue(new Error('read failed'))],
    ['the compliance gate', () => compliance.evaluateSampleCompliance.mockRejectedValue(new Error('read failed'))],
  ])('a failure in %s renders without the checklist and logs it', async (_label, arrange) => {
    arrange()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const out = await loadPublicSpec(db, sibling, 'lab-1')
    expect(out).toEqual({ spec: null, criteria: [] })
    expect(log).toHaveBeenCalled()
    expect(String(log.mock.calls[0][0])).toContain('sib-1')
    log.mockRestore()
  })
})
