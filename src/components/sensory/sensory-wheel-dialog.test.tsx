import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/components/cupping/cva/wheel/FlavorWheel', () => ({
  zoomOutLabel: (f: string | null) => (f ? `Zoom out of ${f}` : 'Zoom out to the whole wheel'),
  FlavorWheel: ({ onToggle, refusals, onFrameChange, zoomOutRequests, chrome }: { onToggle: (p: { path: string[] }) => void; refusals?: number; onFrameChange?: (f: { family: string | null; zoomed: boolean }) => void; zoomOutRequests?: number; chrome?: string }) => (
    <div data-testid="wheel" data-refusals={refusals ?? 0} data-zoomout={zoomOutRequests ?? 0} data-chrome={chrome}>
      <button onClick={() => onFrameChange?.({ family: 'Sweet', zoomed: true })}>frame-sweet</button>
      <button onClick={() => onToggle({ path: ['Nutty/Cocoa', 'Cocoa', 'Chocolate'] })}>pick-choc</button>
      <button onClick={() => onToggle({ path: ['Sweet', 'Brown Sugar'] })}>pick-sugar</button>
      <button onClick={() => onToggle({ path: ['Fruity', 'Berry'] })}>pick-berry</button>
    </div>
  ),
}))

import { SensoryWheelDialog } from './sensory-wheel-dialog'

const setup = (over: Partial<React.ComponentProps<typeof SensoryWheelDialog>> = {}) => {
  const onSave = vi.fn()
  const onOpenChange = vi.fn()
  render(<SensoryWheelDialog open onOpenChange={onOpenChange} title="Profile" value={[]} cap={2} onSave={onSave} {...over} />)
  return { onSave, onOpenChange }
}

describe('SensoryWheelDialog', () => {
  it('adds and removes a chip by toggling, showing the leaf term and count', () => {
    setup()
    expect(screen.getByText('0 of 2')).toBeTruthy()
    fireEvent.click(screen.getByText('pick-choc'))
    expect(screen.getByText('Chocolate')).toBeTruthy()
    expect(screen.getByText('1 of 2')).toBeTruthy()
    fireEvent.click(screen.getByText('pick-choc'))
    expect(screen.queryByText('Chocolate')).toBeNull()
  })

  it('refuses beyond the cap and bumps refusals', () => {
    setup()
    fireEvent.click(screen.getByText('pick-choc'))
    fireEvent.click(screen.getByText('pick-sugar'))
    expect(screen.getByTestId('wheel').getAttribute('data-refusals')).toBe('0')
    fireEvent.click(screen.getByText('pick-berry'))
    expect(screen.queryByText('Berry')).toBeNull()
    expect(screen.getByText('2 of 2')).toBeTruthy()
    expect(screen.getByTestId('wheel').getAttribute('data-refusals')).toBe('1')
  })

  it('chip x removes the pick', () => {
    setup({ value: [['Sweet', 'Brown Sugar']] })
    fireEvent.click(screen.getByLabelText('Remove Brown Sugar'))
    expect(screen.queryByText('Brown Sugar')).toBeNull()
  })

  it('Save passes the working list and closes', () => {
    const { onSave, onOpenChange } = setup()
    fireEvent.click(screen.getByText('pick-choc'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith([['Nutty/Cocoa', 'Cocoa', 'Chocolate']])
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('Cancel discards', () => {
    const { onSave, onOpenChange } = setup()
    fireEvent.click(screen.getByText('pick-choc'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('readOnly hides Save, ignores toggles and chip removal', () => {
    setup({ readOnly: true, value: [['Sweet', 'Brown Sugar']] })
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Close' }).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByText('pick-choc'))
    expect(screen.queryByText('Chocolate')).toBeNull()
    expect(screen.queryByLabelText('Remove Brown Sugar')).toBeNull()
    expect(screen.getByText('Brown Sugar')).toBeTruthy()
  })

  it('external chrome: a host zoom-out button appears once zoomed and bumps zoomOutRequests', () => {
    setup()
    expect(screen.getByTestId('wheel').getAttribute('data-chrome')).toBe('external')
    expect(screen.queryByLabelText('Zoom out of Sweet')).toBeNull()
    fireEvent.click(screen.getByText('frame-sweet'))
    fireEvent.click(screen.getByLabelText('Zoom out of Sweet'))
    expect(screen.getByTestId('wheel').getAttribute('data-zoomout')).toBe('1')
  })
})
