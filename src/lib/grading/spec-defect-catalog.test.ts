import { describe, it, expect } from 'vitest'
import { defectCatalogFromDefinitions, defectCatalogFromSpec } from './spec-defect-catalog'

describe('defectCatalogFromSpec', () => {
  it('lists the template defects in display order', () => {
    const params = {
      defect_configuration: {
        defects: [
          { name: 'Broken', category: 'secondary', display_order: 2 },
          { name: 'Full Black', category: 'primary', display_order: 0 },
          { name: 'Partial Sour', category: 'secondary', display_order: 1 },
        ],
      },
    }
    expect(defectCatalogFromSpec(params, null)).toEqual([
      { name: 'Full Black', category: 'primary' },
      { name: 'Partial Sour', category: 'secondary' },
      { name: 'Broken', category: 'secondary' },
    ])
  })

  it('falls back to defect_requirements, then to the client custom parameters', () => {
    expect(defectCatalogFromSpec({ defect_requirements: { defects: [{ name_en: 'Shell' }] } }, null))
      .toEqual([{ name: 'Shell', category: 'primary' }])
    expect(defectCatalogFromSpec({}, { defects: [{ name: 'Insect damage', category: 'secondary' }] }))
      .toEqual([{ name: 'Insect damage', category: 'secondary' }])
  })

  it('drops nameless and duplicate entries', () => {
    expect(defectCatalogFromSpec({ defects: [{ name: 'Husk' }, { name: '' }, { name: 'husk' }] }, null))
      .toEqual([{ name: 'Husk', category: 'primary' }])
  })

  it('is empty for a spec without defects', () => {
    expect(defectCatalogFromSpec(null, undefined)).toEqual([])
    expect(defectCatalogFromSpec({ defect_configuration: { defects: [] } }, {})).toEqual([])
  })
})

describe('defectCatalogFromDefinitions', () => {
  it('reads defect-definitions rows', () => {
    expect(defectCatalogFromDefinitions([{ name_en: 'Full Sour', category: 'primary' }, { name_en: 'Broken', category: 'secondary' }]))
      .toEqual([{ name: 'Full Sour', category: 'primary' }, { name: 'Broken', category: 'secondary' }])
    expect(defectCatalogFromDefinitions(null)).toEqual([])
  })
})
