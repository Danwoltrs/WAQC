import { describe, it, expect } from 'vitest'
import {
  chooseUniqueContractRefs,
  refDiffers,
  matchSysRefsByLink,
  resolveRefForDisplay,
  isRefPinned,
  pinnedFieldsAfterPatch,
} from './contract-ref-sync'

describe('chooseUniqueContractRefs', () => {
  it('returns the refs when exactly one contract matches', () => {
    expect(chooseUniqueContractRefs([{ seller_reference: '4155261663', buyer_reference: 'IR0007882-1' }]))
      .toEqual({ seller_reference: '4155261663', buyer_reference: 'IR0007882-1' })
  })

  it('returns null when several contracts share the number (never guess)', () => {
    expect(chooseUniqueContractRefs([
      { seller_reference: '111', buyer_reference: 'A' },
      { seller_reference: '222', buyer_reference: 'B' },
    ])).toBeNull()
  })

  it('returns null when nothing matched', () => {
    expect(chooseUniqueContractRefs([])).toBeNull()
    expect(chooseUniqueContractRefs(null)).toBeNull()
  })

  it('coerces missing reference fields to null', () => {
    expect(chooseUniqueContractRefs([{ seller_reference: null as any, buyer_reference: undefined as any }]))
      .toEqual({ seller_reference: null, buyer_reference: null })
  })
})

describe('refDiffers', () => {
  it('is true when the stored value is stale', () => {
    expect(refDiffers('4155261514', '4155261663')).toBe(true)
  })

  it('is false when values match (ignoring surrounding whitespace)', () => {
    expect(refDiffers('4155261663', '  4155261663 ')).toBe(false)
  })

  it('never blanks out a stored ref when sys has no value', () => {
    expect(refDiffers('4155261663', null)).toBe(false)
    expect(refDiffers('4155261663', '   ')).toBe(false)
  })

  it('fills in an empty stored ref from sys', () => {
    expect(refDiffers(null, '4155261663')).toBe(true)
    expect(refDiffers('', '4155261663')).toBe(true)
  })
})

describe('matchSysRefsByLink', () => {
  const refs = (s: string | null, b: string | null) => ({ seller_reference: s, buyer_reference: b })

  it('prefers the contract FK over the number', () => {
    const m = matchSysRefsByLink(
      [{ key: 'k1', contractId: 'c1', contractNumber: '41912/26' }],
      new Map([['c1', { ...refs('BY-ID', 'B1'), contract_number: '41912/26' }]]),
      new Map([['41912/26', [refs('BY-NUMBER', 'B2')]]]),
    )
    expect(m.get('k1')?.seller_reference).toBe('BY-ID')
  })

  // A sample whose contract_id points at a DIFFERENT contract than its own
  // wolthers_contract_nr is mislinked (observed in prod: SAN-00609/26 said 41868/26
  // while the FK pointed at 41869/26, so the certificate printed 41869/26's seller and
  // buyer references). Never trust a contradicted FK.
  // When the FK and the number disagree we cannot tell WHICH of the two is wrong, so
  // sys is not consulted at all and the caller keeps its stored QC value — the last
  // thing a human actually entered. Resolving by number instead would silently
  // reprint three other live certificates off an unverified assumption.
  it('consults sys for neither side when a FK contradicts the contract number', () => {
    const m = matchSysRefsByLink(
      [{ key: 'k1', contractId: 'wrong-fk', contractNumber: '41868/26' }],
      new Map([['wrong-fk', { ...refs('01-5001142', 'IR0007525-1'), contract_number: '41869/26' }]]),
      new Map([['41868/26', [refs('01-5001138', 'IR0007524-1')]]]),
    )
    expect(m.has('k1')).toBe(false)
  })

  it('still trusts the FK when the caller supplies no number to check it against', () => {
    const m = matchSysRefsByLink(
      [{ key: 'k1', contractId: 'c1', contractNumber: null }],
      new Map([['c1', { ...refs('BY-ID', 'B1'), contract_number: '41912/26' }]]),
      new Map(),
    )
    expect(m.get('k1')?.seller_reference).toBe('BY-ID')
  })

  it('still trusts the FK when sys does not report the contract number', () => {
    const m = matchSysRefsByLink(
      [{ key: 'k1', contractId: 'c1', contractNumber: '41912/26' }],
      new Map([['c1', refs('BY-ID', 'B1')]]),
      new Map(),
    )
    expect(m.get('k1')?.seller_reference).toBe('BY-ID')
  })

  it('resolves by number when the FK is missing or unmatched', () => {
    const m = matchSysRefsByLink(
      [{ key: 'k1', contractId: null, contractNumber: '41913/26' }],
      new Map(),
      new Map([['41913/26', [refs('4155261412', 'IR0007546-1')]]]),
    )
    expect(m.get('k1')).toEqual(refs('4155261412', 'IR0007546-1'))
  })

  it('refuses to guess when a number is ambiguous or absent', () => {
    const m = matchSysRefsByLink(
      [
        { key: 'dup', contractNumber: '41912/26' },
        { key: 'none', contractNumber: null },
      ],
      new Map(),
      new Map([['41912/26', [refs('A', null), refs('B', null)]]]),
    )
    expect(m.has('dup')).toBe(false)
    expect(m.has('none')).toBe(false)
  })

  it('keys a mother and its split separately', () => {
    const m = matchSysRefsByLink(
      [
        { key: 's1', contractNumber: '41912/26' },
        { key: 's1:sub1', contractNumber: '41913/26' },
      ],
      new Map(),
      new Map([
        ['41912/26', [refs('4155261411', 'IR0007545-1')]],
        ['41913/26', [refs('4155261412', 'IR0007546-1')]],
      ]),
    )
    expect(m.get('s1')?.seller_reference).toBe('4155261411')
    expect(m.get('s1:sub1')?.seller_reference).toBe('4155261412')
  })
})

describe('resolveRefForDisplay', () => {
  it('shows the current sys value when the ref was never pinned by hand', () => {
    expect(resolveRefForDisplay('IR0007525-1', 'IR0007526-1', false)).toBe('IR0007526-1')
  })

  it('shows the pinned manual value even when sys still holds the old one', () => {
    // The Ahold case: staff corrected the buyer ref in WAQC, sys was never updated.
    expect(resolveRefForDisplay('IR0007524-1', 'IR0007525-1', true)).toBe('IR0007524-1')
  })

  it('falls back to the stored value when sys has nothing', () => {
    expect(resolveRefForDisplay('IR0007524-1', null, false)).toBe('IR0007524-1')
    expect(resolveRefForDisplay('IR0007524-1', '   ', false)).toBe('IR0007524-1')
  })

  it('honours a deliberate clear of a pinned ref instead of resurrecting sys', () => {
    expect(resolveRefForDisplay('', 'IR0007525-1', true)).toBeNull()
    expect(resolveRefForDisplay(null, 'IR0007525-1', true)).toBeNull()
  })

  it('returns null when neither side has a value', () => {
    expect(resolveRefForDisplay(null, null, false)).toBeNull()
    expect(resolveRefForDisplay('  ', '', false)).toBeNull()
  })

  it('trims what it returns', () => {
    expect(resolveRefForDisplay(' IR0007524-1 ', null, true)).toBe('IR0007524-1')
  })
})

describe('isRefPinned', () => {
  it('reads the marker column', () => {
    expect(isRefPinned(['buyer_contract_nr'], 'buyer_contract_nr')).toBe(true)
    expect(isRefPinned(['buyer_contract_nr'], 'seller_contract_nr')).toBe(false)
  })

  it('treats a missing/empty marker as not pinned', () => {
    expect(isRefPinned(null, 'buyer_contract_nr')).toBe(false)
    expect(isRefPinned(undefined, 'buyer_contract_nr')).toBe(false)
    expect(isRefPinned([], 'buyer_contract_nr')).toBe(false)
  })
})

describe('pinnedFieldsAfterPatch', () => {
  it('pins a reference the patch actually changes', () => {
    expect(pinnedFieldsAfterPatch(
      { buyer_contract_nr: 'IR0007525-1' },
      { buyer_contract_nr: 'IR0007524-1' },
      [],
    )).toEqual(['buyer_contract_nr'])
  })

  it('does NOT pin a full-form resubmit that changes nothing', () => {
    // sample-contracts-section posts every field on every save; only real edits count.
    expect(pinnedFieldsAfterPatch(
      { buyer_contract_nr: 'IR0007525-1', seller_contract_nr: '4155261663' },
      { buyer_contract_nr: 'IR0007525-1', seller_contract_nr: '  4155261663 ' },
      [],
    )).toEqual([])
  })

  it('ignores fields the patch does not carry', () => {
    expect(pinnedFieldsAfterPatch(
      { buyer_contract_nr: 'A', seller_contract_nr: 'B' },
      { container_nr: 'MSMU 310.423-7' },
      [],
    )).toEqual([])
  })

  it('keeps references pinned once pinned, and never duplicates', () => {
    expect(pinnedFieldsAfterPatch(
      { buyer_contract_nr: 'IR0007524-1' },
      { buyer_contract_nr: 'IR0007524-1' },
      ['buyer_contract_nr'],
    )).toEqual(['buyer_contract_nr'])
  })

  it('pins a deliberate clear', () => {
    expect(pinnedFieldsAfterPatch(
      { buyer_contract_nr: 'IR0007525-1' },
      { buyer_contract_nr: '' },
      [],
    )).toEqual(['buyer_contract_nr'])
  })

  it('pins the split-side seller column too', () => {
    expect(pinnedFieldsAfterPatch(
      { supplier_contract_nr: '4155261663' },
      { supplier_contract_nr: '4155261999' },
      [],
    )).toEqual(['supplier_contract_nr'])
  })

  it('leaves non-reference fields alone', () => {
    expect(pinnedFieldsAfterPatch(
      { buyer_contract_nr: 'A', ico_number: '002/1848/2510' },
      { ico_number: '002/1848/2511' },
      [],
    )).toEqual([])
  })
})
