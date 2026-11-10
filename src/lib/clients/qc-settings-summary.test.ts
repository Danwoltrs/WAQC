import { describe, it, expect } from 'vitest'
import { pricingSummary, billingSummary, rulesSummary, validitySummary, certificateNumberPreview } from './qc-settings-summary'
import { DEFAULT_CERTIFICATE_PATTERN } from '@/types/certificate-pattern'

describe('pricingSummary', () => {
  it('prints each model', () => {
    expect(pricingSummary({ pricingModel: 'per_sample', pricePerSample: 50, currency: 'USD' })).toBe('Per sample · USD 50.00')
    expect(pricingSummary({ pricingModel: 'per_pound', pricePerPoundCents: 1 })).toBe('1 c/lb')
    expect(pricingSummary({ pricingModel: 'complimentary' })).toBe('Complimentary')
    expect(pricingSummary({ pricingModel: 'per_sample' })).toBe('Per sample, no price set')
    expect(pricingSummary({})).toBe('Not set')
  })
})

describe('billingSummary', () => {
  it('joins basis, terms and co-broker', () => {
    expect(billingSummary({ billingBasis: 'approved_only', paymentTerms: 'Net 30' })).toBe('Approved only · Net 30')
    expect(billingSummary({ billingBasis: 'all_samples', qcFeeCoBrokerCompanyId: 'x' })).toBe('All samples · Deducted from co-broker')
    expect(billingSummary({})).toBe('Not set')
  })
})

describe('rules and validity', () => {
  it('says on and off plainly', () => {
    expect(rulesSummary({ toleranceAutoApprove: true, certificatesToAllParties: false })).toBe('5% rule on · sharing off')
    expect(validitySummary({ certificateValidityMonths: 6 })).toBe('6 months')
    expect(validitySummary({ certificateValidityMonths: null })).toBe('Off')
  })
})

describe('certificateNumberPreview', () => {
  it('previews the default pattern and handles a missing one', () => {
    expect(certificateNumberPreview(DEFAULT_CERTIFICATE_PATTERN)).toMatch(/\d+\/\d{2}/)
    expect(certificateNumberPreview(null)).toBeNull()
  })
})
