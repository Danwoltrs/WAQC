import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImpressionScale } from './ImpressionScale'

describe('ImpressionScale', () => {
  it('renders nine impression blocks', () => {
    render(<ImpressionScale accent="#556b2f" onChange={() => {}} onChangeFinal={() => {}} />)
    expect(screen.getAllByRole('button', { name: /impression [1-9]/i })).toHaveLength(9)
  })

  it('click selects an initial value', () => {
    const onChange = vi.fn()
    render(<ImpressionScale accent="#556b2f" onChange={onChange} onChangeFinal={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /impression 7/i }))
    expect(onChange).toHaveBeenCalledWith(7)
  })

  it('numeric field is two-way synced', () => {
    const onChange = vi.fn()
    render(<ImpressionScale value={5} accent="#556b2f" onChange={onChange} onChangeFinal={() => {}} />)
    const input = screen.getByLabelText(/impression value/i) as HTMLInputElement
    expect(input.value).toBe('5')
    fireEvent.change(input, { target: { value: '8' } })
    expect(onChange).toHaveBeenCalledWith(8)
  })

  it('keys 1-9 set the value', () => {
    const onChange = vi.fn()
    render(<ImpressionScale accent="#556b2f" onChange={onChange} onChangeFinal={() => {}} />)
    fireEvent.keyDown(screen.getByTestId('impression-scale'), { key: '9' })
    expect(onChange).toHaveBeenCalledWith(9)
  })

  it('cooling toggle routes a click to the final value', () => {
    const onChangeFinal = vi.fn()
    render(<ImpressionScale value={6} accent="#556b2f" onChange={() => {}} onChangeFinal={onChangeFinal} />)
    fireEvent.click(screen.getByLabelText(/changed as it cooled/i))
    fireEvent.click(screen.getByRole('button', { name: /impression 8/i }))
    expect(onChangeFinal).toHaveBeenCalledWith(8)
  })
})

describe('ImpressionScale — cooling controlled by the section (locked decision 5: ONE Cooled toggle per section)', () => {
  it('when the section owns cooling, a click routes to the final without touching the internal toggle', () => {
    const onChange = vi.fn(), onChangeFinal = vi.fn()
    render(<ImpressionScale value={6} accent="#556b2f" onChange={onChange} onChangeFinal={onChangeFinal} cooling onCoolingChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /impression 8/i }))
    expect(onChangeFinal).toHaveBeenCalledWith(8)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('its toggle reports the change upward instead of flipping itself', () => {
    const onCoolingChange = vi.fn(), onChangeFinal = vi.fn()
    render(<ImpressionScale value={6} accent="#556b2f" onChange={() => {}} onChangeFinal={onChangeFinal} cooling={false} onCoolingChange={onCoolingChange} />)
    fireEvent.click(screen.getByLabelText(/changed as it cooled/i))
    expect(onCoolingChange).toHaveBeenCalledWith(true)
    // still uncontrolled-off from the scale's point of view: a click is an initial
    fireEvent.click(screen.getByRole('button', { name: /impression 8/i }))
    expect(onChangeFinal).not.toHaveBeenCalled()
  })
})
