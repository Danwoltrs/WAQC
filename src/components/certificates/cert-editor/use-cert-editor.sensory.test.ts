import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('@/components/providers/auth-provider', () => ({ useAuth: () => ({ profile: null }) }))

import { useCertEditor } from './use-cert-editor'

/**
 * The editor writes the sensory result to the LAB UNIT (the quality-assessment
 * route resolves lab_source_sample_id), so it asks the lab unit's quality what
 * to show, not the opened contract sibling's.
 */
afterEach(() => vi.unstubAllGlobals())

const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response
const notFound = () => ({ ok: false, status: 404, json: async () => ({}) }) as Response

function stubFetch(
  sample: Record<string, unknown>,
  opts: { config?: unknown; assessment?: unknown } = {},
) {
  const calls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url)
    calls.push(u)
    if (u === `/api/samples/${sample.id}`) return json({ sample })
    if (u.endsWith('/sensory-config')) return json(opts.config ?? { notesEnabled: true, profile: null, profileConfigured: false })
    if (u.endsWith('/quality-assessment') && opts.assessment) return json({ assessment: opts.assessment })
    return notFound()
  }))
  return calls
}

const base = { client_id: null, quality_spec_id: null, sample_type: 'pss', origin: 'Brazil' }

describe('useCertEditor sensory settings', () => {
  it('a contract sibling reads the sensory settings of its lab unit', async () => {
    const calls = stubFetch({ ...base, id: 'sib-1', lab_source_sample_id: 'lab-1' })
    const { result } = renderHook(() => useCertEditor('sib-1', true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(calls).toContain('/api/samples/lab-1/sensory-config')
    expect(calls).not.toContain('/api/samples/sib-1/sensory-config')
    expect(result.current.sensoryConfig).toEqual({ notesEnabled: true, profile: null, profileConfigured: false })
  })

  it('a lab unit reads its own', async () => {
    const calls = stubFetch({ ...base, id: 'lab-1', lab_source_sample_id: null })
    const { result } = renderHook(() => useCertEditor('lab-1', true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(calls).toContain('/api/samples/lab-1/sensory-config')
    expect(result.current.sensoryConfig.notesEnabled).toBe(true)
  })
})
