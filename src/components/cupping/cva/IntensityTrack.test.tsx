import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { IntensityTrack } from './IntensityTrack'

describe('IntensityTrack', () => {
  it('renders sixteen cells (0–15) and the zone labels', () => {
    render(<IntensityTrack value={0} accent="#556b2f" onChange={() => {}} />)
    expect(screen.getAllByRole('button', { name: /intensity \d+$/i })).toHaveLength(16)
    expect(screen.getByText('LOW')).toBeTruthy()
    expect(screen.getByText('MEDIUM')).toBeTruthy()
    expect(screen.getByText('HIGH')).toBeTruthy()
  })

  it('tapping a cell reports its value', () => {
    const onChange = vi.fn()
    render(<IntensityTrack value={0} accent="#556b2f" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /intensity 11$/i }))
    expect(onChange).toHaveBeenCalledWith(11)
  })

  it('numeric field is two-way synced and clamps to 0–15', () => {
    const onChange = vi.fn()
    render(<IntensityTrack value={7} accent="#556b2f" onChange={onChange} />)
    const input = screen.getByLabelText(/intensity value/i) as HTMLInputElement
    expect(input.value).toBe('7')
    fireEvent.change(input, { target: { value: '15' } })
    expect(onChange).toHaveBeenCalledWith(15)
    fireEvent.change(input, { target: { value: '22' } })   // clamped
    expect(onChange).toHaveBeenCalledWith(15)
  })
})
