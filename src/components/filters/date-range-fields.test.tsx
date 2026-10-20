import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DateRangeFields } from './date-range-fields'

const setup = (over: Partial<React.ComponentProps<typeof DateRangeFields>> = {}) => {
  const props = { from: '', to: '', onFromChange: vi.fn(), onToChange: vi.fn(), ...over }
  render(<DateRangeFields {...props} />)
  return props
}

describe('DateRangeFields', () => {
  it('labels From and To and keeps both inputs in one row', () => {
    setup()
    const from = screen.getByLabelText('From')
    const to = screen.getByLabelText('To')
    expect(from).toHaveAttribute('type', 'date')
    expect(to).toHaveAttribute('type', 'date')
    const row = from.closest('[data-testid="date-range-row"]')
    expect(row).not.toBeNull()
    expect(row).toContainElement(to)
  })

  it('reports typed dates', () => {
    const p = setup()
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-19' } })
    expect(p.onFromChange).toHaveBeenCalledWith('2026-10-01')
    expect(p.onToChange).toHaveBeenCalledWith('2026-10-19')
  })

  it('renders presets and fires them', () => {
    const onSelect = vi.fn()
    setup({ presets: [{ label: 'Today', onSelect }] })
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('shows no preset buttons without presets', () => {
    setup()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('limits each date by the other so the range cannot invert', () => {
    setup({ from: '2026-10-01', to: '2026-10-19' })
    expect(screen.getByLabelText('To')).toHaveAttribute('min', '2026-10-01')
    expect(screen.getByLabelText('From')).toHaveAttribute('max', '2026-10-19')
  })

  it('sets no min or max while the other date is empty', () => {
    setup()
    expect(screen.getByLabelText('To')).not.toHaveAttribute('min')
    expect(screen.getByLabelText('From')).not.toHaveAttribute('max')
  })
})
