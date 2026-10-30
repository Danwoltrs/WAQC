import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CuppingEditPanel, CuppingQuadrant } from './cupping-quadrant'

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
}

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
    await user.click(screen.getByRole('button', { name: 'Save' }))
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
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onApply).toHaveBeenCalled()
  })

  it('removes a taint the panel had found', async () => {
    const user = userEvent.setup()
    const onApply = renderPanel({ draft: { ...draft, taints: [{ name: 'Fermented', cups: 2, intensity: 1 }] } })
    await user.click(screen.getByRole('button', { name: 'Remove taint Fermented' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ taints: [] }))
  })

  it('saving without touching the list hands back the very same list, so nothing is rewritten', async () => {
    const user = userEvent.setup()
    const taints = [{ name: 'Fermented', intensity: 1, cups: 2 }]
    const onApply = renderPanel({ draft: { ...draft, taints } })
    await user.click(screen.getByRole('button', { name: 'Save' }))
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
