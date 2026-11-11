import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ResolvedSpec } from './types'

const r = vi.hoisted(() => ({ resolveSampleSpec: vi.fn(), resolveSampleSpecs: vi.fn() }))
vi.mock('./resolve', () => r)
const g = vi.hoisted(() => ({ groupSampleIds: vi.fn() }))
vi.mock('@/lib/sample-group', () => g)
vi.mock('@/lib/supabase-service', () => ({ serviceRoleClient: () => ({}) }))

import { resolveSpecForQuality, pinLotSpec, pinGroupSpec } from './lot-spec'

const spec = (id: string, versionNo = 1): ResolvedSpec => ({
  id,
  custom_name: id,
  quality_code: null,
  template_id: null,
  cups_per_sample: null,
  discrepancy_threshold: null,
  custom_parameters: {},
  template: null,
  version: { id: `${id}-v${versionNo}`, versionNo, effectiveFrom: '2026-01-01', pinned: false },
})

const admin = {} as any

beforeEach(() => {
  r.resolveSampleSpec.mockReset()
  r.resolveSampleSpecs.mockReset()
  g.groupSampleIds.mockReset()
})

describe('resolveSpecForQuality', () => {
  it('returns the row own spec when it carries the asked quality', async () => {
    r.resolveSampleSpec.mockResolvedValue(spec('q-lab'))
    expect((await resolveSpecForQuality('lab-1', 'q-lab', { admin }))?.id).toBe('q-lab')
    expect(g.groupSampleIds).not.toHaveBeenCalled()
  })

  it("a lab unit asked about a sibling's quality resolves the sibling that carries it", async () => {
    // Siblings are different contracts and may carry different client qualities.
    r.resolveSampleSpec.mockResolvedValue(spec('q-lab'))
    g.groupSampleIds.mockResolvedValue(['lab-1', 'sib-1', 'sib-2'])
    r.resolveSampleSpecs.mockResolvedValue(
      new Map([['lab-1', spec('q-lab')], ['sib-1', spec('q-other')], ['sib-2', spec('q-sib', 3)]]),
    )
    const out = await resolveSpecForQuality('lab-1', 'q-sib', { admin })
    expect(out?.id).toBe('q-sib')
    expect(out?.version?.versionNo).toBe(3)
    expect(g.groupSampleIds).toHaveBeenCalledWith(admin, 'lab-1', { includeDeleted: true })
  })

  it('throws when no row of the group carries the quality, rather than judge by another', async () => {
    r.resolveSampleSpec.mockResolvedValue(spec('q-lab'))
    g.groupSampleIds.mockResolvedValue(['lab-1'])
    r.resolveSampleSpecs.mockResolvedValue(new Map([['lab-1', spec('q-lab')]]))
    await expect(resolveSpecForQuality('lab-1', 'q-gone', { admin })).rejects.toThrow('q-gone')
  })

  it('is null without a quality, without reading anything', async () => {
    expect(await resolveSpecForQuality('lab-1', null)).toBeNull()
    expect(r.resolveSampleSpec).not.toHaveBeenCalled()
  })
})

describe('pinGroupSpec', () => {
  it("resolves the lot's whole group with pin, so a sibling on another quality is pinned too", async () => {
    g.groupSampleIds.mockResolvedValue(['lab-1', 'sib-1'])
    r.resolveSampleSpecs.mockResolvedValue(new Map([['lab-1', spec('q-lab')], ['sib-1', spec('q-other')]]))
    expect((await pinGroupSpec('lab-1', { admin }))?.id).toBe('q-lab')
    expect(g.groupSampleIds).toHaveBeenCalledWith(admin, 'lab-1')
    expect(r.resolveSampleSpecs).toHaveBeenCalledWith(['lab-1', 'sib-1'], { pin: true, admin })
    expect(r.resolveSampleSpec).not.toHaveBeenCalled()
  })

  it('answers for the asked row, a sibling included', async () => {
    g.groupSampleIds.mockResolvedValue(['lab-1', 'sib-1'])
    r.resolveSampleSpecs.mockResolvedValue(new Map([['lab-1', spec('q-lab')], ['sib-1', spec('q-other')]]))
    expect((await pinGroupSpec('sib-1', { admin }))?.id).toBe('q-other')
  })

  it('still resolves the asked row when the group read leaves it out (a deleted row)', async () => {
    g.groupSampleIds.mockResolvedValue(['lab-1'])
    r.resolveSampleSpecs.mockResolvedValue(new Map([['gone-1', spec('q-lab')]]))
    await pinGroupSpec('gone-1', { admin })
    expect(r.resolveSampleSpecs).toHaveBeenCalledWith(['gone-1', 'lab-1'], { pin: true, admin })
  })

  it('throws on a read error: a finalize must not judge blind', async () => {
    g.groupSampleIds.mockRejectedValue(new Error('boom'))
    await expect(pinGroupSpec('lab-1', { admin })).rejects.toThrow('boom')
  })
})

describe('pinLotSpec', () => {
  it('pins the whole group through the resolver and returns what it resolved for the lot', async () => {
    g.groupSampleIds.mockResolvedValue(['lab-1', 'sib-1'])
    r.resolveSampleSpecs.mockResolvedValue(new Map([['lab-1', spec('q-lab')], ['sib-1', spec('q-other')]]))
    expect((await pinLotSpec('lab-1'))?.id).toBe('q-lab')
    expect(r.resolveSampleSpecs).toHaveBeenCalledWith(['lab-1', 'sib-1'], expect.objectContaining({ pin: true }))
  })

  it('logs and answers null when the read fails: a save never fails over its pin', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    g.groupSampleIds.mockResolvedValue(['lab-1'])
    r.resolveSampleSpecs.mockRejectedValue(new Error('boom'))
    expect(await pinLotSpec('lab-1')).toBeNull()
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})
