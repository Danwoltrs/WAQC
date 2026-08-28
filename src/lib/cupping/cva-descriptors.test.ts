import { describe, it, expect } from 'vitest'
import { cvaDescriptors } from './cva-descriptors'

describe('cvaDescriptors', () => {
  it('prints only the leaf of each wheel path, not the whole path', () => {
    // The real Blaser lot SAN-00612/26: the cupper picked one aroma and one
    // flavour term. `cata` carries the ancestors and must never be printed
    // alongside, or the certificate reads "Nutty/Cocoa, Cocoa, Chocolate".
    const out = cvaDescriptors({
      aroma: { picks: [{ path: ['Sweet', 'Brown Sugar', 'Caramelized'] }], cata: ['Sweet', 'Brown Sugar'] },
      flavor_aftertaste: {
        picks: [{ path: ['Nutty/Cocoa', 'Cocoa', 'Chocolate'] }],
        cata: ['Nutty/Cocoa', 'Cocoa'],
        main_tastes: [],
      },
      mouthfeel: { cata: [] },
    } as any)
    expect(out).toEqual({
      aroma: ['Caramelized'],
      flavor: ['Chocolate'],
      mouthfeel: [],
      mainTastes: [],
      paths: [['Sweet', 'Brown Sugar', 'Caramelized'], ['Nutty/Cocoa', 'Cocoa', 'Chocolate']],
    })
  })

  it('keeps a one-segment path (the cupper stopped at the inner ring)', () => {
    const out = cvaDescriptors({ aroma: { picks: [{ path: ['Sweet'] }], cata: [] } } as any)
    expect(out?.aroma).toEqual(['Sweet'])
  })

  it('de-duplicates leaves that repeat across picks, keeping pick order', () => {
    const out = cvaDescriptors({
      flavor_aftertaste: {
        picks: [
          { path: ['Nutty/Cocoa', 'Cocoa', 'Chocolate'] },
          { path: ['Sweet', 'Chocolate'] },
          { path: ['Fruity', 'Berry', 'Raspberry'] },
        ],
        cata: [],
        main_tastes: [],
      },
    } as any)
    expect(out?.flavor).toEqual(['Chocolate', 'Raspberry'])
  })

  it('prints mouthfeel CATA verbatim — it has no wheel, so cata IS the selection', () => {
    const out = cvaDescriptors({ mouthfeel: { cata: ['Smooth', 'Rough'] } } as any)
    expect(out?.mouthfeel).toEqual(['Smooth', 'Rough'])
  })

  it('carries the basic tastes through', () => {
    const out = cvaDescriptors({
      flavor_aftertaste: { picks: [], cata: [], main_tastes: ['Sour'] },
    } as any)
    expect(out?.mainTastes).toEqual(['Sour'])
  })

  it('carries the full pick paths, both olfactory groups merged, for the wheel', () => {
    const out = cvaDescriptors({
      aroma: { picks: [{ path: ['Sweet', 'Brown Sugar', 'Caramelized'] }], cata: [] },
      flavor_aftertaste: {
        picks: [{ path: ['Nutty/Cocoa', 'Cocoa', 'Chocolate'] }, { path: ['Sweet'] }],
        cata: [], main_tastes: [],
      },
    } as any)
    expect(out?.paths).toEqual([
      ['Sweet', 'Brown Sugar', 'Caramelized'],
      ['Nutty/Cocoa', 'Cocoa', 'Chocolate'],
      ['Sweet'],
    ])
  })

  it('drops malformed paths from `paths` rather than drawing a broken wedge', () => {
    const out = cvaDescriptors({
      aroma: { picks: [{ path: ['Sweet', '  '] }, { path: [] }, { path: ['Fruity', 'Berry'] }], cata: [] },
    } as any)
    expect(out?.paths).toEqual([['Fruity', 'Berry']])
  })

  it('returns null when nothing was highlighted, so no empty block prints', () => {
    expect(cvaDescriptors(null)).toBeNull()
    expect(cvaDescriptors(undefined)).toBeNull()
    expect(cvaDescriptors({} as any)).toBeNull()
    expect(
      cvaDescriptors({
        aroma: { picks: [], cata: [] },
        flavor_aftertaste: { picks: [], cata: [], main_tastes: [] },
        mouthfeel: { cata: [] },
      } as any),
    ).toBeNull()
  })

  it('survives malformed persisted rows without throwing', () => {
    const out = cvaDescriptors({
      aroma: { picks: [{ path: [] }, { path: null }, null, { path: ['  ', 'Vanilla'] }] },
      mouthfeel: { cata: ['', '  ', 'Smooth', 7] },
    } as any)
    // `paths` is empty while `aroma` still lists Vanilla, and that asymmetry is
    // deliberate: the path ['  ','Vanilla'] has a blank family, so the term can
    // be PRINTED but its wedge cannot be located on the wheel. Print what is
    // legible, draw only what can be placed.
    expect(out).toEqual({
      aroma: ['Vanilla'], flavor: [], mouthfeel: ['Smooth'], mainTastes: [], paths: [],
    })
  })

  it('drops a pick whose leaf is only whitespace', () => {
    expect(cvaDescriptors({ aroma: { picks: [{ path: ['Sweet', '   '] }] } } as any)).toBeNull()
  })
})
