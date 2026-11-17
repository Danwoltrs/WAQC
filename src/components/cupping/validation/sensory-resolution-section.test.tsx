import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const wheel = vi.hoisted(() => ({ last: null as null | { cap: number; value: string[][] } }))
vi.mock('@/components/sensory/sensory-wheel-dialog', () => ({
  SensoryWheelDialog: ({ open, onSave, cap, value }: { open: boolean; onSave: (p: string[][]) => void; cap: number; value: string[][] }) => {
    if (open) wheel.last = { cap, value }
    return open ? (
      <div data-testid="wheel">
        <span data-testid="wheel-cap">{cap}</span>
        <button onClick={() => onSave([...value, ['Sweet', 'Vanilla']])}>wheel-add-vanilla</button>
      </div>
    ) : null
  },
}))

import {
  SensoryResolutionSection,
  useSensoryResolution,
  type ValidationSensoryRow,
} from './sensory-resolution-section'
import type { RegionalProfile, SensoryResolution } from '@/lib/sensory'

const choc = ['Nutty/Cocoa', 'Cocoa', 'Chocolate']
const nut = ['Nutty/Cocoa', 'Nutty', 'Hazelnut']
const jas = ['Floral', 'Floral', 'Jasmine']
const car = ['Sweet', 'Brown Sugar', 'Caramelized']

const profile: RegionalProfile = {
  id: 'p1', name: 'Cerrado', origin: 'Brazil', region: 'Cerrado Mineiro',
  notes: [choc, car], description: 'Chocolate and caramel, low acidity.', is_active: true,
}

const row = (id: string, name: string, picks: string[][] | null, pid: string | null = null, match: boolean | null = null): ValidationSensoryRow => ({
  score_id: id, cupper_id: null, cupper_name: name,
  sensory: picks === null ? null : { picks, profile_id: pid, profile_match: match },
})

// Four contributors plus a paper card with no sensory: choc 3 of 4, nut 2 of 4,
// jasmine 1 of 4, caramel 1 of 4. The paper card must not raise the threshold.
const panel: ValidationSensoryRow[] = [
  row('s1', 'Ana', [choc, nut, jas], 'p1', true),
  row('s2', 'Bruno', [choc, nut], 'p1', true),
  row('s3', 'Carla', [choc], 'p1', false),
  row('s4', 'Dario', [car], 'p-old', false),
  row('s5', 'Cupper 5', null),
]

let config: { notesEnabled: boolean; profile: RegionalProfile | null } = { notesEnabled: true, profile }
let configStatus = 200

beforeEach(() => {
  wheel.last = null
  config = { notesEnabled: true, profile }
  configStatus = 200
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (!String(url).endsWith('/sensory-config')) throw new Error('unexpected fetch ' + url)
    return { ok: configStatus === 200, status: configStatus, json: async () => config } as Response
  }))
})
afterEach(() => vi.unstubAllGlobals())

type HarnessProps = {
  rows?: ValidationSensoryRow[]
  excluded?: string[]
  source?: string | null
  stored?: SensoryResolution | null
  onState?: (s: ReturnType<typeof useSensoryResolution>) => void
}
function Harness({ rows = panel, excluded = [], source = null, stored = null, onState }: HarnessProps) {
  const s = useSensoryResolution({ sampleId: 'lot-1', rows, excludedScoreIds: excluded, sourceScoreId: source, storedResolution: stored })
  onState?.(s)
  return <SensoryResolutionSection state={s} rows={rows} excludedScoreIds={excluded} />
}

const chip = (term: string) => screen.getByRole('button', { name: new RegExp(`^${term}`) })
const ticked = (term: string) => chip(term).getAttribute('aria-pressed') === 'true'
const answer = (label: 'Yes' | 'No') => screen.getByRole('button', { name: label }).getAttribute('aria-pressed')

const ready = () => screen.findByText('Sensory')

describe('useSensoryResolution + SensoryResolutionSection', () => {
  it('renders nothing and sends nothing when both settings are off', async () => {
    config = { notesEnabled: false, profile: null }
    let state: ReturnType<typeof useSensoryResolution> | null = null
    const { container } = render(<Harness onState={(s) => (state = s)} />)
    await waitFor(() => expect(state!.config).not.toBeNull())
    expect(container.textContent).toBe('')
    expect(state!.visible).toBe(false)
    expect(state!.payload).toBeUndefined()
    expect(state!.blockReason).toBeNull()
  })

  it('a failed config read is all off', async () => {
    configStatus = 500
    let state: ReturnType<typeof useSensoryResolution> | null = null
    const { container } = render(<Harness onState={(s) => (state = s)} />)
    await waitFor(() => expect(state!.config).not.toBeNull())
    expect(container.textContent).toBe('')
    expect(state!.payload).toBeUndefined()
  })

  it("lists every included cupper's picks by name, and no notes for a card without any", async () => {
    render(<Harness />)
    await ready()
    const ana = screen.getByTestId('sensory-row-s1')
    expect(ana.textContent).toContain('Ana')
    expect(ana.textContent).toContain('Chocolate, Hazelnut, Jasmine')
    expect(screen.getByTestId('sensory-row-s5').textContent).toContain('no notes')
  })

  it('pre-ticks notes picked by at least half of the cuppers who gave notes', async () => {
    render(<Harness />)
    await ready()
    expect(ticked('Chocolate')).toBe(true) // 3 of 4
    expect(ticked('Hazelnut')).toBe(true) // 2 of 4
    expect(ticked('Jasmine')).toBe(false) // 1 of 4
    expect(ticked('Caramelized')).toBe(false) // 1 of 4
    expect(chip('Chocolate').textContent).toContain('3/4')
  })

  it('excluding a cupper re-seeds from the cuppers who are left', async () => {
    const { rerender } = render(<Harness />)
    await ready()
    rerender(<Harness excluded={['s1']} />)
    // Bruno, Carla, Dario: threshold 2 of 3.
    await waitFor(() => expect(ticked('Hazelnut')).toBe(false))
    expect(ticked('Chocolate')).toBe(true)
    expect(screen.queryByTestId('sensory-row-s1')).toBeNull()
    // Ana's Jasmine is nobody's pick now.
    expect(screen.queryByRole('button', { name: /^Jasmine/ })).toBeNull()
  })

  it("taking one cupper's card seeds from that card", async () => {
    const { rerender } = render(<Harness />)
    await ready()
    rerender(<Harness source="s4" />)
    await waitFor(() => expect(ticked('Caramelized')).toBe(true))
    expect(ticked('Chocolate')).toBe(false)
    // Dario answered a different profile: his answer does not count.
    expect(answer('Yes')).toBe('false')
    expect(answer('No')).toBe('false')
  })

  it('a stored resolution seeds instead of the merge (re-validation)', async () => {
    const stored: SensoryResolution = {
      version: 1, notes: [jas], resolved_by: 'v1', resolved_at: '2026-11-14T10:00:00Z', source: 'validation',
      profile: { id: 'p1', name: 'Cerrado', region: null, notes: [choc], description: null, match: false },
    }
    render(<Harness stored={stored} />)
    await ready()
    await waitFor(() => expect(ticked('Jasmine')).toBe(true))
    expect(ticked('Chocolate')).toBe(false)
    expect(answer('No')).toBe('true')
  })

  it('a stored answer for another profile is ignored; the majority applies', async () => {
    const stored: SensoryResolution = {
      version: 1, notes: [jas], resolved_by: 'v1', resolved_at: '2026-11-14T10:00:00Z', source: 'validation',
      profile: { id: 'p-old', name: 'Old', region: null, notes: [], description: null, match: false },
    }
    render(<Harness stored={stored} />)
    await ready()
    await waitFor(() => expect(ticked('Jasmine')).toBe(true))
    expect(answer('Yes')).toBe('true')
  })

  it('the validator ticks and unticks', async () => {
    let state: ReturnType<typeof useSensoryResolution> | null = null
    render(<Harness onState={(s) => (state = s)} />)
    await ready()
    fireEvent.click(chip('Jasmine'))
    expect(ticked('Jasmine')).toBe(true)
    fireEvent.click(chip('Chocolate'))
    expect(ticked('Chocolate')).toBe(false)
    expect(state!.payload).toEqual({ notes: [nut, jas], match: true })
  })

  it('Add note opens the wheel limited to 6 in total and adds the note ticked', async () => {
    render(<Harness />)
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    expect(screen.getByTestId('wheel-cap').textContent).toBe('6')
    expect(wheel.last?.value).toEqual([choc, nut])
    fireEvent.click(screen.getByText('wheel-add-vanilla'))
    expect(ticked('Vanilla')).toBe(true)
  })

  it('profile: name, notes as words, description, and the majority answer', async () => {
    render(<Harness />)
    await ready()
    expect(screen.getByText(/Cerrado/)).toBeTruthy()
    expect(screen.getByText('Chocolate, Caramelized')).toBeTruthy()
    expect(screen.getByText('Chocolate and caramel, low acidity.')).toBeTruthy()
    // Ana yes, Bruno yes, Carla no; Dario answered an old profile.
    expect(answer('Yes')).toBe('true')
  })

  it('a tie starts unanswered and blocks finalize until answered', async () => {
    const tie = [row('s1', 'Ana', [choc], 'p1', true), row('s2', 'Bruno', [choc], 'p1', false), row('s4', 'Dario', [car], 'p-old', true)]
    let state: ReturnType<typeof useSensoryResolution> | null = null
    render(<Harness rows={tie} onState={(s) => (state = s)} />)
    await ready()
    expect(answer('Yes')).toBe('false')
    expect(answer('No')).toBe('false')
    expect(state!.blockReason).toBe('Answer the regional profile: Yes or No')
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    expect(answer('No')).toBe('true')
    expect(state!.blockReason).toBeNull()
    expect(state!.payload).toEqual({ notes: [choc], match: false })
  })

  it('notes off: profile only, and the payload sends no notes', async () => {
    config = { notesEnabled: false, profile }
    let state: ReturnType<typeof useSensoryResolution> | null = null
    render(<Harness onState={(s) => (state = s)} />)
    await ready()
    expect(screen.queryByRole('button', { name: 'Add note' })).toBeNull()
    expect(screen.queryByTestId('sensory-row-s1')).toBeNull()
    expect(state!.payload).toEqual({ notes: [], match: true })
  })

  it('no profile: notes only, no answer asked, never blocked', async () => {
    config = { notesEnabled: true, profile: null }
    let state: ReturnType<typeof useSensoryResolution> | null = null
    render(<Harness onState={(s) => (state = s)} />)
    await ready()
    expect(screen.queryByRole('button', { name: 'Yes' })).toBeNull()
    expect(state!.blockReason).toBeNull()
    expect(state!.payload).toEqual({ notes: [choc, nut], match: null })
  })
})
