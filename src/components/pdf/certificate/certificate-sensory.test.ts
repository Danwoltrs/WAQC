import { describe, it, expect } from 'vitest'
import React from 'react'
import { CertificateCuppingChart } from './certificate-cupping-chart'
import { CertificateFlavorWheel } from './certificate-flavor-wheel'
import { COLORS } from './certificate-styles'
import type { SensoryResolution } from '@/lib/sensory'

/** Walk the element tree, invoking function components. Collects text and elements. */
function walk(node: unknown, out: { texts: string[]; els: any[] }) {
  if (node === null || node === undefined || typeof node === 'boolean') return
  if (typeof node === 'string' || typeof node === 'number') { out.texts.push(String(node)); return }
  if (Array.isArray(node)) { node.forEach((n) => walk(n, out)); return }
  if (typeof node !== 'object') return
  const el = node as any
  out.els.push(el)
  if (typeof el.type === 'function') { walk(el.type(el.props ?? {}), out); return }
  walk(el.props?.children, out)
}

const attr = (name: string) => ({ name, score: 7, allowedMin: null, allowedMax: null, scaleMin: 1, scaleMax: 9 })

const base = {
  attributes: [attr('Fragrance'), attr('Aroma'), attr('Flavor')],
  faults: 0, taints: 0, faultDetails: [], taintDetails: [],
  cleanCup: true, uniformCup: true, flavorDescriptor: 'Soft',
}

function sensory(over: Partial<SensoryResolution> = {}): SensoryResolution {
  return {
    version: 1,
    notes: [['Nutty/Cocoa', 'Cocoa', 'Chocolate'], ['Nutty/Cocoa', 'Nutty', 'Hazelnut']],
    profile: null,
    resolved_by: null, resolved_at: '2026-11-13T00:00:00Z', source: 'validation',
    ...over,
  }
}

function render(props: Record<string, unknown>) {
  const out = { texts: [] as string[], els: [] as any[] }
  walk(CertificateCuppingChart({ ...base, ...props } as any), out)
  return out
}

const wheels = (o: { els: any[] }) => o.els.filter((e) => e.type === CertificateFlavorWheel)

const PROFILE = {
  id: 'p1', name: 'Cerrado Mineiro', region: 'MG',
  notes: [['Nutty/Cocoa', 'Cocoa', 'Chocolate'], ['Sweet', 'Vanilla'], ['Nutty/Cocoa', 'Nutty', 'Hazelnut']],
  description: null, match: true,
}

// Text of the right column as it printed before the sensory feature existed.
const TODAY_TEXT = [
  'Clean Cup', 'Uniform Cup', 'Description', 'Soft', 'Faults', 'Taints',
]

describe('certificate cupping chart: sensory', () => {
  it('sensory null renders the right column exactly as before', () => {
    const none = render({ sensory: null })
    const absent = render({})
    expect(none.texts).toEqual(absent.texts)
    expect(wheels(none)).toHaveLength(0)
    for (const t of TODAY_TEXT) expect(none.texts).toContain(t)
    expect(none.texts.join('')).not.toContain('Notes:')
    expect(none.texts.join('')).not.toContain('Regional profile')
  })

  it('notes: a 90 pt wheel and the Notes line', () => {
    const out = render({ sensory: sensory() })
    const w = wheels(out)
    expect(w).toHaveLength(1)
    expect(w[0].props.size).toBe(90)
    expect(out.texts.join('')).toContain('Notes: Chocolate, Hazelnut')
  })

  it('no notes but a profile: no wheel, profile line only', () => {
    const out = render({ sensory: sensory({ notes: [], profile: PROFILE }) })
    expect(wheels(out)).toHaveLength(0)
    const text = out.texts.join('')
    expect(text).not.toContain('Notes: ')
    expect(text).toContain('Regional profile: Cerrado Mineiro — Matches')
  })

  it('profile line text, both verdicts, and the profile notes as words', () => {
    const yes = render({ sensory: sensory({ profile: PROFILE }) }).texts.join('')
    expect(yes).toContain('Regional profile: Cerrado Mineiro — Matches')
    expect(yes).toContain('Chocolate, Vanilla, Hazelnut')
    const no = render({ sensory: sensory({ profile: { ...PROFILE, match: false } }) }).texts.join('')
    expect(no).toContain('Regional profile: Cerrado Mineiro — Does not match')
  })

  it('the notes and profile lines are charcoal, never red', () => {
    const out = render({ sensory: sensory({ profile: { ...PROFILE, match: false } }) })
    const flat = (s: unknown): Record<string, unknown> =>
      Array.isArray(s) ? Object.assign({}, ...s.map(flat)) : ((s as Record<string, unknown>) ?? {})
    const lineEls = out.els.filter((e) => {
      const kids = e.props?.children
      const t = Array.isArray(kids) ? kids.join('') : String(kids ?? '')
      return e.type !== undefined && /^(Notes: |Regional profile: )/.test(t)
    })
    expect(lineEls.length).toBeGreaterThanOrEqual(2)
    for (const e of lineEls) expect(flat(e.props.style).color).toBe(COLORS.dark)
  })

  it('a CVA lot ignores sensory', () => {
    const out = render({
      sensory: sensory({ profile: PROFILE }),
      isSpecialtyCva: true,
      cvaDescriptors: { aroma: [], flavor: [], mouthfeel: [], mainTastes: [], paths: [['Sweet', 'Vanilla']] },
    })
    const text = out.texts.join('')
    expect(text).not.toContain('Notes:')
    expect(text).not.toContain('Regional profile')
    expect(wheels(out).every((w) => w.props.size !== 90)).toBe(true)
  })
})
