import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { DescribeOverlay } from './DescribeOverlay'
import { createEmptyAssessment, type CvaDescribe, type DescribeGroup } from '@/types/cva'

/** Stateful harness — the overlay is controlled exactly like CvaJourney drives it. */
function Harness({ initialGroup = 'aroma' as DescribeGroup, onClose = () => {}, open = true }) {
  const [describe, setDescribe] = useState<CvaDescribe>(createEmptyAssessment().describe)
  const [group, setGroup] = useState<DescribeGroup>(initialGroup)
  return (
    <DescribeOverlay
      open={open}
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
    expect(screen.getAllByText('Picks 1/5').length).toBeGreaterThan(0)
    const cata = screen.getByTestId('derived-cata')
    expect(cata.textContent).toContain('Fruity')
    expect(cata.textContent).toContain('Berry')
    expect(cata.textContent).toContain('Blueberry')      // precise free descriptor
    // chip removal
    fireEvent.click(screen.getByRole('button', { name: /remove blueberry/i }))
    expect(screen.queryAllByText('Picks 1/5')).toHaveLength(0)
  })

  it('6th pick replaces the oldest and shows the cap toast', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Fruity' }))
    for (const leaf of ['Blackberry', 'Raspberry', 'Blueberry', 'Strawberry'])
      fireEvent.click(screen.getByRole('button', { name: `Fruity / Berry / ${leaf}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Fruity / Citrus Fruit / Lemon' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fruity / Citrus Fruit / Lime' }))   // 6th
    expect(screen.getByText(/cap of 5 reached — replaced "Blackberry"/i)).toBeTruthy()
    expect(screen.getAllByText('Picks 5/5')[0]).toBeTruthy()
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

  it('the tray has no backdrop blur and no filter', () => {
    render(<Harness />)
    const tray = screen.getByTestId('describe-tray')
    expect(tray.className).not.toMatch(/backdrop-blur/)
    expect(tray.style.backdropFilter || '').toBe('')
    expect(tray.style.filter || '').toBe('')
  })

  it('on a compact screen the tray starts collapsed and expands on tap; the counter stays visible on the wheel', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (q: string) => ({ matches: q.includes('max-width: 1023px'), media: q, addEventListener() {}, removeEventListener() {} }),
    })
    render(<Harness />)
    const tray = screen.getByTestId('describe-tray')
    expect(tray.getAttribute('data-open')).toBe('0')
    fireEvent.click(screen.getByRole('button', { name: /descriptors/i }))
    expect(tray.getAttribute('data-open')).toBe('1')
    expect(screen.getByText('Picks 0/5')).toBeTruthy()   // wheel-counter (FlavorWheel) is always there
  })

  it('the tray wrapper offset comes from the compact flag, not a CSS breakpoint', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (q: string) => ({ matches: q.includes('max-width: 1023px'), media: q, addEventListener() {}, removeEventListener() {} }),
    })
    const { unmount } = render(<Harness />)
    expect(screen.getByTestId('describe-tray-wrapper').style.bottom).toBe('148px')
    unmount()

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }),
    })
    render(<Harness />)
    expect(screen.getByTestId('describe-tray-wrapper').style.bottom).toBe('24px')
  })

  it('measures the tray band (stage bottom − tray top) and hands it to the wheel as its bottom inset', () => {
    // jsdom has no ResizeObserver; a stub that fires on observe stands in for layout settling
    class RO { cb: ResizeObserverCallback; constructor(cb: ResizeObserverCallback) { this.cb = cb } observe() { this.cb([], this as unknown as ResizeObserver) } unobserve() {} disconnect() {} }
    vi.stubGlobal('ResizeObserver', RO)
    const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 1000, width: 1000, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const id = this.getAttribute('data-testid')
      if (id === 'describe-stage') return rect(0, 800)
      if (id === 'describe-tray') return rect(600, 776)
      return rect(0, 0)
    })
    try {
      render(<Harness />)
      expect(screen.getByTestId('flavor-wheel-stage').getAttribute('data-inset')).toBe('200')
    } finally {
      spy.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  it('the tray re-collapses on every reopen, not just the first time', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (q: string) => ({ matches: q.includes('max-width: 1023px'), media: q, addEventListener() {}, removeEventListener() {} }),
    })
    const { rerender } = render(<Harness open />)
    const tray = screen.getByTestId('describe-tray')
    fireEvent.click(screen.getByRole('button', { name: /descriptors/i }))
    expect(tray.getAttribute('data-open')).toBe('1')
    rerender(<Harness open={false} />)
    rerender(<Harness open />)
    expect(tray.getAttribute('data-open')).toBe('0')
  })
})
