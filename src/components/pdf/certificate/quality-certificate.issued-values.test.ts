import { describe, it, expect } from 'vitest'
import type { CertificateData } from '@/lib/certificate-data'
import { QualityCertificate } from './quality-certificate'

/**
 * Task 8: the PDF prints the screen percentages certificate-data.ts already
 * resolved (issued when a tolerance decision exists, grams-derived otherwise)
 * instead of deriving its own from the raw grams. Deriving it again in the
 * PDF is exactly what let an earlier override reach the PDF but not the
 * public QR page — the two disagreed because they each did their own math.
 *
 * These tests go through QualityCertificate itself (not the screen/defects
 * sub-component in isolation) so a prop that never gets passed cannot hide
 * behind a green sub-component test — same reasoning as
 * certificate-cva-block.test.ts.
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

function certificateData(overrides: {
  greenBeanAnalysis: CertificateData['greenBeanAnalysis']
  specLimits?: CertificateData['specLimits']
}): CertificateData {
  return {
    sample: { id: 's1', tracking_number: 'SAN-1/26', origin: 'Brazil' },
    supplyChain: {},
    client: {},
    laboratory: {},
    greenBeanAnalysis: overrides.greenBeanAnalysis,
    roastAnalysis: null,
    cuppingComments: null,
    gradingComments: null,
    certificate: { certificate_number: 'MONT-1/26', is_rejected: false },
    qualitySpec: null,
    specLimits: overrides.specLimits ?? null,
    cuppingData: null,
  } as unknown as CertificateData
}

const render = (data: CertificateData) => collectTexts(QualityCertificate({ data } as any)).join(' ')

describe('QualityCertificate: screen percentages come from the resolver, not from grams', () => {
  it('prints the resolved (issued) percentage, ignoring what the raw grams would derive', () => {
    const data = certificateData({
      greenBeanAnalysis: {
        moisture_percentage: null,
        density: null,
        humidity: null,
        green_aspect: null,
        // Raw grams alone would derive 10% for screen 15 — well under the
        // 20% minimum below — but a tolerance decision issued 25%, which is
        // in spec. The PDF must print 25, not 10, and must not flag it.
        screen_sizes: { '15': 100, '14': 900 },
        screen_percentages: { '15': 25, '14': 75 },
        issued: true,
        defects: null,
      },
      specLimits: {
        screen_size_constraints: [{ screen_size: '15', constraint_type: 'minimum', min_value: 20 }],
      },
    })

    const text = render(data)
    expect(text).toContain('25%')
    expect(text).not.toContain('10%')
    expect(text).not.toContain('(min 20%)')
  })

  it('still flags an out-of-spec value when the resolved percentage itself is out of spec (no decision)', () => {
    const data = certificateData({
      greenBeanAnalysis: {
        moisture_percentage: null,
        density: null,
        humidity: null,
        green_aspect: null,
        screen_sizes: { '15': 100, '14': 900 },
        screen_percentages: { '15': 10, '14': 90 },
        issued: false,
        defects: null,
      },
      specLimits: {
        screen_size_constraints: [{ screen_size: '15', constraint_type: 'minimum', min_value: 20 }],
      },
    })

    const text = render(data)
    expect(text).toContain('10%')
    expect(text).toContain('(min 20%)')
  })

  it('renders nothing for the screen section when there is no resolved data', () => {
    const data = certificateData({
      greenBeanAnalysis: {
        moisture_percentage: null,
        density: null,
        humidity: null,
        green_aspect: null,
        screen_sizes: { '15': 100, '14': 900 },
        screen_percentages: null,
        issued: false,
        defects: null,
      },
    })

    const text = render(data)
    expect(text).not.toContain('15')
    expect(text).not.toContain('Screen')
  })
})
