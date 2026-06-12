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
    fireEvent.click(screen.getByRole('button', { name: /intensity 9$/i }))
    expect(onIntensityChange).toHaveBeenCalledWith(9)
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
