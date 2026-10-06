import { describe, it, expect } from 'vitest'
import { defectRowsToDrafts, seedDefectRows } from './defects-quadrant'

const catalog = [
  { name: 'Full Black', category: 'primary' as const },
  { name: 'Broken', category: 'secondary' as const },
]

describe('Edit defects rows', () => {
  it('a lot graded with no defects still lists every defect type of its spec', () => {
    expect(seedDefectRows([], catalog)).toEqual([
      { name: 'Full Black', countText: '', fixed: true },
      { name: 'Broken', countText: '', fixed: true },
    ])
  })

  it('recorded counts fill their row, whatever the case; unlisted defects follow', () => {
    const rows = seedDefectRows([{ name: 'broken', count: 4 }, { name: 'Shell', count: 2 }], catalog)
    expect(rows).toEqual([
      { name: 'Full Black', countText: '', fixed: true },
      { name: 'Broken', countText: '4', fixed: true },
      { name: 'Shell', countText: '2' },
    ])
  })

  it('without a catalog the panel is the recorded list, as before', () => {
    expect(seedDefectRows([{ name: 'Shell', count: 0 }], [])).toEqual([{ name: 'Shell', countText: '0' }])
  })

  it('saves spec rows only when counted, added rows whenever named', () => {
    expect(defectRowsToDrafts([
      { name: 'Full Black', countText: '', fixed: true },
      { name: 'Broken', countText: '3', fixed: true },
      { name: 'Shell', countText: '0' },
      { name: '  ', countText: '5' },
    ])).toEqual([{ name: 'Broken', count: 3 }, { name: 'Shell', count: 0 }])
  })
})
