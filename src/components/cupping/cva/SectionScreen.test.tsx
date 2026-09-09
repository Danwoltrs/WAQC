import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SectionScreen } from './SectionScreen'
import { CVA_SECTIONS } from '@/lib/cva/sections'

const fragrance = CVA_SECTIONS[0]

describe('SectionScreen descriptive block', () => {
  it('renders the intensity track when a handler is provided and reports taps', () => {
    const onIntensityChange = vi.fn()
    render(
      <SectionScreen
        section={fragrance} index={1} total={8}
        value={undefined} onChange={() => {}}
        intensity={0} onIntensityChange={onIntensityChange}
      />,
    )
    expect(screen.getByTestId('intensity-track')).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('slider', { name: /intensity/i }), { key: 'End' })   // the track is a slider now (decision 1)
    expect(onIntensityChange).toHaveBeenCalledWith(15)
  })

  it('renders no intensity track without a handler (Overall)', () => {
    render(<SectionScreen section={CVA_SECTIONS[7]} index={8} total={8} value={undefined} onChange={() => {}} />)
    expect(screen.queryByTestId('intensity-track')).toBeNull()
  })

  it('renders the injected descriptor slot and keeps the affective note textarea', () => {
    render(
      <SectionScreen
        section={fragrance} index={1} total={8}
        value={{ note: 'clean cup' }} onChange={() => {}}
        descriptorSlot={<button type="button">Describe aromas</button>}
      />,
    )
    expect(screen.getByRole('button', { name: /describe aromas/i })).toBeTruthy()
    expect((screen.getByPlaceholderText(/affective note/i) as HTMLTextAreaElement).value).toBe('clean cup')
  })
})

describe('SectionScreen — one Cooled toggle arms BOTH scales (locked decision 5)', () => {
  const section = { key: 'fragrance', label: 'Fragrance', accent: '#a9a454', hint: '' } as never
  const setup = () => {
    const onChange = vi.fn(), onIntensityChange = vi.fn(), onIntensityFinalChange = vi.fn()
    render(
      <SectionScreen
        section={section} index={1} total={8}
        value={{ impression: 6 }} onChange={onChange}
        intensity={8} onIntensityChange={onIntensityChange}
        intensityFinal={undefined} onIntensityFinalChange={onIntensityFinalChange}
      />,
    )
    return { onChange, onIntensityChange, onIntensityFinalChange }
  }

  it('arming Cooled on the impression row makes the NEXT intensity change a second mark', () => {
    const { onIntensityChange, onIntensityFinalChange } = setup()
    fireEvent.click(screen.getByLabelText(/changed as it cooled/i))
    fireEvent.keyDown(screen.getByRole('slider', { name: /intensity/i }), { key: 'ArrowRight' })
    expect(onIntensityFinalChange).toHaveBeenLastCalledWith(9)
    expect(onIntensityChange).not.toHaveBeenCalled()
  })

  it('disarming clears both second marks, and leaves the originals alone', () => {
    const { onChange, onIntensityFinalChange } = setup()
    const toggle = screen.getByLabelText(/changed as it cooled/i)
    fireEvent.click(toggle)
    fireEvent.click(toggle)
    expect(onIntensityFinalChange).toHaveBeenLastCalledWith(undefined)
    expect(onChange).toHaveBeenLastCalledWith({ impression_final: undefined })
  })

  it('a section that never had an intensity track still cools its impression', () => {
    const onChange = vi.fn()
    render(<SectionScreen section={{ key: 'overall', label: 'Overall', accent: '#6d6f54', hint: '' } as never} index={8} total={8} value={{ impression: 6 }} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText(/changed as it cooled/i))
    fireEvent.click(screen.getByRole('button', { name: /impression 8/i }))
    expect(onChange).toHaveBeenLastCalledWith({ impression_final: 8 })
  })
})
