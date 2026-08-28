import { describe, it, expect } from 'vitest'
import { buildQualityLine } from './certificate-quality-description'
import { CertificateComments } from './certificate-comments'

function texts(node: unknown): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return []
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap(texts)
  if (typeof node !== 'object') return []
  const el = node as { type?: unknown; props?: { children?: unknown } }
  if (typeof el.type === 'function') return texts((el.type as (p: unknown) => unknown)(el.props ?? {}))
  return texts(el.props?.children)
}

describe('buildQualityLine', () => {
  it('puts certifications after the quality and before the crop', () => {
    expect(
      buildQualityLine(
        "Brazilian Washed Coffee from 'Monte Alegre Farm' - Fine Cup, Greenish",
        ['eudr'],
        '26/27',
      ),
    ).toBe("Brazilian Washed Coffee from 'Monte Alegre Farm' - Fine Cup, Greenish, EUDR, Crop 26/27")
  })

  it('expands certification codes to their display names', () => {
    expect(buildQualityLine('NY 2', ['ra', 'fairtrade'], null)).toBe(
      'NY 2, Rainforest Alliance, Fairtrade',
    )
  })

  it('lists several certifications in order, all before the crop', () => {
    expect(buildQualityLine('NY 2', ['organic', 'eudr'], '25/26')).toBe(
      'NY 2, Organic, EUDR, Crop 25/26',
    )
  })

  it('does not repeat a certification the description already names', () => {
    expect(buildQualityLine('Brazilian Organic Coffee', ['organic'], '26/27')).toBe(
      'Brazilian Organic Coffee, Crop 26/27',
    )
  })

  it('handles a missing quality, missing certifications and missing crop', () => {
    expect(buildQualityLine('NY 2', null, null)).toBe('NY 2')
    expect(buildQualityLine(null, ['eudr'], null)).toBe('EUDR')
    expect(buildQualityLine(null, null, '26/27')).toBe('Crop 26/27')
    expect(buildQualityLine(null, [], null)).toBeNull()
  })
})

describe('CertificateComments: machine re-certification text is not printed', () => {
  // These strings were written into `override_comment` by the finalize
  // pipeline on every re-finalize and printed to the customer verbatim.
  it.each([
    'Re-certified (rev 4): Re-certified with no changes to decision or violations',
    'Re-certified (rev 1): Decision changed from APPROVED to REJECTED',
  ])('suppresses %s', (comment) => {
    const text = texts(
      CertificateComments({ cuppingNotes: null, additionalNotes: null, overrideComment: comment }),
    ).join(' ')
    expect(text).not.toContain('Re-certified')
    expect(text).toContain('No comments')
  })

  it('still prints a genuine override remark a human typed', () => {
    const text = texts(
      CertificateComments({
        cuppingNotes: null,
        additionalNotes: null,
        overrideComment: 'Approved by master cupper despite the screen shortfall.',
      }),
    ).join(' ')
    expect(text).toContain('Approved by master cupper despite the screen shortfall.')
    expect(text).toContain('Override:')
  })

  it('still prints cupping notes', () => {
    const text = texts(
      CertificateComments({ cuppingNotes: 'Sweet, balanced.', additionalNotes: null }),
    ).join(' ')
    expect(text).toContain('Sweet, balanced.')
  })
})
