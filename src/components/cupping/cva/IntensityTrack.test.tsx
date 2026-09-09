import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { IntensityTrack } from './IntensityTrack'

// jsdom lays nothing out, so the track is given a real box: 328 px wide, the
// rail inset 14 px each side (see TRACK_INSET). Value v sits at 14 + 300·v/15.
const WIDTH = 328
const xFor = (v: number) => 14 + (WIDTH - 28) * (v / 15)
const track = () => screen.getByRole('slider', { name: /intensity/i })
const layOut = (el: Element) =>
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: WIDTH, height: 56, right: WIDTH, bottom: 56, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
// Dispatched by hand: RTL's pointer helpers need a PointerEvent constructor jsdom
// may not have, and a bare Event carries no clientX. React listens by type.
const pointer = (el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', clientX: number) => {
  const Ctor = (window as unknown as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent
  fireEvent(el, new Ctor(type, { bubbles: true, cancelable: true, clientX, clientY: 28, ...({ pointerId: 1, isPrimary: true } as object) }))
}

describe('IntensityTrack — a continuous 0–15 track, tap or drag, nearest integer recorded (SCA-103 §6.2)', () => {
  it('is one slider with the form\'s sixteen ticks and zone labels — not sixteen buttons', () => {
    render(<IntensityTrack value={0} accent="#556b2f" onChange={() => {}} />)
    const t = track()
    expect(t.getAttribute('aria-valuemin')).toBe('0')
    expect(t.getAttribute('aria-valuemax')).toBe('15')
    expect(t.getAttribute('aria-valuenow')).toBe('0')
    expect(screen.getAllByTestId('intensity-tick')).toHaveLength(16)
    expect(screen.queryByRole('button', { name: /intensity \d+$/i })).toBeNull()
    for (const z of ['LOW', 'MEDIUM', 'HIGH']) expect(screen.getByText(z)).toBeTruthy()
  })

  it('a tap anywhere records the nearest integer', () => {
    // "Tasters may place a tick anywhere along the intensity scale, even in
    // between integer numbers; however, the integer number closest to the
    // tick shall be recorded."
    const onChange = vi.fn()
    render(<IntensityTrack value={0} accent="#556b2f" onChange={onChange} />)
    const t = track(); layOut(t)
    pointer(t, 'pointerdown', xFor(9) + 4)    // a hair past 9, well short of 10
    expect(onChange).toHaveBeenLastCalledWith(9)
  })

  it('a drag refines the tap, and only the position it is released at matters', () => {
    const onChange = vi.fn()
    render(<IntensityTrack value={0} accent="#556b2f" onChange={onChange} />)
    const t = track(); layOut(t)
    pointer(t, 'pointerdown', xFor(9))
    pointer(t, 'pointermove', xFor(7))
    pointer(t, 'pointermove', xFor(3))
    pointer(t, 'pointerup', xFor(3))
    expect(onChange).toHaveBeenLastCalledWith(3)
    // moving without a press is not a drag
    pointer(t, 'pointermove', xFor(12))
    expect(onChange).toHaveBeenLastCalledWith(3)
  })

  it('never leaves the scale: presses past either end clamp to 0 and 15', () => {
    const onChange = vi.fn()
    render(<IntensityTrack value={5} accent="#556b2f" onChange={onChange} />)
    const t = track(); layOut(t)
    pointer(t, 'pointerdown', -40); expect(onChange).toHaveBeenLastCalledWith(0)
    pointer(t, 'pointerup', -40)
    pointer(t, 'pointerdown', WIDTH + 40); expect(onChange).toHaveBeenLastCalledWith(15)
  })

  it('arrow keys step by one, Home and End jump to the ends', () => {
    const onChange = vi.fn()
    render(<IntensityTrack value={7} accent="#556b2f" onChange={onChange} />)
    fireEvent.keyDown(track(), { key: 'ArrowRight' }); expect(onChange).toHaveBeenLastCalledWith(8)
    fireEvent.keyDown(track(), { key: 'ArrowLeft' }); expect(onChange).toHaveBeenLastCalledWith(6)
    fireEvent.keyDown(track(), { key: 'End' }); expect(onChange).toHaveBeenLastCalledWith(15)
    fireEvent.keyDown(track(), { key: 'Home' }); expect(onChange).toHaveBeenLastCalledWith(0)
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

  describe('cooled: a second mark on the same track (§6.2 — the original tick is not erased)', () => {
    it('while cooling is armed a tap places the SECOND mark and leaves the original where it was', () => {
      const onChange = vi.fn(), onChangeFinal = vi.fn()
      render(<IntensityTrack value={8} accent="#556b2f" onChange={onChange} cooling finalValue={undefined} onChangeFinal={onChangeFinal} />)
      const t = track(); layOut(t)
      pointer(t, 'pointerdown', xFor(11))
      expect(onChangeFinal).toHaveBeenLastCalledWith(11)
      expect(onChange).not.toHaveBeenCalled()
    })

    it('shows the original as a dashed mark, the final on the thumb, and the shift with its direction', () => {
      render(<IntensityTrack value={8} accent="#556b2f" onChange={() => {}} cooling finalValue={11} onChangeFinal={() => {}} />)
      expect(screen.getByTestId('intensity-initial')).toBeTruthy()
      expect(track().getAttribute('aria-valuenow')).toBe('11')
      expect(screen.getByTestId('intensity-shift')).toHaveTextContent('8 → 11')
      expect(screen.getByTestId('intensity-shift')).toHaveAccessibleName(/rose as it cooled/i)
    })

    it('a second mark equal to the first is no shift', () => {
      render(<IntensityTrack value={8} accent="#556b2f" onChange={() => {}} cooling finalValue={8} onChangeFinal={() => {}} />)
      expect(screen.queryByTestId('intensity-shift')).toBeNull()
      expect(screen.queryByTestId('intensity-initial')).toBeNull()
    })

    it('with nothing rated yet, cooling still records the ORIGINAL — there is no second mark without a first', () => {
      const onChange = vi.fn(), onChangeFinal = vi.fn()
      render(<IntensityTrack value={0} accent="#556b2f" onChange={onChange} cooling onChangeFinal={onChangeFinal} />)
      const t = track(); layOut(t)
      pointer(t, 'pointerdown', xFor(6))
      expect(onChange).toHaveBeenLastCalledWith(6)
      expect(onChangeFinal).not.toHaveBeenCalled()
    })
  })
})
