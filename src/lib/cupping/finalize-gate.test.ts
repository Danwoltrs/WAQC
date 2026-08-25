import { describe, it, expect } from 'vitest'
import { assertCanFinalize } from './finalize-gate'

const session = {
  id: 'sess-1',
  sample_ids: ['s1', 's2'],
  cupper_ids: ['c1', 'c2'],
  master_cupper_id: null,
  min_cuppers_required: 2,
  allow_single_cupper: false,
}
const cupper = { id: 'c1' }
const admin = { id: 'x', is_global_admin: true }

describe('assertCanFinalize', () => {
  it('lets a cupper assigned to the session finalize', () => {
    const out = assertCanFinalize({ session, sampleId: 's1', actor: cupper, completedCupperIds: ['c1', 'c2'] })
    expect(out).toEqual({ ok: true, assignedCupperIds: ['c1', 'c2'], isSingleCupperSession: false })
  })

  it('refuses a sample that is not in the session', () => {
    const out = assertCanFinalize({ session, sampleId: 'other', actor: cupper, completedCupperIds: ['c1', 'c2'] })
    expect(out).toEqual({ ok: false, status: 400, error: 'Sample is not part of this session' })
  })

  it('refuses someone with no standing in the session', () => {
    const out = assertCanFinalize({
      session, sampleId: 's1', actor: { id: 'nobody' }, completedCupperIds: ['c1', 'c2'],
    })
    expect(out).toEqual({
      ok: false, status: 403, error: 'You do not have permission to finalize this session',
    })
  })

  it('lets a global admin finalize a session they are not assigned to', () => {
    const out = assertCanFinalize({ session, sampleId: 's1', actor: admin, completedCupperIds: ['c1', 'c2'] })
    expect(out.ok).toBe(true)
  })

  it('refuses when too few assigned cuppers have scored', () => {
    const out = assertCanFinalize({ session, sampleId: 's1', actor: cupper, completedCupperIds: ['c1'] })
    expect(out).toEqual({
      ok: false,
      status: 400,
      error: 'Cannot finalize: only 1 of 2 required cuppers have completed their scores',
    })
  })

  it('relaxes the minimum to one for a single-cupper session', () => {
    const solo = { ...session, cupper_ids: ['c1'] }
    const out = assertCanFinalize({ session: solo, sampleId: 's1', actor: cupper, completedCupperIds: ['c1'] })
    expect(out).toEqual({ ok: true, assignedCupperIds: ['c1'], isSingleCupperSession: true })
  })

  it('relaxes the minimum when the session opts in explicitly', () => {
    const opted = { ...session, allow_single_cupper: true }
    const out = assertCanFinalize({ session: opted, sampleId: 's1', actor: cupper, completedCupperIds: ['c1'] })
    expect(out.ok).toBe(true)
  })

  it('counts each cupper once even when duplicate rows exist', () => {
    const out = assertCanFinalize({
      session, sampleId: 's1', actor: cupper, completedCupperIds: ['c1', 'c1', 'c2'],
    })
    expect(out.ok).toBe(true)
  })

  it('deduplicates the assigned roster before counting', () => {
    const dup = { ...session, cupper_ids: ['c1', 'c1'] }
    const out = assertCanFinalize({ session: dup, sampleId: 's1', actor: cupper, completedCupperIds: ['c1'] })
    expect(out).toEqual({ ok: true, assignedCupperIds: ['c1'], isSingleCupperSession: true })
  })
})
