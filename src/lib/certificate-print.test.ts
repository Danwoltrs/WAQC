import { describe, it, expect } from 'vitest'
import { planCertificatePrint, certificatePrintBlocker, MAX_PRINT_CERTIFICATES } from './certificate-print'

const samples = [
  { id: 'a', deleted_at: null },
  { id: 'b', deleted_at: null },
  { id: 'gone', deleted_at: '2026-11-01T10:00:00Z' },
  { id: 'voided', deleted_at: null },
]
const certificates = [
  { id: 'cert-a', sample_id: 'a', voided_at: null },
  { id: 'cert-gone', sample_id: 'gone', voided_at: null },
  { id: 'cert-void', sample_id: 'voided', voided_at: '2026-11-02T10:00:00Z' },
]

describe('planCertificatePrint', () => {
  it('prints the samples that have a live certificate, in the order asked', () => {
    const plan = planCertificatePrint(['b', 'a'], samples, [...certificates, { id: 'cert-b', sample_id: 'b' }])
    expect(plan.print).toEqual([
      { sampleId: 'b', certificateId: 'cert-b' },
      { sampleId: 'a', certificateId: 'cert-a' },
    ])
    expect(plan.skipped).toEqual([])
  })

  it('leaves out a sample without a certificate and says why', () => {
    const plan = planCertificatePrint(['a', 'b'], samples, certificates)
    expect(plan.print.map((p) => p.sampleId)).toEqual(['a'])
    expect(plan.skipped).toEqual([{ sampleId: 'b', reason: 'no certificate' }])
  })

  it('never prints a deleted sample, a voided certificate or an unknown id', () => {
    const plan = planCertificatePrint(['gone', 'voided', 'nowhere'], samples, certificates)
    expect(plan.print).toEqual([])
    expect(plan.skipped).toEqual([
      { sampleId: 'gone', reason: 'deleted' },
      { sampleId: 'voided', reason: 'no certificate' },
      { sampleId: 'nowhere', reason: 'not found' },
    ])
  })

  it('prints a sample once when it is asked for twice', () => {
    expect(planCertificatePrint(['a', 'a'], samples, certificates).print).toHaveLength(1)
  })
})

describe('certificatePrintBlocker', () => {
  it('lets a selection with at least one certificate through', () => {
    expect(certificatePrintBlocker(1, 1)).toBeNull()
    expect(certificatePrintBlocker(2, 5)).toBeNull()
  })

  it('gives the reason when nothing can be printed', () => {
    expect(certificatePrintBlocker(0, 0)).toBe('Select at least one sample')
    expect(certificatePrintBlocker(0, 1)).toBe('This sample has no certificate yet')
    expect(certificatePrintBlocker(0, 4)).toBe('None of the selected samples has a certificate yet')
    expect(certificatePrintBlocker(MAX_PRINT_CERTIFICATES + 1, MAX_PRINT_CERTIFICATES + 1)).toMatch(/at most 50/i)
  })
})
