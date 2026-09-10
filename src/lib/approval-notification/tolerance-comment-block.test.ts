import { describe, expect, it } from 'vitest'
import { buildToleranceBlock } from './tolerance-comment-block'
import type { ToleranceItem } from '@/lib/tolerance/types'

const screen: ToleranceItem = {
  key: 'screen_18_min', label: 'Screen 18', quadrant: 'distribution',
  direction: 'min', actual: 27.2, limit: 30, gap: 2.8, tolerance: 5,
}

describe('buildToleranceBlock', () => {
  it('states actual, required and gap for each item', () => {
    const html = buildToleranceBlock([screen], ['Melhorar peneira 18.'], false)
    expect(html).toContain('Screen 18')
    expect(html).toContain('27.2%')
    expect(html).toContain('30%')
    expect(html).toContain('Melhorar peneira 18.')
  })

  it('adds the additional sample request when ticked', () => {
    const html = buildToleranceBlock([screen], [], true)
    expect(html).toMatch(/amostra adicional/i)
  })

  it('omits the additional sample request when not ticked', () => {
    expect(buildToleranceBlock([screen], [], false)).not.toMatch(/amostra adicional/i)
  })

  it('returns an empty string when there is nothing to say', () => {
    expect(buildToleranceBlock([], [], false)).toBe('')
  })
})
