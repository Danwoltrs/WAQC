import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhysicalEditPanel, PhysicalQuadrant } from './physical-quadrant'

// A type sample whose quality configures roast levels must open showing the
// level that is saved, chosen from that quality's own list.
const spec = {
  roast_aspect_configuration: {
    wordings: [
      { id: 'a', label: 'Good', value: 4, display_order: 0 },
      { id: 'b', label: 'Good to Fine', value: 7, display_order: 1 },
      { id: 'c', label: 'Fine', value: 10, display_order: 2 },
    ],
  },
}

const draft = { moisture: 11.2, density: 0.7, greenAspect: 'Greenish', roastAspect: 'Good to Fine', quakers: 2 }

function renderPanel(props: Partial<React.ComponentProps<typeof PhysicalEditPanel>> = {}) {
  const onApply = vi.fn()
  render(<PhysicalEditPanel open draft={draft} specParameters={spec} onCancel={() => {}} onApply={onApply} {...props} />)
  return onApply
}

describe('PhysicalEditPanel aspects', () => {
  it('opens showing the saved green and roast aspect', () => {
    renderPanel()
    expect(screen.getByRole('combobox', { name: 'Roast aspect' })).toHaveTextContent('Good to Fine')
    expect(screen.getByRole('combobox', { name: 'Green aspect' })).toHaveTextContent('Greenish')
  })

  it('shows a saved value that is on no list instead of an empty field', () => {
    renderPanel({ draft: { ...draft, roastAspect: 'Medium Dark' } })
    expect(screen.getByRole('combobox', { name: 'Roast aspect' })).toHaveTextContent('Medium Dark')
  })

  it('saves the aspects unchanged when nothing is touched', async () => {
    const user = userEvent.setup()
    const onApply = renderPanel()
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onApply).toHaveBeenCalledWith({
      moisture: 11.2, density: 0.7, greenAspect: 'Greenish', roastAspect: 'Good to Fine', quakers: 2,
    })
  })

  it('reads an unset aspect as not set and saves it as empty', async () => {
    const user = userEvent.setup()
    const onApply = renderPanel({ draft: { ...draft, roastAspect: null } })
    expect(screen.getByRole('combobox', { name: 'Roast aspect' })).toHaveTextContent('Not set')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onApply.mock.calls[0][0].roastAspect).toBeNull()
  })
})

describe('PhysicalQuadrant', () => {
  it('shows the roast aspect next to the green aspect', () => {
    render(<PhysicalQuadrant draft={draft} />)
    expect(screen.getByText('Roast aspect')).toBeInTheDocument()
    expect(screen.getByText('Good to Fine')).toBeInTheDocument()
  })
})
