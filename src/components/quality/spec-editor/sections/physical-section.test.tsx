import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhysicalSection, physicalSummary, parseDensity, densitySummary } from './physical-section'

describe('physicalSummary', () => {
  it('joins the checks that are on', () => {
    expect(physicalSummary({ moisture_min: 11, moisture_max: 12, density_min: 0.65, density_max: 0.72, max_quakers: 10 }))
      .toBe('11–12% · 0.650–0.720 g/mL · ≤10')
  })
  it('drops what is off', () => { expect(physicalSummary({ moisture_min: 11, moisture_max: 12 })).toBe('11–12%') })
  it('shows one-sided ranges', () => { expect(physicalSummary({ density_min: 0.65 })).toBe('≥0.650 g/mL') })
  it('says so when nothing is set', () => { expect(physicalSummary({})).toBe('Not measured') })
})
describe('physicalSummary guards', () => {
  it('a non-numeric density counts as unset', () => { expect(physicalSummary({ density_min: 'abc' })).toBe('Not measured') })
  it('a numeric string density is read', () => { expect(physicalSummary({ density_min: '0.65' })).toBe('≥0.650 g/mL') })
})
describe('densitySummary (quick view line)', () => {
  it('formats both, one-sided and unset', () => {
    expect(densitySummary({ density_min: 0.65, density_max: 0.72 })).toBe('0.650–0.720 g/mL')
    expect(densitySummary({ density_min: 0.65 })).toBe('≥0.650 g/mL')
    expect(densitySummary({ density_max: 0.72 })).toBe('≤0.720 g/mL')
    expect(densitySummary({})).toBe('')
  })
})
describe('parseDensity', () => {
  it('accepts a decimal comma', () => expect(parseDensity('0,680')).toEqual({ value: 0.68 }))
  it('accepts g/mL', () => expect(parseDensity('0.680')).toEqual({ value: 0.68 }))
  it('empty clears', () => expect(parseDensity('')).toEqual({}))
  it('rejects g/L', () => expect(parseDensity('680')).toEqual({ error: 'Enter g/mL, e.g. 0.680' }))
  it('rejects non-numeric and negative', () => {
    expect(parseDensity('abc')).toEqual({ error: 'Enter g/mL, e.g. 0.680' })
    expect(parseDensity('-0.5')).toEqual({ error: 'Enter g/mL, e.g. 0.680' })
  })
})
describe('PhysicalSection', () => {
  it('loads a row on when any of its limits is set, 0 included', () => {
    render(<PhysicalSection params={{ moisture_min: 0, max_quakers: 0 }} patch={vi.fn()} />)
    expect(screen.getByRole('switch', { name: 'Moisture' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Quakers' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Density' })).not.toBeChecked()
  })
  it('switching density off clears both keys', async () => {
    const patch = vi.fn(); render(<PhysicalSection params={{ density_min: 0.65, density_max: 0.72 }} patch={patch} />)
    await userEvent.click(screen.getByRole('switch', { name: 'Density' }))
    expect(patch).toHaveBeenCalledWith({ density_min: undefined, density_max: undefined })
  })
  it('switching quakers off clears the limit and the roast size', async () => {
    const patch = vi.fn(); render(<PhysicalSection params={{ max_quakers: 10, roast_sample_size_grams: 300 }} patch={patch} />)
    await userEvent.click(screen.getByRole('switch', { name: 'Quakers' }))
    expect(patch).toHaveBeenCalledWith({ max_quakers: undefined, roast_sample_size_grams: undefined })
  })
  it('an off row says so', () => {
    render(<PhysicalSection params={{}} patch={vi.fn()} />)
    expect(screen.getAllByText('Not measured for this quality.')).toHaveLength(3)
  })
  it('switching on shows empty fields', async () => {
    render(<PhysicalSection params={{}} patch={vi.fn()} />)
    await userEvent.click(screen.getByRole('switch', { name: 'Density' }))
    expect(screen.getByLabelText('Min (g/mL)')).toHaveValue('')
  })
  it('a g/L entry shows the hint and is not stored', async () => {
    const patch = vi.fn(); render(<PhysicalSection params={{ density_min: 0.65 }} patch={patch} />)
    await userEvent.clear(screen.getByLabelText('Max (g/mL)')); await userEvent.type(screen.getByLabelText('Max (g/mL)'), '720')
    expect(screen.getByText('Enter g/mL, e.g. 0.680')).toBeInTheDocument()
    expect(patch).not.toHaveBeenCalledWith(expect.objectContaining({ density_max: 720 }))
  })
  it('a stored moisture standard alone does not switch Moisture on', () => {
    render(<PhysicalSection params={{ moisture_standard: 'coffee_industry' }} patch={vi.fn()} />)
    expect(screen.getByRole('switch', { name: 'Moisture' })).not.toBeChecked()
  })
  it('a roast sample size alone does not switch Quakers on', () => {
    render(<PhysicalSection params={{ roast_sample_size_grams: 300 }} patch={vi.fn()} />)
    expect(screen.getByRole('switch', { name: 'Quakers' })).not.toBeChecked()
  })
  it('switching moisture off clears the limits and keeps the standard', async () => {
    const patch = vi.fn()
    render(<PhysicalSection params={{ moisture_min: 11, moisture_max: 12, moisture_standard: 'iso_6673' }} patch={patch} />)
    await userEvent.click(screen.getByRole('switch', { name: 'Moisture' }))
    expect(patch).toHaveBeenCalledWith({ moisture_min: undefined, moisture_max: undefined })
    expect(patch).not.toHaveBeenCalledWith(expect.objectContaining({ moisture_standard: undefined }))
  })
  it('density off then on comes back empty with no hint', async () => {
    render(<PhysicalSection params={{}} patch={vi.fn()} />)
    await userEvent.click(screen.getByRole('switch', { name: 'Density' }))
    await userEvent.type(screen.getByLabelText('Min (g/mL)'), '720')
    expect(screen.getByText('Enter g/mL, e.g. 0.680')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('switch', { name: 'Density' }))
    await userEvent.click(screen.getByRole('switch', { name: 'Density' }))
    expect(screen.getByLabelText('Min (g/mL)')).toHaveValue('')
    expect(screen.queryByText('Enter g/mL, e.g. 0.680')).not.toBeInTheDocument()
  })
  it('a valid density is stored as a number', async () => {
    const patch = vi.fn(); render(<PhysicalSection params={{ density_min: 0.65 }} patch={patch} />)
    await userEvent.type(screen.getByLabelText('Max (g/mL)'), '0.72')
    expect(patch).toHaveBeenLastCalledWith({ density_max: 0.72 })
  })
  it('typing a decimal comma in density Min patches the number', async () => {
    const patch = vi.fn(); render(<PhysicalSection params={{ density_max: 0.72 }} patch={patch} />)
    await userEvent.type(screen.getByLabelText('Min (g/mL)'), '0,65')
    expect(patch).toHaveBeenLastCalledWith({ density_min: 0.65 })
    expect(screen.getByLabelText('Min (g/mL)')).toHaveValue('0,65')
  })
  it('typing a decimal comma in moisture Min patches the number', async () => {
    const patch = vi.fn(); render(<PhysicalSection params={{ moisture_max: 12 }} patch={patch} />)
    await userEvent.type(screen.getByLabelText('Min (%)'), '11,5')
    expect(patch).toHaveBeenLastCalledWith({ moisture_min: 11.5 })
    expect(screen.getByLabelText('Min (%)')).toHaveValue('11,5')
  })
  it('a hand-edited non-numeric density never seeds NaN', () => {
    render(<PhysicalSection params={{ density_min: 'abc' }} patch={vi.fn()} />)
    expect(screen.getByLabelText('Min (g/mL)')).toHaveValue('')
  })
  it('each row stacks on small screens and goes two-column from lg', () => {
    const { container } = render(<PhysicalSection params={{}} patch={vi.fn()} />)
    const row = container.querySelector('h3')!.parentElement!.parentElement!
    expect(row.className).toContain('grid-cols-1')
    expect(row.className).toMatch(/lg:grid-cols-\[240px/)
  })
})
