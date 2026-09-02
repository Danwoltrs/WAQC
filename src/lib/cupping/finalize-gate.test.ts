import { describe, it, expect } from 'vitest'
import { assertCanFinalize, canActorFinalize } from './finalize-gate'

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

  it('refuses an uncupped roster on the count, not on its type', () => {
    // A roster is written at assignment ('cva' + 'setup') to say who is cupping
    // the lot. It used to be refused for BEING a roster; since the journey now
    // binds it, that refusal is gone and the danger it guarded — an assigner on
    // the roster certifying a lot nobody cupped — is caught where it belongs:
    // no score rows means no completed cuppers, and the count gate says so.
    const roster = {
      ...session,
      session_type: 'cva',
      status: 'setup',
      cupper_ids: ['c1'],
      min_cuppers_required: 1,
      allow_single_cupper: true,
    }
    const out = assertCanFinalize({
      session: roster, sampleId: 's1', actor: admin, completedCupperIds: [],
    })
    expect(out).toEqual({
      ok: false,
      status: 400,
      error: 'Cannot finalize: only 0 of 1 required cuppers have completed their scores',
    })
  })

  it('still finalizes a real journey session, which is born active', () => {
    const journey = { ...session, session_type: 'cva', status: 'active' }
    expect(assertCanFinalize({
      session: journey, sampleId: 's1', actor: cupper, completedCupperIds: ['c1', 'c2'],
    }).ok).toBe(true)
  })

  it('leaves a commodity session in setup alone — only a cva one is a roster', () => {
    const draft = { ...session, session_type: 'regular', status: 'setup' }
    expect(assertCanFinalize({
      session: draft, sampleId: 's1', actor: cupper, completedCupperIds: ['c1', 'c2'],
    }).ok).toBe(true)
  })
})

describe('canActorFinalize', () => {
  it('lets a cupper assigned to the session finalize', () => {
    expect(canActorFinalize(session, cupper)).toBe(true)
  })

  it('refuses someone with no standing in the session', () => {
    expect(canActorFinalize(session, { id: 'nobody' })).toBe(false)
  })

  it('lets a global admin finalize a session they are not assigned to', () => {
    expect(canActorFinalize(session, admin)).toBe(true)
  })

  it('lets a master cupper finalize a session they are not assigned to', () => {
    expect(canActorFinalize(session, { id: 'x', is_master_cupper: true })).toBe(true)
  })

  it('lets a Q-grader finalize a session they are not assigned to', () => {
    expect(canActorFinalize(session, { id: 'x', is_q_grader: true })).toBe(true)
  })

  it('treats a null cupper roster as nobody assigned', () => {
    const noRoster = { ...session, cupper_ids: null }
    expect(canActorFinalize(noRoster, cupper)).toBe(false)
    expect(canActorFinalize(noRoster, admin)).toBe(true)
  })

  it('agrees with assertCanFinalize on the permission outcome for every actor kind', () => {
    const actors = [cupper, admin, { id: 'nobody' }, { id: 'x', is_master_cupper: true }, { id: 'x', is_q_grader: true }]
    for (const actor of actors) {
      const gate = assertCanFinalize({ session, sampleId: 's1', actor, completedCupperIds: ['c1', 'c2'] })
      const permitted = canActorFinalize(session, actor)
      // The gate can still fail later on the cupper-count check, but it can
      // never succeed for someone canActorFinalize refuses, nor fail on the
      // permission error for someone it allows.
      if (!permitted) {
        expect(gate).toEqual({ ok: false, status: 403, error: 'You do not have permission to finalize this session' })
      } else {
        expect(gate.ok === true || (gate as any).status !== 403).toBe(true)
      }
    }
  })
})

describe('a session nobody has cupped', () => {
  // This is the safety net that lets the roster guard go: a roster holds no
  // score rows, so the count gate refuses it on its own merits and says
  // something more useful than "not a journey session".
  const roster = {
    id: 'roster-1',
    sample_ids: ['s1'],
    cupper_ids: ['c1', 'c2'],
    master_cupper_id: null,
    min_cuppers_required: 2,
    allow_single_cupper: false,
    session_type: 'cva',
    status: 'setup',
  }

  it('cannot be finalized, however it is typed', () => {
    const out = assertCanFinalize({
      session: roster, sampleId: 's1', actor: { id: 'c1' }, completedCupperIds: [],
    })
    expect(out).toEqual({
      ok: false, status: 400,
      error: 'Cannot finalize: only 0 of 2 required cuppers have completed their scores',
    })
  })

  it('cannot be finalized by an admin either', () => {
    const out = assertCanFinalize({
      session: roster, sampleId: 's1', actor: { id: 'x', is_global_admin: true }, completedCupperIds: [],
    })
    expect(out.ok).toBe(false)
  })

  it('finalizes normally once its cuppers have scored', () => {
    const out = assertCanFinalize({
      session: roster, sampleId: 's1', actor: { id: 'c1' }, completedCupperIds: ['c1', 'c2'],
    })
    expect(out.ok).toBe(true)
  })
})
