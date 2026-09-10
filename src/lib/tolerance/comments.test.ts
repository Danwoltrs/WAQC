import { describe, expect, it } from 'vitest'
import { prefillComment, prefillComments } from './comments'
import type { ToleranceItem } from './types'

const item = (over: Partial<ToleranceItem>): ToleranceItem => ({
  key: 'k', label: 'Screen 18', quadrant: 'distribution', direction: 'min',
  actual: 27.2, limit: 30, gap: 2.8, tolerance: 5, ...over,
})

describe('prefillComment', () => {
  it('asks to improve a short screen', () => {
    expect(prefillComment(item({}))).toBe('Melhorar peneira 18 para no mínimo 30%.')
  })

  it('asks to reduce the pan', () => {
    expect(prefillComment(item({ label: 'Pan', direction: 'max', actual: 7, limit: 5 })))
      .toBe('Reduzir fundo para no máximo 5%.')
  })

  it('asks to reduce defects', () => {
    expect(prefillComment(item({
      label: 'Total defects', quadrant: 'defects', direction: 'max', actual: 14, limit: 12,
    }))).toBe('Reduzir defeitos para no máximo 12.')
  })

  it('builds one line per item', () => {
    expect(prefillComments([item({}), item({ label: 'Pan', direction: 'max', limit: 5 })]))
      .toHaveLength(2)
  })
})
