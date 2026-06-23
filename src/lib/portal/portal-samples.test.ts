// src/lib/portal/portal-samples.test.ts
import { describe, it, expect } from 'vitest'
import { mapSampleRow } from './portal-samples'

describe('mapSampleRow', () => {
  it('maps a certified sample with a certificate link', () => {
    const row = mapSampleRow({
      id: 's1', tracking_number: 'BR-0231/26', origin: 'Brazil',
      quality_name: 'GC17', sample_type: 'pss', workflow_stage: 'certified', status: 'approved',
    })
    expect(row).toEqual({
      id: 's1', trackingNumber: 'BR-0231/26', origin: 'Brazil', quality: 'GC17',
      sampleType: 'pss', stage: 'certified', status: 'approved',
      certificateUrl: '/certificate/BR-0231_26',
    })
  })

  it('omits the certificate link for non-certified samples', () => {
    const row = mapSampleRow({
      id: 's2', tracking_number: 'CO-0188/26', origin: 'Colombia',
      quality_name: 'EP', sample_type: 'pss', workflow_stage: 'analysis', status: 'received',
    })
    expect(row.certificateUrl).toBeNull()
  })
})
