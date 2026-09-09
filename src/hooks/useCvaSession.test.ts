import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useCvaSession } from './useCvaSession'
import { createEmptyAssessment } from '@/types/cva'

const sample = { id: 's1', tracking_number: 'BR-1/26', status: null, min_score: 84, requires_descriptors: true }

/** Legacy v1 blob a Phase-1 row could hold (no picks arrays). */
const legacyAssessment = (() => {
  const a = createEmptyAssessment() as unknown as Record<string, unknown>
  a.describe = {
    intensities: { fragrance: 0, aroma: 0, flavor: 0, aftertaste: 0, acidity: 0, sweetness: 0, mouthfeel: 0 },
    aroma: { cata: ['Floral'] },
    flavor_aftertaste: { cata: [], main_tastes: [] },
    mouthfeel: { cata: [] },
    notes: {},
    voice: {},
  }
  return a
})()

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => ({
    ok: true,
    json: async () =>
      init?.method === 'PUT' ? {} : { samples: [sample], assessments: { s1: legacyAssessment } },
  })))
})

describe('useCvaSession describe support', () => {
  it('normalizes loaded assessments and setDescribe mutates + autosaves the blob', async () => {
    const { result } = renderHook(() => useCvaSession('sess-1'))
    await waitFor(() => expect(result.current.ready).toBe(true))

    // hydrated legacy blob got picks arrays
    expect(result.current.assessment.describe.aroma.picks).toEqual([])
    expect(result.current.assessment.describe.aroma.cata).toEqual(['Floral'])

    act(() => {
      result.current.setDescribe((d) => ({
        ...d,
        aroma: { picks: [{ path: ['Fruity', 'Berry', 'Blueberry'] }], cata: ['Fruity', 'Berry'] },
      }))
    })
    expect(result.current.assessment.describe.aroma.picks).toHaveLength(1)

    // debounced PUT carries the describe blob
    await waitFor(() => {
      const put = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(([, init]) => init?.method === 'PUT')
      expect(put).toBeTruthy()
      const body = JSON.parse((put![1] as RequestInit).body as string)
      expect(body.assessment.describe.aroma.picks).toHaveLength(1)
    }, { timeout: 2000 })
  })
})

describe('useCvaSession cups support', () => {
  it('setCups writes the cups and the autosaved blob carries them — the first thing that ever has', async () => {
    // types/cva.ts defined cups from the start and nothing set them, so every
    // CVA score in the database had u = d = 0. The PUT route derives u/d from
    // cups on the way in, so writing cups is the whole fix.
    const { result } = renderHook(() => useCvaSession('sess-1'))
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.assessment.cups).toEqual({ non_uniform: [], defective: [] })

    act(() => {
      result.current.setCups({ non_uniform: [2, 4], defective: [{ cup: 4, type: 'phenolic' }] })
    })
    expect(result.current.assessment.cups).toEqual({ non_uniform: [2, 4], defective: [{ cup: 4, type: 'phenolic' }] })
    expect(result.current.scoreOf('s1').u).toBe(2)
    expect(result.current.scoreOf('s1').d).toBe(1)

    await waitFor(() => {
      const put = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(([, init]) => init?.method === 'PUT')
      expect(put).toBeTruthy()
      const body = JSON.parse((put![1] as RequestInit).body as string)
      expect(body.assessment.cups).toEqual({ non_uniform: [2, 4], defective: [{ cup: 4, type: 'phenolic' }] })
    })
  })

  it('a legacy row with no cups field reads as an untouched table', async () => {
    const { result } = renderHook(() => useCvaSession('sess-1'))
    await waitFor(() => expect(result.current.ready).toBe(true))
    // legacyAssessment was built from createEmptyAssessment, so strip cups the way a pre-cups row would lack it
    expect(result.current.assessment.cups ?? { non_uniform: [], defective: [] }).toEqual({ non_uniform: [], defective: [] })
  })
})

describe('useCvaSession step-major navigation (SCA-102 §7; locked decision 2)', () => {
  // "step 1 is done for all the coffees on the table, next step 2, and finally
  // step 3." The section is the page; the lot strip switches lots WITHIN it.
  // So the step is one value for the whole table, not one per sample.
  const two = [
    { id: 's1', tracking_number: 'BR-1/26', status: null, min_score: 84, requires_descriptors: true },
    { id: 's2', tracking_number: 'BR-2/26', status: null, min_score: 84, requires_descriptors: true },
  ]
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => (init?.method === 'PUT' ? {} : { samples: two, assessments: {} }),
    })))
  })

  it('switching lots keeps the step', async () => {
    const { result } = renderHook(() => useCvaSession('sess-1'))
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.step).toBe(0)
    act(() => { result.current.setStep(5) })
    expect(result.current.step).toBe(5)
    act(() => { result.current.setActive('s2') })
    expect(result.current.activeId).toBe('s2')
    expect(result.current.step).toBe(5)
    act(() => { result.current.setActive('s1') })
    expect(result.current.step).toBe(5)
  })

  it('exposes every lot\'s assessment, so the strip can say who is rated for the current section', async () => {
    const { result } = renderHook(() => useCvaSession('sess-1'))
    await waitFor(() => expect(result.current.ready).toBe(true))
    act(() => { result.current.setSectionValue('aroma', { impression: 7 }) })
    expect(result.current.assessments.s1.sections.aroma?.impression).toBe(7)
    expect(result.current.assessments.s2?.sections.aroma).toBeUndefined()
  })
})
