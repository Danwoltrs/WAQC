import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { DescribeOverlay } from './DescribeOverlay'
import { createEmptyAssessment, type CvaDescribe, type DescribeGroup } from '@/types/cva'

/** Stateful harness — the overlay is controlled exactly like CvaJourney drives it. */
function Harness({ initialGroup = 'aroma' as DescribeGroup, onClose = () => {} }) {
  const [describe, setDescribe] = useState<CvaDescribe>(createEmptyAssessment().describe)
  const [group, setGroup] = useState<DescribeGroup>(initialGroup)
  return (
    <DescribeOverlay
      open
      group={group}
      onGroupChange={setGroup}
      describe={describe}
      onDescribe={(m) => setDescribe((d) => m(d))}
      onClose={onClose}
    />
  )
}

const pickLeaf = (family: string, leafLabel: string) => {
  fireEvent.click(screen.getByRole('button', { name: family }))
  fireEvent.click(screen.getByRole('button', { name: leafLabel }))
}

describe('DescribeOverlay', () => {
  it('renders the three group tabs; aroma group shows the wheel, no main tastes', () => {
    render(<Harness />)
    expect(screen.getByRole('tab', { name: /aroma/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /flavor & aftertaste/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /mouthfeel/i })).toBeTruthy()
    expect(screen.getByTestId('flavor-wheel-stage')).toBeTruthy()
    expect(screen.queryByText(/main tastes/i)).toBeNull()
  })

  it('picking a note adds a chip, derives the official boxes, and counts picks not boxes', () => {
    render(<Harness />)
    pickLeaf('Fruity', 'Fruity / Berry / Blueberry')
    expect(screen.getByText('Picks 1/5')).toBeTruthy()
    const cata = screen.getByTestId('derived-cata')
    expect(cata.textContent).toContain('Fruity')
    expect(cata.textContent).toContain('Berry')
    expect(cata.textContent).toContain('Blueberry')      // precise free descriptor
    // chip removal
    fireEvent.click(screen.getByRole('button', { name: /remove blueberry/i }))
    expect(screen.queryByText('Picks 1/5')).toBeNull()
  })

  it('6th pick replaces the oldest and shows the cap toast', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Fruity' }))
    for (const leaf of ['Blackberry', 'Raspberry', 'Blueberry', 'Strawberry'])
      fireEvent.click(screen.getByRole('button', { name: `Fruity / Berry / ${leaf}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Fruity / Citrus Fruit / Lemon' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fruity / Citrus Fruit / Lime' }))   // 6th
    expect(screen.getByText(/cap of 5 reached — replaced "Blackberry"/i)).toBeTruthy()
    expect(screen.getByText('Picks 5/5')).toBeTruthy()
  })

  it('flavor & aftertaste group adds main tastes; mouthfeel group swaps the wheel for the CATA panel', () => {
    render(<Harness initialGroup="flavor_aftertaste" />)
    expect(screen.getByText(/main tastes/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /mouthfeel/i }))
    expect(screen.queryByTestId('flavor-wheel-stage')).toBeNull()
    expect(screen.getByRole('button', { name: /mouth-drying/i })).toBeTruthy()
  })

  it('per-group free-note input writes the right notes key', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText(/freely elicited/i), { target: { value: 'dried tomato' } })
    expect((screen.getByLabelText(/freely elicited/i) as HTMLInputElement).value).toBe('dried tomato')
  })

  it('Escape closes only when the wheel is at rest', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sweet' }))   // wheel now focused
    fireEvent.keyDown(document, { key: 'Escape' })                   // consumed by the wheel
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })                   // wheel at rest → closes
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
