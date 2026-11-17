import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CuppingEditPanel, CuppingQuadrant } from './cupping-quadrant'

// The wheel itself is tested with the dialog; here it only hands back a pick.
vi.mock('@/components/sensory/sensory-wheel-dialog', () => ({
  SensoryWheelDialog: ({ open, onSave, title }: any) =>
    open ? <button onClick={() => onSave([['Sweet', 'Brown Sugar'], ['Nutty/Cocoa', 'Nutty']])}>{`pick in ${title}`}</button> : null,
}))

// Anderson, 2026-10-30: a "1 cup riado" missed at validation had to be added
// after certification, and the cupping panel had nowhere to put it.
const draft = {
  cupping: { Body: 4.25, Flavor: 4.25, Acidity: 4.25 },
  cupProfile: 'Soft',
  cleanCup: true,
  uniformCup: true,
  cuppingComments: null,
  gradingComments: null,
  taints: [],
  faults: [],
  sensory: { notes: [] as string[][], match: null as boolean | null },
}
const profile = { id: 'prof-1', name: 'Cerrado', region: 'Cerrado Mineiro', notes: [['Sweet', 'Brown Sugar']], description: null, origin: null, is_active: true }

function renderPanel(props: Partial<React.ComponentProps<typeof CuppingEditPanel>> = {}) {
  const onApply = vi.fn()
  render(
    <CuppingEditPanel
      open
      draft={draft}
      isCVA={false}
      defectNames={['Hard (riado)', 'Fermented']}
      taintRules={{ max_taints: 0 }}
      onCancel={() => {}}
      onApply={onApply}
      {...props}
    />,
  )
  return onApply
}

describe('CuppingEditPanel taints and faults', () => {
  it('adds a taint with its cups and intensity', async () => {
    const user = userEvent.setup()
    const onApply = renderPanel()
    await user.click(screen.getByRole('button', { name: 'Add taint' }))
    await user.type(screen.getByLabelText('Taint 1 name'), 'Hard (riado)')
    await user.type(screen.getByLabelText('Taint 1 cups'), '1')
    await user.type(screen.getByLabelText('Taint 1 intensity'), '2')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ taints: [{ name: 'Hard (riado)', cups: 1, intensity: 2 }], faults: [] }),
    )
  })

  it('warns when the taint breaks the quality, without blocking the save', async () => {
    const user = userEvent.setup()
    const onApply = renderPanel()
    await user.click(screen.getByRole('button', { name: 'Add taint' }))
    await user.type(screen.getByLabelText('Taint 1 name'), 'Hard (riado)')
    expect(screen.getByText(/This quality allows at most 0 taints; this lot now has 1\./)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onApply).toHaveBeenCalled()
  })

  it('removes a taint the panel had found', async () => {
    const user = userEvent.setup()
    const onApply = renderPanel({ draft: { ...draft, taints: [{ name: 'Fermented', cups: 2, intensity: 1 }] } })
    await user.click(screen.getByRole('button', { name: 'Remove taint Fermented' }))
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ taints: [] }))
  })

  it('saving without touching the list hands back the very same list, so nothing is rewritten', async () => {
    const user = userEvent.setup()
    const taints = [{ name: 'Fermented', intensity: 1, cups: 2 }]
    const onApply = renderPanel({ draft: { ...draft, taints } })
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(JSON.stringify(onApply.mock.calls[0][0].taints)).toBe(JSON.stringify(taints))
  })

  it("suggests the quality's taint names", () => {
    renderPanel()
    const options = Array.from(document.querySelectorAll('datalist option')).map((o) => o.getAttribute('value'))
    expect(options).toEqual(['Hard (riado)', 'Fermented'])
  })

  it('a specialty (CVA) lot has no taint editor: its certificate prints none', () => {
    renderPanel({ isCVA: true })
    expect(screen.queryByRole('button', { name: 'Add taint' })).toBeNull()
  })
})

describe('CuppingQuadrant', () => {
  it('shows the taints the way the certificate prints them', () => {
    render(<CuppingQuadrant draft={{ ...draft, taints: [{ name: 'Hard (riado)', cups: 1, intensity: 2 }] }} isCVA={false} readOnly />)
    expect(screen.getByText('Hard (riado) · 1 cup · int. 2')).toBeInTheDocument()
  })
})

describe('CuppingEditPanel sensory block', () => {
  it('is hidden when the quality has neither notes nor a profile', () => {
    renderPanel({ sensoryConfig: { notesEnabled: false, profile: null, profileConfigured: false } })
    expect(screen.queryByText('Sensory notes')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit notes' })).toBeNull()
  })

  it('is hidden for a specialty (CVA) lot', () => {
    renderPanel({ isCVA: true, sensoryConfig: { notesEnabled: true, profile, profileConfigured: true } })
    expect(screen.queryByRole('button', { name: 'Edit notes' })).toBeNull()
  })

  it('shows the notes as words and applies new ones picked on the wheel', async () => {
    const user = userEvent.setup()
    const onApply = renderPanel({
      draft: { ...draft, sensory: { notes: [['Sweet', 'Brown Sugar']], match: null } },
      sensoryConfig: { notesEnabled: true, profile: null, profileConfigured: false },
    })
    expect(screen.getByText('Brown Sugar')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit notes' }))
    await user.click(screen.getByRole('button', { name: /pick in/ }))
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ sensory: { notes: [['Sweet', 'Brown Sugar'], ['Nutty/Cocoa', 'Nutty']], match: null } }),
    )
  })

  it('shows the profile and records the Yes/No answer; unanswered stays null', async () => {
    const user = userEvent.setup()
    const onApply = renderPanel({ sensoryConfig: { notesEnabled: false, profile, profileConfigured: true } })
    expect(screen.getByText('Cerrado')).toBeInTheDocument()
    expect(screen.getByText('Brown Sugar')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit notes' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onApply).toHaveBeenLastCalledWith(expect.objectContaining({ sensory: { notes: [], match: null } }))
    await user.click(screen.getByRole('button', { name: 'Yes' }))
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onApply).toHaveBeenLastCalledWith(expect.objectContaining({ sensory: { notes: [], match: true } }))
  })

  it('a profile that could not be read offers no answer', () => {
    renderPanel({ sensoryConfig: { notesEnabled: true, profile: null, profileConfigured: true } })
    expect(screen.getByText('The regional profile could not be loaded.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Yes' })).toBeNull()
  })
})

describe('CuppingQuadrant sensory lines', () => {
  it('prints the notes and the profile answer', () => {
    render(
      <CuppingQuadrant
        draft={{ ...draft, sensory: { notes: [['Sweet', 'Brown Sugar'], ['Nutty/Cocoa', 'Nutty']], match: false } }}
        isCVA={false}
        sensoryConfig={{ notesEnabled: true, profile, profileConfigured: true }}
        readOnly
      />,
    )
    expect(screen.getByText('Notes: Brown Sugar, Nutty')).toBeInTheDocument()
    expect(screen.getByText('Regional profile: Cerrado — Does not match')).toBeInTheDocument()
  })

  it('shows nothing extra without sensory data', () => {
    render(<CuppingQuadrant draft={draft} isCVA={false} sensoryConfig={{ notesEnabled: true, profile, profileConfigured: true }} readOnly />)
    expect(screen.queryByText(/^Notes:/)).toBeNull()
    expect(screen.queryByText(/^Regional profile:/)).toBeNull()
  })

  const storedResult = (over: Record<string, unknown> = {}) => ({
    version: 1 as const,
    notes: [['Sweet', 'Brown Sugar']],
    profile: { id: 'prof-1', name: 'Cerrado (as answered)', region: 'Cerrado Mineiro', notes: [], description: null, match: true },
    resolved_by: 'v1',
    resolved_at: '2026-11-13T10:00:00Z',
    source: 'validation' as const,
    ...over,
  })
  const storedDraft = { ...draft, sensory: { notes: [['Sweet', 'Brown Sugar']], match: true as boolean | null } }

  it('a stored result still shows, read-only, after the quality switched both settings off', () => {
    render(
      <CuppingQuadrant
        draft={storedDraft}
        isCVA={false}
        sensoryConfig={{ notesEnabled: false, profile: null, profileConfigured: false }}
        storedSensory={storedResult()}
        readOnly
      />,
    )
    expect(screen.getByText('Notes: Brown Sugar')).toBeInTheDocument()
    expect(screen.getByText('Regional profile: Cerrado (as answered) — Matches')).toBeInTheDocument()
  })

  it('names the profile as it was answered (the snapshot), not the live row', () => {
    render(
      <CuppingQuadrant
        draft={storedDraft}
        isCVA={false}
        sensoryConfig={{ notesEnabled: true, profile: { ...profile, name: 'Cerrado renamed' }, profileConfigured: true }}
        storedSensory={storedResult()}
        readOnly
      />,
    )
    expect(screen.getByText('Regional profile: Cerrado (as answered) — Matches')).toBeInTheDocument()
  })

  it('a newly configured profile, answered in the editor, uses its live name', () => {
    render(
      <CuppingQuadrant
        draft={{ ...storedDraft, sensory: { notes: [], match: false } }}
        isCVA={false}
        sensoryConfig={{ notesEnabled: false, profile: { ...profile, id: 'prof-2', name: 'Mogiana' }, profileConfigured: true }}
        storedSensory={storedResult()}
        readOnly
      />,
    )
    expect(screen.getByText('Regional profile: Mogiana — Does not match')).toBeInTheDocument()
  })

  it('a stored result on a specialty (CVA) lot shows nothing', () => {
    render(<CuppingQuadrant draft={storedDraft} isCVA sensoryConfig={undefined} storedSensory={storedResult()} readOnly />)
    expect(screen.queryByText(/^Notes:/)).toBeNull()
    expect(screen.queryByText(/^Regional profile:/)).toBeNull()
  })
})
