import { describe, it, expect } from 'vitest'
import React from 'react'
import type { CertificateData } from '@/lib/certificate-data'
import { QualityCertificate } from './quality-certificate'

/**
 * These tests deliberately go through QualityCertificate — the component the
 * shipped certificate actually renders — rather than through the cupping
 * component in isolation.
 *
 * That is the whole point. The CVA headline score and pass mark were first
 * implemented in `certificate-cupping.tsx`, which had its own passing tests,
 * while the certificate renders `CertificateCuppingChart` instead. Every test
 * was green and the score never reached a single printed page. A test that
 * stops at the sub-component cannot catch a prop that is never passed.
 */

/**
 * Walk an element tree and collect every string/number leaf, INVOKING nested
 * function components as it goes.
 *
 * Following `props.children` alone is not enough: a child component is an
 * element whose type is an uncalled function, so the walk stops at the
 * boundary and returns nothing — which silently turns every `not.toContain`
 * assertion below into a pass against an empty string. These are react-pdf
 * presentational components with no hooks or context, so calling them
 * directly is safe.
 */
function collectTexts(node: unknown): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return []
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap(collectTexts)
  if (typeof node !== 'object') return []
  const el = node as { type?: unknown; props?: { children?: unknown } }
  if (typeof el.type === 'function') {
    return collectTexts((el.type as (p: unknown) => unknown)(el.props ?? {}))
  }
  return collectTexts(el.props?.children)
}

const attribute = (name: string) => ({
  name,
  score: 7,
  allowedMin: null,
  allowedMax: null,
  scaleMin: 1,
  scaleMax: 9,
})

function certificateData(cupping: Partial<CertificateData['cuppingData']>): CertificateData {
  return {
    sample: { id: 's1', tracking_number: 'SAN-1/26', origin: 'Brazil' },
    supplyChain: {},
    client: {},
    laboratory: {},
    greenBeanAnalysis: null,
    roastAnalysis: null,
    cuppingComments: null,
    gradingComments: null,
    certificate: { certificate_number: 'MONT-1/26', is_rejected: false },
    qualitySpec: null,
    specLimits: null,
    cuppingData: {
      attributes: [attribute('Fragrance'), attribute('Aroma'), attribute('Flavor')],
      overallScore: 89.5,
      comments: null,
      isSpecialty: true,
      taints: null,
      faults: null,
      taintDetails: [],
      faultDetails: [],
      cleanCup: true,
      uniformCup: true,
      flavorDescriptor: null,
      cvaVerdict: null,
      cvaDescriptors: null,
      ...cupping,
    },
  } as unknown as CertificateData
}

// Joined with no separator on purpose: JSX interpolation splits `min {x}` into
// the two leaves "min " and "80", so any separator would break them apart and
// a `toContain('min 80')` would fail on text the page renders correctly.
const render = (data: CertificateData) =>
  collectTexts(QualityCertificate({ data } as any)).join('')

describe('specialty certificate: the CVA block reaches the printed page', () => {
  it('prints the 0-100 score and the mark it was judged against', () => {
    const text = render(
      certificateData({ cvaVerdict: { minScore: 84, passed: true } }),
    )
    expect(text).toContain('CVA SCORE')
    expect(text).toContain('89.5')
    expect(text).toContain('min 84')
  })

  it('prints a whole-number mark without trailing decimals', () => {
    const text = render(certificateData({ cvaVerdict: { minScore: 80, passed: true } }))
    expect(text).toContain('min 80')
    expect(text).not.toContain('min 80.00')
  })

  it('says the cup could not be judged rather than implying a fail', () => {
    // cva_passed === null is "no mark configured / nothing scored". Rendering
    // it as, or next to, a failure would assert something untrue about the lot.
    const text = render(certificateData({ cvaVerdict: { minScore: null, passed: null } }))
    expect(text).toContain('Could not be judged')
  })

  it('prints what the cupper highlighted on the flavour wheel', () => {
    const text = render(
      certificateData({
        cvaVerdict: { minScore: 84, passed: true },
        cvaDescriptors: {
          aroma: ['Caramelized'],
          flavor: ['Chocolate'],
          mouthfeel: ['Smooth'],
          mainTastes: ['Sour'],
        },
      }),
    )
    expect(text).toContain('Flavour wheel')
    expect(text).toContain('Caramelized')
    expect(text).toContain('Chocolate')
    expect(text).toContain('Smooth')
    expect(text).toContain('Sour')
  })

  it('omits the wheel block entirely when nothing was highlighted', () => {
    const text = render(
      certificateData({ cvaVerdict: { minScore: 84, passed: true }, cvaDescriptors: null }),
    )
    expect(text).not.toContain('Flavour wheel')
  })

  it('leaves a commodity certificate untouched — no CVA block at all', () => {
    // cvaVerdict null is the commodity path's own signal (see CuppingData).
    const text = render(certificateData({ cvaVerdict: null, cvaDescriptors: null }))
    expect(text).not.toContain('CVA SCORE')
    expect(text).not.toContain('Flavour wheel')
    expect(text).not.toContain('min 84')
  })
})
