// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { CLIENT_SECTIONS, type ClientSectionId } from '@/lib/portal/portal-qualities'
import { sectionTitle } from '@/components/quality/spec-editor/spec-editor-body'
import { SpecSectionsView } from './spec-sections-view'

afterEach(cleanup)

const parameters = {
  defect_configuration: {
    defects: [{ name: 'Full Black', weight: 1, category: 'primary', display_order: 0 }],
    thresholds: { max_primary: 5, max_total: 12 },
  },
  // No ids on purpose: the lab's cupping section assigns ids through patch on mount.
  cupping_attributes: [{ attribute: 'Body', scale: { type: 'numeric', min: 1, max: 10, increment: 0.25 }, is_required: true }],
}
const sections = Object.fromEntries(CLIENT_SECTIONS.map((s) => [s, null])) as Record<ClientSectionId, { within: number; lots: number } | null>
sections.screen = { within: 18, lots: 20 }
sections.defects = { within: 0, lots: 0 }
sections.cupping = { within: 7, lots: 9 }

const view = (over: Partial<Parameters<typeof SpecSectionsView>[0]> = {}) => {
  const props = { parameters, sections, active: 'defects' as ClientSectionId, onSelect: vi.fn(), editing: false, onPatch: vi.fn(), ...over }
  render(<SpecSectionsView {...props} />)
  return props
}

describe('SpecSectionsView', () => {
  it('lists the eight client sections in order, titled like the lab editor', () => {
    view()
    const nav = screen.getByRole('navigation', { name: 'Sections' })
    const items = within(nav).getAllByRole('button')
    expect(items).toHaveLength(8)
    CLIENT_SECTIONS.forEach((id, i) => expect(items[i]).toHaveTextContent(sectionTitle(id)))
  })

  it('shows lots-within counts, and none where the count is null or there are no lots', () => {
    view()
    const nav = screen.getByRole('navigation', { name: 'Sections' })
    const item = (id: ClientSectionId) => within(nav).getByText(sectionTitle(id)).closest('button')!
    expect(item('screen')).toHaveTextContent('18 of 20 lots within')
    expect(item('cupping')).toHaveTextContent('7 of 9 lots within')
    expect(item('defects')).not.toHaveTextContent('lots within')
    expect(item('green')).not.toHaveTextContent('lots within')
    expect(within(nav).getAllByText(/lots within/)).toHaveLength(2)
  })

  it('shows no counts when sections is null', () => {
    view({ sections: null })
    expect(screen.queryByText(/lots within/)).toBeNull()
  })

  it('marks the active section and selects another on click', () => {
    const { onSelect } = view()
    const nav = screen.getByRole('navigation', { name: 'Sections' })
    expect(within(nav).getByText('Defects').closest('button')).toHaveAttribute('aria-current', 'true')
    fireEvent.click(within(nav).getByText('Screen sizes'))
    expect(onSelect).toHaveBeenCalledWith('screen')
  })

  it('renders the active lab section read-only inside a disabled fieldset', () => {
    const { onPatch } = view()
    const fieldset = screen.getByTestId('spec-section-panel')
    expect(fieldset.tagName).toBe('FIELDSET')
    expect(fieldset).toBeDisabled()
    const inputs = within(fieldset).getAllByRole('spinbutton')
    expect(inputs.length).toBeGreaterThan(0)
    inputs.forEach((el) => expect(el).toBeDisabled())
    const buttons = within(fieldset).getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
    buttons.forEach((el) => expect(el).toBeDisabled())
    expect(inputs[0]).toHaveValue(5) // Primary max
    fireEvent.change(inputs[0], { target: { value: '9' } })
    expect(onPatch).not.toHaveBeenCalled()
  })

  it('never patches in read mode, even when a section patches on mount', () => {
    const { onPatch } = view({ active: 'cupping' })
    expect(screen.getByDisplayValue('Body')).toBeDisabled()
    expect(onPatch).not.toHaveBeenCalled()
  })

  it('edits through onPatch when editing', () => {
    const onPatch = vi.fn()
    view({ editing: true, onPatch })
    expect(screen.getByTestId('spec-section-panel')).not.toBeDisabled()
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '9' } })
    expect(onPatch).toHaveBeenCalledTimes(1)
    expect(onPatch.mock.calls[0][0].defect_configuration.thresholds.max_primary).toBe(9)
  })

  it('renders what is given below the panel', () => {
    render(<SpecSectionsView parameters={parameters} sections={sections} active="screen" onSelect={vi.fn()} editing={false} onPatch={vi.fn()} below={<p>Versions here</p>} />)
    expect(screen.getByText('Versions here')).toBeInTheDocument()
  })
})
