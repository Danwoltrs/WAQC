import { describe, it, expect } from 'vitest'
import { readQualityTextAttributes } from './quality-text-attributes'

// 2026-09-29: sys contracts carry the region and processing only in their
// quality text ("... CERRADO", "... SUL DE MINAS", "blend"); the intake
// prefills them from it.
describe('readQualityTextAttributes', () => {
  it('reads a region written the way traders write it', () => {
    expect(readQualityTextAttributes(['NY 2/3 17/18 FINE CUP CERRADO']).micro_origins).toEqual(['Cerrado Mineiro'])
    expect(readQualityTextAttributes(['NY2 17/18 SSFC Sul de Minas']).micro_origins).toEqual(['Sul de Minas'])
    expect(readQualityTextAttributes(['FC, SUL-MINAS']).micro_origins).toEqual(['Sul de Minas'])
    expect(readQualityTextAttributes(['Cerrado Mineiro natural']).micro_origins).toEqual(['Cerrado Mineiro'])
  })

  it('takes the longest region name, never its shorter part', () => {
    expect(readQualityTextAttributes(['ALTA MOGIANA 17/18']).micro_origins).toEqual(['Alta Mogiana'])
    expect(readQualityTextAttributes(['Planalto da Bahia']).micro_origins).toEqual(['Planalto da Bahia'])
  })

  it('reads a blend, and several regions', () => {
    expect(readQualityTextAttributes(['Brazil blend 17/18']).micro_origins).toEqual(['Blend'])
    expect(readQualityTextAttributes(['Cerrado / Sul de Minas']).micro_origins.sort()).toEqual(['Cerrado Mineiro', 'Sul de Minas'])
  })

  it('reads nothing from a plain grade', () => {
    expect(readQualityTextAttributes(['NY 2, 16/18, Fine Cup'])).toEqual({ micro_origins: [], processing_method: null, certifications: [] })
    expect(readQualityTextAttributes([null, undefined, ''])).toEqual({ micro_origins: [], processing_method: null, certifications: [] })
  })

  it('reads the processing, the specific name before the general one', () => {
    expect(readQualityTextAttributes(['17/18 FC NATURAL']).processing_method).toBe('Natural')
    expect(readQualityTextAttributes(['Pulped Natural 17/18']).processing_method).toBe('Semi-Washed')
    expect(readQualityTextAttributes(['semi-washed']).processing_method).toBe('Semi-Washed')
    expect(readQualityTextAttributes(['fully washed']).processing_method).toBe('Washed')
    expect(readQualityTextAttributes(['unwashed']).processing_method).toBe('Natural')
  })

  it('leaves the processing blank when the text names two', () => {
    expect(readQualityTextAttributes(['naturals and washed']).processing_method).toBeNull()
  })

  it('reads certifications by name or code', () => {
    expect(readQualityTextAttributes(['17/18 FC RA']).certifications).toEqual(['Rainforest Alliance'])
    expect(readQualityTextAttributes(['Rainforest Alliance certified, EUDR']).certifications).toEqual(['Rainforest Alliance', 'EUDR'])
    expect(readQualityTextAttributes(['organic']).certifications).toEqual(['Organic'])
    expect(readQualityTextAttributes(['FLO Fairtrade']).certifications).toEqual(['FLO Fair Trade'])
  })

  it('reads across the contract text and the sys quality name together', () => {
    expect(readQualityTextAttributes(['NY 2/3 17/18 FC', 'Cerrado Natural'])).toEqual({
      micro_origins: ['Cerrado Mineiro'], processing_method: 'Natural', certifications: [],
    })
  })
})
