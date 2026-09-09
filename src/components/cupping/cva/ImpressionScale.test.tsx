import { describe, it, expect, vi, afterEach } from 'vitest'
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

// Dispatched by hand like IntensityTrack's tests: RTL's pointer helpers need a
// PointerEvent constructor jsdom may not have, and a bare Event carries no clientX.
const ROW = 288   // nine blocks across 288 px → 32 px each
const xFor = (point: number) => (point - 0.5) * (ROW / 9)
const layOut = (el: Element) =>
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: ROW, height: 92, right: ROW, bottom: 92, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
const pointer = (el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', clientX: number) => {
  const Ctor = (window as unknown as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent
  fireEvent(el, new Ctor(type, { bubbles: true, cancelable: true, clientX, clientY: 40, ...({ pointerId: 1, isPrimary: true, pointerType: 'touch' } as object) }))
}
const vib = () => {
  const fn = vi.fn(() => true)
  Object.defineProperty(navigator, 'vibrate', { value: fn, configurable: true, writable: true })
  return fn
}

describe('ImpressionScale — drag across the nine (Daniel 2026-09-09: "drag from left to right on the 1-9, with haptic feedback")', () => {
  afterEach(() => { delete (navigator as unknown as { vibrate?: unknown }).vibrate })

  it('a drag records every integer it crosses, in order, and ticks the phone once per change', () => {
    const onChange = vi.fn(), vibrate = vib()
    render(<ImpressionScale accent="#556b2f" onChange={onChange} onChangeFinal={() => {}} />)
    const row = screen.getByTestId('impression-blocks'); layOut(row)
    pointer(row, 'pointerdown', xFor(3))
    pointer(row, 'pointermove', xFor(3) + 4)     // still 3: no change, no tick
    pointer(row, 'pointermove', xFor(4))
    pointer(row, 'pointermove', xFor(6))
    pointer(row, 'pointerup', xFor(6))
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([3, 4, 6])
    expect(vibrate).toHaveBeenCalledTimes(3)
  })

  it('a drag never leaves the scale: past either end it holds 1 and 9', () => {
    const onChange = vi.fn(); vib()
    render(<ImpressionScale accent="#556b2f" onChange={onChange} onChangeFinal={() => {}} />)
    const row = screen.getByTestId('impression-blocks'); layOut(row)
    pointer(row, 'pointerdown', -30); expect(onChange).toHaveBeenLastCalledWith(1)
    pointer(row, 'pointermove', ROW + 30); expect(onChange).toHaveBeenLastCalledWith(9)
    pointer(row, 'pointerup', ROW + 30)
  })

  it('with Cooled armed the drag places the second mark, and the original is untouched', () => {
    const onChange = vi.fn(), onChangeFinal = vi.fn(); vib()
    render(<ImpressionScale value={6} accent="#556b2f" onChange={onChange} onChangeFinal={onChangeFinal} cooling onCoolingChange={() => {}} />)
    const row = screen.getByTestId('impression-blocks'); layOut(row)
    pointer(row, 'pointerdown', xFor(8)); pointer(row, 'pointerup', xFor(8))
    expect(onChangeFinal).toHaveBeenLastCalledWith(8)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('moving without a press is not a drag', () => {
    const onChange = vi.fn(); vib()
    render(<ImpressionScale accent="#556b2f" onChange={onChange} onChangeFinal={() => {}} />)
    const row = screen.getByTestId('impression-blocks'); layOut(row)
    pointer(row, 'pointermove', xFor(5))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('the readout lives in the section header now — the row itself no longer repeats "7 · Moderately High" beneath the blocks', () => {
    render(<ImpressionScale value={7} accent="#556b2f" onChange={() => {}} onChangeFinal={() => {}} />)
    expect(screen.queryByText('7 · Moderately High')).toBeNull()
    expect(screen.getByLabelText(/changed as it cooled/i)).toBeTruthy()   // the Cooled toggle stays with the row
  })
})
