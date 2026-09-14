import { describe, it, expect } from 'vitest'
import { addressesToOffer } from './save-offer'

const none = new Set<string>()

describe('addressesToOffer', () => {
  it('offers an address the sender just added that is not saved for the company', () => {
    expect(
      addressesToOffer({ before: ['sven@ahold.nl'], after: ['sven@ahold.nl', 'qc@ldc.com'], saved: none, declined: none }),
    ).toEqual(['qc@ldc.com'])
  })

  it('does not offer an address that was already on the email, whatever its casing', () => {
    expect(
      addressesToOffer({ before: ['Jan@Ahold.nl'], after: ['Jan@Ahold.nl', 'jan@ahold.nl'], saved: none, declined: none }),
    ).toEqual([])
  })

  it('does not offer a contact already saved for QC certificates', () => {
    expect(
      addressesToOffer({
        before: [],
        after: ['Sven.Drillenburg@adcoffeecompany.nl'],
        saved: new Set(['sven.drillenburg@adcoffeecompany.nl']),
        declined: none,
      }),
    ).toEqual([])
  })

  it('does not offer again an address the sender chose to use just this once', () => {
    expect(
      addressesToOffer({ before: [], after: ['QC@ldc.com'], saved: none, declined: new Set(['qc@ldc.com']) }),
    ).toEqual([])
  })

  it('never offers a Wolthers address or a malformed one', () => {
    expect(
      addressesToOffer({ before: [], after: ['anderson@wolthers.com', 'user@domain.nl),'], saved: none, declined: none }),
    ).toEqual([])
  })

  it('offers each pasted address once, in the order given', () => {
    expect(
      addressesToOffer({ before: [], after: ['a@ldc.com', 'b@ldc.com', 'A@ldc.com'], saved: none, declined: none }),
    ).toEqual(['a@ldc.com', 'b@ldc.com'])
  })
})
