import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CvaJourney } from './CvaJourney'
import { createEmptyAssessment, type CvaAssessment } from '@/types/cva'

/** Stub the session API the hook calls: GET returns roster + assessments, PUT is a no-op. */
function stubFetch(samples: unknown[], assessments: Record<string, CvaAssessment> = {}) {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => ({
    ok: true,
    json: async () => (init?.method === 'PUT' ? {} : { samples, assessments }),
  })))
}

const reqSample = (id: string, ref: string) => ({
  id,
  reference: ref,
  reference_secondary: null,
  reference_slug: ref.replace(/\//g, '_'),
  status: null,
  min_score: 84,
  requires_descriptors: true,
})

const pill = () => screen.getByRole('button', { name: /score so far/i })
const gateShown = () => screen.queryByText(/no descriptors recorded/i)
const onScoreStep = () => screen.queryByText('Roast level') === null   // RoastStep (step 0) gone

async function renderReady(samples: unknown[], assessments: Record<string, CvaAssessment> = {}) {
  stubFetch(samples, assessments)
  render(<CvaJourney sessionId="sess-1" />)
  await screen.findByRole('button', { name: /score so far/i })   // header renders once ready
}

afterEach(() => { vi.unstubAllGlobals() })

describe('CvaJourney requires_descriptors reveal soft-gate', () => {
  it('the live-score pill jump into the score step raises the gate', async () => {
    await renderReady([reqSample('s1', 'BR-1/26')])
    fireEvent.click(pill())
    expect(gateShown()).toBeTruthy()
    expect(onScoreStep()).toBe(false)   // soft gate: did NOT advance
  })

  it('the progress-path "Score" jump raises the gate', async () => {
    await renderReady([reqSample('s1', 'BR-1/26')])
    fireEvent.click(screen.getByRole('button', { name: 'Score' }))
    expect(gateShown()).toBeTruthy()
  })

  it('the footer "Reveal score" button raises the gate', async () => {
    await renderReady([reqSample('s1', 'BR-1/26')])
    fireEvent.click(screen.getByRole('button', { name: 'Overall' }))   // jump to step 8 (no gate)
    fireEvent.click(screen.getByRole('button', { name: /reveal score/i }))
    expect(gateShown()).toBeTruthy()
  })

  it('"Keep describing" closes the gate without advancing', async () => {
    await renderReady([reqSample('s1', 'BR-1/26')])
    fireEvent.click(pill())
    fireEvent.click(screen.getByRole('button', { name: /keep describing/i }))
    expect(gateShown()).toBeNull()
    expect(onScoreStep()).toBe(false)   // still on the roast step
  })

  it('"Reveal anyway" advances and is not re-asked for the same sample', async () => {
    await renderReady([reqSample('s1', 'BR-1/26')])
    fireEvent.click(pill())
    fireEvent.click(screen.getByRole('button', { name: /reveal anyway/i }))
    expect(gateShown()).toBeNull()
    expect(onScoreStep()).toBe(true)    // advanced to the score step

    // back to roast, then jump again — the per-sample ack suppresses the prompt
    fireEvent.click(screen.getByRole('button', { name: 'Roast' }))
    expect(screen.getByText('Roast level')).toBeTruthy()
    fireEvent.click(pill())
    expect(gateShown()).toBeNull()
    expect(onScoreStep()).toBe(true)
  })

  it('the gate re-arms per sample (acking one tab does not ack another)', async () => {
    await renderReady([reqSample('s1', 'BR-1/26'), reqSample('s2', 'BR-2/26')])
    fireEvent.click(pill())
    fireEvent.click(screen.getByRole('button', { name: /reveal anyway/i }))   // acks s1
    fireEvent.click(screen.getByRole('button', { name: /BR-2/ }))             // switch to s2 tab
    fireEvent.click(pill())
    expect(gateShown()).toBeTruthy()                                          // s2 still gated
  })

  it('does not gate once any descriptor exists (describeIsEmpty short-circuit)', async () => {
    const a = createEmptyAssessment()
    a.describe.intensities.acidity = 9
    await renderReady([reqSample('s1', 'BR-1/26')], { s1: a })
    fireEvent.click(pill())
    expect(gateShown()).toBeNull()
    expect(onScoreStep()).toBe(true)    // advanced straight through
  })
})
