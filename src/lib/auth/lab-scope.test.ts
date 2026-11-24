import { describe, it, expect } from 'vitest'
import { buildLabScope, canReadLab, canWriteLab, ownerLabFor, ownsRow, readsAllLabs, resolveLabView } from './lab-scope'

const SANTOS = 'lab-santos'
const BUENAVENTURA = 'lab-buenaventura'
const GUATEMALA = 'lab-guatemala'

const hqStaff = buildLabScope({ laboratory_id: SANTOS, qc_role: 'lab_personnel' }, 'hq')
const labStaff = buildLabScope({ laboratory_id: BUENAVENTURA, qc_role: 'lab_quality_manager' }, 'lab')
const admin = buildLabScope({ laboratory_id: SANTOS, qc_role: 'global_admin', is_global_admin: true }, 'hq')
const adminElsewhere = buildLabScope({ laboratory_id: BUENAVENTURA, qc_role: 'global_quality_admin' }, 'lab')
const noLab = buildLabScope({ laboratory_id: null, qc_role: 'lab_personnel' }, null)

describe('who reads which laboratory', () => {
  it('HQ staff read every laboratory, whatever it is called', () => {
    expect(readsAllLabs(hqStaff)).toBe(true)
    expect(canReadLab(hqStaff, BUENAVENTURA)).toBe(true)
    expect(canReadLab(hqStaff, GUATEMALA)).toBe(true)
  })

  it('a lab user reads their own laboratory only', () => {
    expect(canReadLab(labStaff, BUENAVENTURA)).toBe(true)
    expect(canReadLab(labStaff, SANTOS)).toBe(false)
    expect(canReadLab(labStaff, GUATEMALA)).toBe(false)
    expect(canReadLab(labStaff, null)).toBe(false)
  })

  it('a global admin reads everything from any laboratory', () => {
    expect(canReadLab(adminElsewhere, SANTOS)).toBe(true)
  })

  it('HQ is the lab typed hq, not a name: a lab typed anything else is not HQ', () => {
    expect(buildLabScope({ laboratory_id: SANTOS, qc_role: 'lab_personnel' }, 'standard').isHq).toBe(false)
    expect(buildLabScope({ laboratory_id: GUATEMALA, qc_role: 'lab_personnel' }, 'HQ').isHq).toBe(true)
  })

  it('a user bound to no laboratory is not confined', () => {
    expect(canReadLab(noLab, SANTOS)).toBe(true)
    expect(canWriteLab(noLab, SANTOS)).toBe(true)
  })
})

describe('who writes in which laboratory', () => {
  it('HQ staff write in their own laboratory only', () => {
    expect(canWriteLab(hqStaff, SANTOS)).toBe(true)
    expect(canWriteLab(hqStaff, BUENAVENTURA)).toBe(false)
  })
  it('a lab user writes in their own laboratory only', () => {
    expect(canWriteLab(labStaff, BUENAVENTURA)).toBe(true)
    expect(canWriteLab(labStaff, SANTOS)).toBe(false)
  })
  it('a global admin writes anywhere', () => {
    expect(canWriteLab(admin, BUENAVENTURA)).toBe(true)
  })
})

describe('the laboratory a list shows', () => {
  it('is the user\'s own unless they ask for another', () => {
    expect(resolveLabView(hqStaff, null)).toEqual({ labId: SANTOS, readOnly: false })
    expect(resolveLabView(hqStaff, SANTOS)).toEqual({ labId: SANTOS, readOnly: false })
  })
  it('HQ looking at another laboratory is read-only, a global admin included', () => {
    expect(resolveLabView(hqStaff, BUENAVENTURA)).toEqual({ labId: BUENAVENTURA, readOnly: true })
    expect(resolveLabView(admin, BUENAVENTURA)).toEqual({ labId: BUENAVENTURA, readOnly: true })
  })
  it('a lab user asking for another laboratory gets their own, never the other and never all', () => {
    expect(resolveLabView(labStaff, SANTOS)).toEqual({ labId: BUENAVENTURA, readOnly: false })
  })
  it('a user with no laboratory has no filter', () => {
    expect(resolveLabView(noLab, null)).toEqual({ labId: null, readOnly: false })
  })
})

describe('labWriteBlock (routes that write with the service role)', () => {
  const db = (profile: Record<string, unknown> | null, labType: string | null, sampleLab: string | null) => ({
    from(table: string) {
      const row = table === 'profiles' ? profile : table === 'laboratories' ? { type: labType } : sampleLab === null ? null : { laboratory_id: sampleLab }
      const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: row, error: null }) }
      return chain
    },
  }) as never

  it('HQ staff may not change a sample of another laboratory', async () => {
    const { labWriteBlock, OTHER_LAB_WRITE_ERROR } = await import('./lab-scope')
    expect(await labWriteBlock(db({ laboratory_id: SANTOS, qc_role: 'lab_personnel' }, 'hq', BUENAVENTURA), 'u', 's')).toBe(OTHER_LAB_WRITE_ERROR)
    expect(await labWriteBlock(db({ laboratory_id: SANTOS, qc_role: 'lab_personnel' }, 'hq', SANTOS), 'u', 's')).toBeNull()
  })

  it('a sample the caller cannot read is refused too', async () => {
    const { labWriteBlock, OTHER_LAB_WRITE_ERROR } = await import('./lab-scope')
    expect(await labWriteBlock(db({ laboratory_id: BUENAVENTURA, qc_role: 'lab_personnel' }, 'lab', null), 'u', 's')).toBe(OTHER_LAB_WRITE_ERROR)
  })

  it('a global admin, and a user with no laboratory, are not held back', async () => {
    const { labWriteBlock } = await import('./lab-scope')
    expect(await labWriteBlock(db({ laboratory_id: SANTOS, qc_role: 'global_admin' }, 'hq', BUENAVENTURA), 'u', 's')).toBeNull()
    expect(await labWriteBlock(db({ laboratory_id: null, qc_role: 'lab_personnel' }, null, BUENAVENTURA), 'u', 's')).toBeNull()
  })
})

describe('who owns a register row', () => {
  const co = buildLabScope({ laboratory_id: BUENAVENTURA, qc_role: 'lab_personnel' }, 'lab')
  const confined = { ownLabId: 'lab-co', isGlobal: false, isHq: false }
  const globalAtLab = buildLabScope({ laboratory_id: BUENAVENTURA, qc_role: 'global_admin', is_global_admin: true }, 'lab')

  it('HQ writes with no owner lab and sees every owner', () => {
    expect(ownerLabFor(hqStaff)).toBeNull()
    expect(ownsRow(hqStaff, null)).toBe(true)
    expect(ownsRow(hqStaff, 'lab-co')).toBe(true)
  })

  it('a confined lab writes with its own lab as owner and sees only its own rows', () => {
    expect(ownerLabFor(confined)).toBe('lab-co')
    expect(ownsRow(confined, null)).toBe(false)
    expect(ownsRow(confined, 'lab-co')).toBe(true)
    expect(ownsRow(confined, 'lab-gt')).toBe(false)
  })

  it('a global admin at a non-HQ lab still writes with no owner lab', () => {
    expect(ownerLabFor(globalAtLab)).toBeNull()
    expect(ownsRow(globalAtLab, 'lab-gt')).toBe(true)
  })

  it('a user with no laboratory is not confined: no owner, sees every owner', () => {
    expect(ownerLabFor(buildLabScope({ laboratory_id: null, qc_role: 'lab_personnel' }, null))).toBeNull()
  })

  it('a non-HQ lab user is confined to their own lab', () => {
    expect(ownerLabFor(co)).toBe(BUENAVENTURA)
  })
})
