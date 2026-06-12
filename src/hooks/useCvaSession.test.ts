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
