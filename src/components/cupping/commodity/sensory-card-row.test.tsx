import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/components/sensory/sensory-wheel-dialog', () => ({
  SensoryWheelDialog: ({ open, onSave, title }: { open: boolean; onSave: (p: string[][]) => void; title: string }) =>
    open ? (
      <div data-testid="dialog">
        {title}
        <button onClick={() => onSave([['Sweet', 'Brown Sugar']])}>save-picks</button>
      </div>
    ) : null,
}))

import { SensoryCardRow } from './sensory-card-row'

const profile = { id: 'p1', name: 'Cerrado', origin: 'Brazil', region: null, notes: [['Sweet', 'Brown Sugar'], ['Fruity', 'Berry']], description: null, is_active: true }

describe('SensoryCardRow', () => {
  it('renders nothing when both settings are off', () => {
    const { container } = render(<SensoryCardRow config={{ notesEnabled: false, profile: null }} value={null} onChange={() => {}} />)
    expect(container.textContent).toBe('')
  })

  it('shows Add notes, then the picked terms', () => {
    const { rerender } = render(<SensoryCardRow config={{ notesEnabled: true, profile: null }} value={null} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /Add notes/ })).toBeTruthy()
    rerender(<SensoryCardRow config={{ notesEnabled: true, profile: null }} value={{ picks: [['Sweet', 'Brown Sugar']], profile_id: null, profile_match: null }} onChange={() => {}} />)
    expect(screen.getByText('Brown Sugar')).toBeTruthy()
  })

  it('emits picks saved from the dialog', () => {
    const onChange = vi.fn()
    render(<SensoryCardRow config={{ notesEnabled: true, profile }} value={null} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Add notes/ }))
    fireEvent.click(screen.getByText('save-picks'))
    expect(onChange).toHaveBeenCalledWith({ picks: [['Sweet', 'Brown Sugar']], profile_id: 'p1', profile_match: null })
  })

  it('shows the profile with notes as words and a Yes / No control, unanswered by default', () => {
    render(<SensoryCardRow config={{ notesEnabled: false, profile }} value={null} onChange={() => {}} />)
    expect(screen.getByText(/Cerrado/)).toBeTruthy()
    expect(screen.getByText(/Brown Sugar, Berry/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Yes' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'No' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('answers Yes, and tapping the selected one clears it', () => {
    const onChange = vi.fn()
    const { rerender } = render(<SensoryCardRow config={{ notesEnabled: false, profile }} value={null} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(onChange).toHaveBeenLastCalledWith({ picks: [], profile_id: 'p1', profile_match: true })
    rerender(<SensoryCardRow config={{ notesEnabled: false, profile }} value={{ picks: [], profile_id: 'p1', profile_match: true }} onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Yes' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(onChange).toHaveBeenLastCalledWith({ picks: [], profile_id: 'p1', profile_match: null })
  })

  it('disables the controls', () => {
    render(<SensoryCardRow config={{ notesEnabled: true, profile }} value={null} onChange={() => {}} disabled />)
    expect((screen.getByRole('button', { name: 'No' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
