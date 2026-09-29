import { describe, expect, it } from 'vitest'
import { isImpliedScreen, screenNumberOf, withImpliedScreens } from './implied-screens'

const sizes = (rows: Array<{ screen_size: string }>) => rows.map((r) => r.screen_size)

describe('screenNumberOf', () => {
  it('reads numbered screens in both spellings, never Pan or Peas', () => {
    expect(screenNumberOf('Screen 17')).toBe(17)
    expect(screenNumberOf('17')).toBe(17)
    expect(screenNumberOf('Pan')).toBeNull()
    expect(screenNumberOf('Peas 11')).toBeNull()
  })
})

describe('withImpliedScreens', () => {
  it('adds Screen 17 between 18 and 16 as any amount, and nothing next to Pan', () => {
    const rows = withImpliedScreens([
      { screen_size: 'Screen 18', constraint_type: 'minimum', min_value: 35 },
      { screen_size: 'Screen 16', constraint_type: 'minimum', min_value: 40 },
      { screen_size: 'Pan', constraint_type: 'maximum', max_value: 5 },
    ])
    expect(sizes(rows)).toEqual(['Screen 18', 'Screen 16', 'Pan', 'Screen 17'])
    const added = rows[3]
    expect(isImpliedScreen(added)).toBe(true)
    expect(added).toMatchObject({ constraint_type: 'any' })
  })

  it('fills a wide gap and keeps the stored spelling', () => {
    expect(sizes(withImpliedScreens([
      { screen_size: '18', constraint_type: 'minimum' },
      { screen_size: '14', constraint_type: 'any' },
    ]).filter(isImpliedScreen))).toEqual(['17', '16', '15'])
  })

  it('adds nothing with one numbered screen, or none missing', () => {
    const one = [{ screen_size: 'Screen 18', constraint_type: 'minimum' }, { screen_size: 'Pan', constraint_type: 'maximum' }]
    expect(withImpliedScreens(one)).toEqual(one)
    const full = [{ screen_size: 'Screen 17', constraint_type: 'minimum' }, { screen_size: 'Screen 16', constraint_type: 'any' }]
    expect(withImpliedScreens(full)).toEqual(full)
  })

  it('never fills between Peas', () => {
    const peas = [{ screen_size: 'Peas 11', constraint_type: 'any' }, { screen_size: 'Peas 9', constraint_type: 'any' }]
    expect(withImpliedScreens(peas)).toEqual(peas)
  })
})
