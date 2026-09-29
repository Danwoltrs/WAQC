import { describe, it, expect } from 'vitest'
import { nyGradeOf, planCopyEdits } from './quality-copy-edits'
import { screenRangeOf } from './quality-matching'

// 14/16 FINE CUP as Cape Horn has it (2026-09-29): the requirement sits on 16.
const FINE_CUP = {
  origin: 'Brazil',
  screen_size_requirements: {
    constraints: [
      { screen_size: 'Screen 16', constraint_type: 'minimum', min_value: 45, display_order: 0 },
      { screen_size: 'Screen 15', constraint_type: 'any', display_order: 1 },
      { screen_size: 'Screen 14', constraint_type: 'any', display_order: 2 },
      { screen_size: 'Pan', constraint_type: 'maximum', max_value: 10, display_order: 3 },
    ],
  },
  defect_configuration: { defects: [], thresholds: { max_total: 21 } },
}

const plan = (contractText: string, sourceText = '14/16 FINE CUP', parameters: any = FINE_CUP, sourceDescription: string | null = null) =>
  planCopyEdits({ contractText, sourceText, sourceDescription, parameters })

describe('nyGradeOf', () => {
  it('reads whole and split grades as numbers', () => {
    expect(nyGradeOf('NY 2/3 17/18 FC')).toBe(2.5)
    expect(nyGradeOf('ny3/4 scr 16 up')).toBe(3.5)
    expect(nyGradeOf('Brazil NY 2, Screen 17/18')).toBe(2)
    expect(nyGradeOf('15/16 FC')).toBeNull()
  })
})

describe('screenRangeOf', () => {
  it('reads slash ranges and "up", never NY grades', () => {
    expect(screenRangeOf('NY 2/3 17/18 FC')).toBe('17/18')
    expect(screenRangeOf('NY 2/3 Scr. 16 up')).toBe('16+')
    expect(screenRangeOf('NY 2/3 FC')).toBeNull()
  })
})

describe('planCopyEdits', () => {
  // Daniel 2026-09-29: "15/16 FC" copied from 14/16 FINE CUP.
  it('copies the contract text into the description', () => {
    const p = plan('15/16 FC')
    expect(p.description).toBe('15/16 FC')
    expect(p.edits.find((e) => e.id === 'description')).toMatchObject({ section: 'basic' })
  })

  it('moves the screen requirement to the contract’s lowest screen, replacing that screen’s row and dropping the old one', () => {
    const p = plan('15/16 FC')
    const rows = p.parameters.screen_size_requirements.constraints
    expect(rows.map((c: any) => [c.screen_size, c.constraint_type, c.min_value ?? c.max_value ?? null])).toEqual([
      ['Screen 14', 'any', null],
      ['Pan', 'maximum', 10],
      ['Screen 15', 'minimum', 45],
    ])
    const edit = p.edits.find((e) => e.id === 'screen')!
    expect(edit).toMatchObject({ section: 'screen', screen: 'Screen 15', removed: 'Screen 16' })
    expect(edit.summary).toMatch(/15\/16/)
    // The source parameters are left alone.
    expect(FINE_CUP.screen_size_requirements.constraints[0].screen_size).toBe('Screen 16')
  })

  it('leaves the screens alone when the contract names the same range, or none', () => {
    expect(plan('14/16 Fine Cup').edits.find((e) => e.id === 'screen')).toBeUndefined()
    expect(plan('NY 2/3 FC').edits.find((e) => e.id === 'screen')).toBeUndefined()
  })

  it('writes a new row in the stored form when the lowest screen has none', () => {
    const params = { screen_size_requirements: { constraints: [{ screen_size: '18', constraint_type: 'minimum', min_value: 50 }] } }
    const p = plan('NY 2/3 17/18 FC', '18 up FC', params)
    expect(p.parameters.screen_size_requirements.constraints).toEqual([{ screen_size: '17', constraint_type: 'minimum', min_value: 50 }])
  })

  it('asks for a look, without changing anything, when more than one screen carries a requirement', () => {
    const params = {
      screen_size_requirements: {
        constraints: [
          { screen_size: 'Screen 16', constraint_type: 'minimum', min_value: 45 },
          { screen_size: 'Screen 15', constraint_type: 'range', min_value: 10, max_value: 30 },
        ],
      },
    }
    const p = plan('17/18 FC', '15/16 FC', params)
    expect(p.parameters.screen_size_requirements).toEqual(params.screen_size_requirements)
    expect(p.edits.find((e) => e.id === 'screen')).toMatchObject({ changed: false })
  })

  it('keeps the defects on the same NY grade and moves 12 per whole grade otherwise', () => {
    const total = (contract: string) => plan(contract, 'NY 2/3 14/16 FINE CUP').parameters.defect_configuration.thresholds.max_total
    expect(total('NY 2/3 15/16 FC')).toBe(21)
    expect(total('NY 3/4 15/16 FC')).toBe(33)
    expect(total('NY 4/5 15/16 FC')).toBe(45)
    expect(total('NY 2 15/16 FC')).toBe(15)
    expect(plan('NY 3/4 15/16 FC', 'NY 2/3 14/16 FINE CUP').edits.find((e) => e.id === 'defects'))
      .toMatchObject({ label: 'Total defects', was: '≤ 21', now: '≤ 33' })
  })

  it('reads the source grade from its description when the name has none', () => {
    const p = plan('NY 3/4 15/16 FC', '14/16 FINE CUP', FINE_CUP, 'Brazil natural NY 2/3, screen 14/16')
    expect(p.parameters.defect_configuration.thresholds.max_total).toBe(33)
  })

  // Daniel 2026-09-29: #41770/26 says only "15/16 FC"; the full text is on
  // its sys quality.
  it('copies the full quality description and reads the grade and screens from it too', () => {
    const full = 'Brazil Arabica Unwashed Coffee - NY 2/3 , Screen 15/16, Strictly Soft, Fine Cup, Crop 2026/2027.'
    const p = planCopyEdits({
      contractText: '15/16 FC', contractDescription: full,
      sourceText: '14/16 FINE CUP', sourceDescription: 'Brazil NY 3/4 14/16 Fine Cup', parameters: FINE_CUP,
    })
    expect(p.description).toBe(full)
    expect(p.edits.find((e) => e.id === 'description')).toMatchObject({ was: 'Brazil NY 3/4 14/16 Fine Cup', now: full })
    expect(p.edits.find((e) => e.id === 'screen')).toMatchObject({
      was: 'Screen 16 ≥ 45%, Screen 15 any', now: 'Screen 15 ≥ 45%, Screen 16 removed',
    })
    expect(p.parameters.defect_configuration.thresholds.max_total).toBe(9)
  })

  it('leaves the defects alone when either side names no NY grade', () => {
    expect(plan('15/16 FC', 'NY 2/3 14/16').edits.find((e) => e.id === 'defects')).toBeUndefined()
    expect(plan('NY 3/4 15/16', '14/16 FINE CUP').edits.find((e) => e.id === 'defects')).toBeUndefined()
  })
})
