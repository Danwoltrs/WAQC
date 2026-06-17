import { describe, it, expect } from 'vitest'
import {
  buildSampleApprovedSubject,
  buildSampleApprovedBody,
} from './sample-approved-template'

const base = {
  decision: 'approved' as const,
  greeting: 'Regula',
  contractNumber: '42221/26',
  sellerReference: null,
  buyerReference: '106197',
  sampleType: 'pss',
  sampleCode: 'PSS',
  trackingNumber: 'BR-036991/26',
  awb: '872243057708',
  courier: 'FedEx',
  comments: null,
}

describe('buildSampleApprovedSubject', () => {
  it('uses contract and sample code when present', () => {
    expect(buildSampleApprovedSubject(base)).toBe('Sample approved · 42221/26 · PSS')
  })
  it('drops sample code when absent', () => {
    expect(buildSampleApprovedSubject({ ...base, sampleCode: null })).toBe(
      'Sample approved · 42221/26',
    )
  })
  it('says rejected for a rejection', () => {
    expect(buildSampleApprovedSubject({ ...base, decision: 'rejected' })).toBe(
      'Sample rejected · 42221/26 · PSS',
    )
  })
})

describe('buildSampleApprovedBody', () => {
  it('includes greeting, approval line, and conditional ref/AWB lines', () => {
    const body = buildSampleApprovedBody(base)
    expect(body).toContain('Dear Regula,')
    expect(body).toContain('Wolthers has approved the following sample.')
    expect(body).toContain('Contract: 42221/26')
    expect(body).toContain('Buyer ref: 106197')
    expect(body).not.toContain('Seller ref:') // null → omitted
    expect(body).toContain('Sample: PSS · PSS')
    expect(body).toContain('AWB: 872243057708 · FedEx')
    expect(body).toContain('Best regards,')
    expect(body).toContain('Wolthers & Associates')
  })
  it('omits AWB line when awb is null', () => {
    expect(buildSampleApprovedBody({ ...base, awb: null })).not.toContain('AWB:')
  })
  it('falls back to tracking number for the sample label when no code', () => {
    const body = buildSampleApprovedBody({ ...base, sampleCode: null })
    expect(body).toContain('Sample: PSS · BR-036991/26')
  })
})

const base2 = {
  greeting: 'Paulo',
  contractNumber: '41535/26',
  sellerReference: '38378/2026',
  buyerReference: '106328',
  sampleType: 'pss',
  sampleCode: 'PSS',
  trackingNumber: 'SAN-00047/26',
  awb: null,
  courier: null,
}

describe('buildSampleApprovedBody — comments', () => {
  it('appends a Comments block when comments are present', () => {
    const body = buildSampleApprovedBody({ ...base2, decision: 'approved', comments: 'Clean cup, sweet.' })
    expect(body).toContain('Comments:')
    expect(body).toContain('Clean cup, sweet.')
  })
  it('includes comments on a rejection too', () => {
    const body = buildSampleApprovedBody({ ...base2, decision: 'rejected', comments: 'Phenol detected.' })
    expect(body).toContain('Comments:')
    expect(body).toContain('Phenol detected.')
  })
  it('omits the Comments block when comments are null or blank', () => {
    expect(buildSampleApprovedBody({ ...base2, decision: 'approved', comments: null })).not.toContain('Comments:')
    expect(buildSampleApprovedBody({ ...base2, decision: 'approved', comments: '   ' })).not.toContain('Comments:')
  })
})
