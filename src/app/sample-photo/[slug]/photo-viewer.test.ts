import { describe, it, expect } from 'vitest'
import { photoDownloadName, photoOverlayLines, type SamplePhotoData } from './photo-viewer'

const base: SamplePhotoData = {
  label: 'SAG-011895/26',
  certificateNumber: 'SAG-011895/26',
  lotReference: 'CTR HASU 155.201-6',
  shipper: 'Cooxupe',
  origin: 'Brazil',
  photoUrls: ['https://example.test/p.jpg'],
}

describe('sample photo download', () => {
  it('burns the certificate and the lot identifier into the photo', () => {
    expect(photoOverlayLines(base)).toEqual([
      'Certificate: SAG-011895/26',
      'Sample: CTR HASU 155.201-6',
      'Shipper: Cooxupe',
      'Origin: Brazil',
    ])
  })

  it('names the lot by its identifier when there is no certificate', () => {
    const data = { ...base, label: 'SMP 144/26', certificateNumber: null, lotReference: null }
    expect(photoOverlayLines(data)).toEqual(['Sample: SMP 144/26', 'Shipper: Cooxupe', 'Origin: Brazil'])
    expect(photoDownloadName(data, 0)).toBe('SMP_144_26_photo_1.jpg')
  })

  it('names the file by the certificate number', () => {
    expect(photoDownloadName(base, 1)).toBe('SAG-011895_26_photo_2.jpg')
  })
})
