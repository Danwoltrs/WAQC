import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CvaJourney } from './CvaJourney'
import { createEmptyAssessment, type CvaAssessment } from '@/types/cva'

/** Stub the session API the hook calls: GET returns roster + assessments, PUT is a no-op. */
function stubFetch(samples: unknown[], assessments: Record<string, CvaAssessment> = {}, canFinalize = false) {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => ({
    ok: true,
    json: async () => (init?.method === 'PUT' ? {} : { samples, assessments, can_finalize: canFinalize }),
  })))
}

const reqSample = (id: string, ref: string, requiresDescriptors = true) => ({
  id,
  reference: ref,
  reference_secondary: null,
  reference_slug: ref.replace(/\//g, '_'),
  status: null,
  min_score: 84,
  requires_descriptors: requiresDescriptors,
})

const pill = () => screen.getByRole('button', { name: /score so far/i })
const gateShown = () => screen.queryByText(/no descriptors recorded/i)
const onScoreStep = () => screen.queryByText('Roast level') === null   // RoastStep (step 0) gone
// onScoreStep only proves we left Roast — Score and Certify both satisfy it,
// so a regression that lands the gate on Certify instead of Score would slip
// past every existing assertion above. These two are mutually exclusive.
const onCertifyStep = () => screen.queryByText('Certify this lot') !== null
const scoreStepShown = () => screen.queryByText(/CVA score appears/i) !== null

async function renderReady(
  samples: unknown[],
  assessments: Record<string, CvaAssessment> = {},
  canFinalize = false,
) {
  stubFetch(samples, assessments, canFinalize)
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

  it('"Reveal anyway" lands on the Score step itself, not on Certify (a step now sits beyond it)', async () => {
    await renderReady([reqSample('s1', 'BR-1/26')])
    fireEvent.click(pill())
    fireEvent.click(screen.getByRole('button', { name: /reveal anyway/i }))
    expect(scoreStepShown()).toBe(true)
    expect(onCertifyStep()).toBe(false)
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

describe('CvaJourney Certify step is keyed per sample', () => {
  it('does not carry an open override draft (or its comment) across a tab switch', async () => {
    // requires_descriptors: false on both — this test is about the Certify
    // step's own identity across tabs, not the unrelated soft gate.
    await renderReady(
      [reqSample('s1', 'BR-1/26', false), reqSample('s2', 'BR-2/26', false)],
      {},
      true,
    )

    // Put BOTH samples at the Certify step. This is the exact precondition
    // for the leak the review found: CertifyStep sits at the same JSX
    // position regardless of which tab is active, so without its own `key`
    // React reuses the same mounted instance across a tab switch instead of
    // remounting it.
    fireEvent.click(screen.getByRole('button', { name: 'Certify' }))   // s1 -> step 10 (only nav item named this right now)
    fireEvent.click(screen.getByRole('button', { name: /BR-2/ }))      // switch to s2 (lands on s2's own step 0)
    fireEvent.click(screen.getByRole('button', { name: 'Certify' }))   // s2 -> step 10
    fireEvent.click(screen.getByRole('button', { name: /BR-1/ }))      // back to s1 (still at step 10)

    // Open an override on s1 and write a comment about it — do not submit.
    fireEvent.click(screen.getByRole('button', { name: /^override$/i }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'about lot A' } })
    expect(screen.getByRole('textbox')).toHaveValue('about lot A')

    // Switch to s2 without submitting. CertifyStep must remount fresh here —
    // s1's open form and its comment must not appear on s2's certify view.
    fireEvent.click(screen.getByRole('button', { name: /BR-2/ }))
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /reject this lot/i })).toBeNull()

    // Re-opening Override on s2 starts from a clean field, not s1's text —
    // the audit-trail comment a cupper submits here must only ever be about
    // the sample it is submitted for.
    fireEvent.click(screen.getByRole('button', { name: /^override$/i }))
    expect(screen.getByRole('textbox')).toHaveValue('')
  })
})
