import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
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

  it('picking a note adds a chip, derives the official boxes, and counts BOXES not picks', () => {
    // §6.3.1 caps what is checked in the list. Blueberry checks Fruity + Berry —
    // one pick, two boxes — and the counter must say so.
    render(<Harness />)
    pickLeaf('Fruity', 'Fruity / Berry / Blueberry')
    expect(screen.getAllByText('Boxes 2/5').length).toBeGreaterThan(0)
    const cata = screen.getByTestId('derived-cata')
    expect(cata.textContent).toContain('Fruity')
    expect(cata.textContent).toContain('Berry')
    expect(cata.textContent).toContain('Blueberry')      // precise free descriptor
    // chip removal
    fireEvent.click(screen.getByRole('button', { name: /remove blueberry/i }))
    expect(screen.queryAllByText('Boxes 2/5')).toHaveLength(0)
    expect(screen.getAllByText('Boxes 0/5').length).toBeGreaterThan(0)
  })

  it('precision inside one family is free: four berries cost two boxes', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Fruity' }))
    for (const leaf of ['Blackberry', 'Raspberry', 'Blueberry', 'Strawberry'])
      fireEvent.click(screen.getByRole('button', { name: `Fruity / Berry / ${leaf}` }))
    expect(screen.getAllByText('Boxes 2/5').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /^remove /i })).toHaveLength(4)
  })

  it('a pick that would push the form past five boxes is refused, nothing evicted, and the toast names the box', () => {
    render(<Harness />)
    pickLeaf('Fruity', 'Fruity / Berry / Blueberry')            // Fruity, Berry
    pickLeaf('Sweet', 'Sweet / Brown Sugar / Honey')             // + Sweet, Brown Sugar = 4
    expect(screen.getAllByText('Boxes 4/5').length).toBeGreaterThan(0)
    pickLeaf('Nutty/Cocoa', 'Nutty/Cocoa / Cocoa / Chocolate')   // would be 6
    expect(screen.getByText(/5 boxes already checked — Nutty\/Cocoa would make 6/i)).toBeTruthy()
    expect(screen.getAllByText('Boxes 4/5').length).toBeGreaterThan(0)   // unchanged
    expect(screen.queryByRole('button', { name: /remove chocolate/i })).toBeNull()
    expect(screen.getByRole('button', { name: /remove blueberry/i })).toBeTruthy()   // nothing was evicted
  })

  it('a one-box pick that lands exactly on five is allowed', () => {
    render(<Harness />)
    pickLeaf('Fruity', 'Fruity / Berry / Blueberry')
    pickLeaf('Sweet', 'Sweet / Brown Sugar / Honey')
    pickLeaf('Floral', 'Floral / Floral / Jasmine')              // Floral only: 5
    expect(screen.getAllByText('Boxes 5/5').length).toBeGreaterThan(0)
    expect(screen.queryByText(/already checked/i)).toBeNull()
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

  it('Escape zooms the wheel out even after the wheel remounted inside an open overlay (checklist toggled)', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /official checklist/i }))
    fireEvent.click(screen.getByRole('button', { name: /show the flavour wheel/i }))   // the wheel mounts again
    fireEvent.click(screen.getByRole('button', { name: 'Sweet' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
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
    expect(screen.getByText('Boxes 0/5')).toBeTruthy()   // wheel-counter (FlavorWheel) is always there
  })

  it('on a compact screen a touch on the wheel collapses the open tray; a touch inside the tray leaves it open (Daniel 2026-09-09: "if user taps the wheel, it should hide")', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (q: string) => ({ matches: q.includes('max-width: 1023px'), media: q, addEventListener() {}, removeEventListener() {} }),
    })
    render(<Harness />)
    const tray = screen.getByTestId('describe-tray')
    fireEvent.click(screen.getByRole('button', { name: /descriptors/i }))
    expect(tray.getAttribute('data-open')).toBe('1')
    fireEvent.pointerDown(screen.getByLabelText(/descriptors — freely elicited/i))   // inside the tray
    expect(tray.getAttribute('data-open')).toBe('1')
    fireEvent.pointerDown(screen.getByTestId('flavor-wheel-stage'))                  // the wheel
    expect(tray.getAttribute('data-open')).toBe('0')
    // and the open tray paints above the wheel's chrome
    expect(screen.getByTestId('describe-tray-wrapper').className).toMatch(/z-\[8\]/)
  })

  it('on a compact screen the tray floats 148 px up, clear of the thumb, over the wheel', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (q: string) => ({ matches: q.includes('max-width: 1023px'), media: q, addEventListener() {}, removeEventListener() {} }),
    })
    render(<Harness />)
    expect(screen.getByTestId('describe-stage').getAttribute('data-layout')).toBe('overlay')
    expect(screen.getByTestId('describe-tray-wrapper').style.bottom).toBe('148px')
  })

  it('on a compact screen it measures the tray band (stage bottom − tray top) and hands it to the wheel as its bottom inset', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (q: string) => ({ matches: q.includes('max-width: 1023px'), media: q, addEventListener() {}, removeEventListener() {} }),
    })
    const restore = mockLayout({ stage: [0, 0, 390, 800], tray: [12, 600, 378, 776] })
    try {
      render(<Harness />)
      expect(screen.getByTestId('flavor-wheel-stage').getAttribute('data-inset')).toBe('200')
    } finally { restore() }
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

/**
 * Fake layout for the stage and tray: jsdom has no layout and no ResizeObserver,
 * so the rects come from a table keyed by test id ([left, top, right, bottom])
 * and a ResizeObserver stub fires as soon as it observes.
 */
function mockLayout(rects: Record<string, [number, number, number, number]>) {
  const live = new Set<() => void>()
  class RO {
    cb: ResizeObserverCallback; fire = () => this.cb([], this as unknown as ResizeObserver)
    constructor(cb: ResizeObserverCallback) { this.cb = cb }
    observe() { live.add(this.fire); this.fire() } unobserve() {} disconnect() { live.delete(this.fire) }
  }
  mockLayout.fire = () => act(() => { for (const f of [...live]) f() })
  vi.stubGlobal('ResizeObserver', RO)
  const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const r = rects[(this.getAttribute('data-testid') ?? '').replace(/^describe-/, '')] ?? [0, 0, 0, 0]
    const [left, top, right, bottom] = r
    return { left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) } as DOMRect
  })
  return () => { spy.mockRestore(); vi.unstubAllGlobals() }
}
mockLayout.fire = () => {}

describe('DescribeOverlay — the descriptors never cover the wheel on a desktop (Daniel 2026-10-06: "when we mouse over the lower part of the wheel, we cant see the buttons")', () => {
  const desktop = () => Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }),
  })

  it('on a landscape laptop they sit beside the wheel, which keeps its whole height and gets no bottom inset', () => {
    desktop()
    // 1366×650 laptop: the stage below the tab row is 1366×583. The old tray covered the wheel's lower 40%.
    const restore = mockLayout({ stage: [0, 67, 1366, 650], tray: [1006, 83, 1350, 634] })
    try {
      render(<Harness />)
      expect(screen.getByTestId('describe-stage').getAttribute('data-layout')).toBe('side')
      expect(screen.getByTestId('describe-tray-wrapper').style.bottom).toBe('')
      expect(screen.getByTestId('flavor-wheel-stage').getAttribute('data-inset')).toBe('0')
    } finally { restore() }
  })

  it('beside the wheel, the panel header carries the way back and the one box counter', () => {
    desktop()
    const restore = mockLayout({ stage: [0, 67, 1366, 650], tray: [1006, 83, 1350, 634] })
    try {
      render(<Harness />)
      const panel = screen.getByTestId('describe-tray')
      pickLeaf('Fruity', 'Fruity / Berry / Blueberry')
      expect(screen.getAllByText('Boxes 2/5')).toHaveLength(1)
      expect(panel.textContent).toContain('Boxes 2/5')
      const back = screen.getByRole('button', { name: 'Zoom out of Fruity' })
      expect(panel.contains(back)).toBe(true)
      fireEvent.click(back)
      expect(screen.getByTestId('flavor-wheel-stage').getAttribute('data-focus')).toBe('')
      expect(screen.queryByRole('button', { name: /zoom out of/i })).toBeNull()
    } finally { restore() }
  })

  it('the panel counter pulses for a new refusal only, not every time the panel mounts again', () => {
    desktop()
    const restore = mockLayout({ stage: [0, 67, 1366, 650], tray: [1006, 83, 1350, 634] })
    try {
      render(<Harness />)
      pickLeaf('Fruity', 'Fruity / Berry / Blueberry')
      pickLeaf('Sweet', 'Sweet / Brown Sugar / Honey')
      pickLeaf('Nutty/Cocoa', 'Nutty/Cocoa / Cocoa / Chocolate')        // refused: would make 6 boxes
      expect(screen.getByText('Boxes 4/5').getAttribute('data-pulse')).toBe('1')
      fireEvent.click(screen.getByRole('tab', { name: /mouthfeel/i }))
      fireEvent.click(screen.getByRole('tab', { name: /aroma/i }))
      expect(screen.getByText('Boxes 4/5').getAttribute('data-pulse')).toBe('0')
    } finally { restore() }
  })

  it('a closed overlay keeps its layout: reopening on a portrait desktop does not flash the side panel', () => {
    desktop()
    const rects: Record<string, [number, number, number, number]> = { stage: [0, 67, 1080, 1867], tray: [130, 1600, 950, 1843] }
    const restore = mockLayout(rects)
    try {
      const { rerender } = render(<Harness open />)
      expect(screen.getByTestId('describe-stage').getAttribute('data-layout')).toBe('stacked')
      rerender(<Harness open={false} />)
      rects.stage = [0, 0, 0, 0]; rects.tray = [0, 0, 0, 0]   // display:none measures 0×0
      mockLayout.fire()
      rerender(<Harness open />)
      expect(screen.getByTestId('describe-stage').getAttribute('data-layout')).toBe('stacked')
    } finally { restore() }
  })

  it('below the wheel, the tray has a fixed height so a new chip or the toast never resizes the wheel', () => {
    desktop()
    const restore = mockLayout({ stage: [0, 67, 1080, 1867], tray: [130, 1600, 950, 1843] })
    try {
      render(<Harness />)
      expect(screen.getByTestId('describe-tray').style.height).toBe('min(46dvh, 340px)')
    } finally { restore() }
  })

  it('on a tall desktop window they sit below the wheel instead, still never over it', () => {
    desktop()
    // a portrait monitor: beside the wheel the panel would shrink it to 696 px; below it, it keeps 1080
    const restore = mockLayout({ stage: [0, 67, 1080, 1867], tray: [130, 1600, 950, 1843] })
    try {
      render(<Harness />)
      expect(screen.getByTestId('describe-stage').getAttribute('data-layout')).toBe('stacked')
      expect(screen.getByTestId('flavor-wheel-stage').getAttribute('data-inset')).toBe('0')
    } finally { restore() }
  })
})

/** The overlay driven with a lot strip, as CvaJourney drives it on a multi-lot table. */
function LotHarness({ samples = [{ id: 'a', reference: 'BR-036991/26' }, { id: 'b', reference: 'BR-036992/26' }] }) {
  const [describe, setDescribe] = useState<CvaDescribe>(createEmptyAssessment().describe)
  const [group, setGroup] = useState<DescribeGroup>('aroma')
  const [activeId, setActiveId] = useState('a')
  return (
    <DescribeOverlay
      open group={group} onGroupChange={setGroup}
      describe={describe} onDescribe={(m) => setDescribe((d) => m(d))} onClose={() => {}}
      samples={samples} activeSampleId={activeId} onSampleChange={setActiveId}
    />
  )
}

describe('DescribeOverlay — the lot strip (SCA-102 §7, step-major)', () => {
  it('switches lots without leaving the wheel', () => {
    // Step-major means one section is described across every lot on the table.
    // Without this the cupper closes the overlay, switches tab, and reopens it
    // once per lot.
    render(<LotHarness />)
    const other = screen.getByRole('button', { name: /BR-036992\/26/ })
    fireEvent.click(other)
    expect(other.getAttribute('aria-current')).toBe('true')
    expect(screen.getByRole('button', { name: /BR-036991\/26/ }).getAttribute('aria-current')).toBe('false')
  })

  it('is not rendered when there is only one lot, or when the journey passes none', () => {
    const { unmount } = render(<LotHarness samples={[{ id: 'a', reference: 'BR-036991/26' }]} />)
    expect(screen.queryByRole('button', { name: /BR-036991\/26/ })).toBeNull()
    unmount()
    render(<Harness />)
    expect(screen.queryByRole('button', { name: /BR-0/ })).toBeNull()
  })
})

describe('DescribeOverlay — the official checklist (SCA-103 §8.2)', () => {
  it('starts on the wheel and toggles to the form checklist', () => {
    render(<Harness />)
    expect(screen.getByTestId('flavor-wheel-stage')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /official checklist/i }))
    expect(screen.queryByTestId('flavor-wheel-stage')).toBeNull()
    expect(screen.getByTestId('form-checklist')).toBeTruthy()
  })

  it('ticks the boxes the wheel picks checked, and names the leaf as the written-in term', () => {
    render(<Harness />)
    pickLeaf('Fruity', 'Fruity / Berry / Blueberry')
    fireEvent.click(screen.getByRole('button', { name: /official checklist/i }))
    // §6.3.4: a conspicuous blueberry is recorded by marking Berry AND Fruity
    // and writing "blueberry" down — the checklist has to show all three.
    expect(screen.getByRole('checkbox', { name: 'Fruity' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('checkbox', { name: 'Berry' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('checkbox', { name: 'Floral' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByTestId('form-checklist').textContent).toContain('Blueberry')
  })

  it('shows all 24 boxes of the form', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /official checklist/i }))
    expect(screen.getAllByRole('checkbox')).toHaveLength(24)
  })

  it('has no checklist on the mouthfeel tab — that box is already a flat list', () => {
    render(<Harness initialGroup={'mouthfeel' as DescribeGroup} />)
    expect(screen.queryByRole('button', { name: /official checklist/i })).toBeNull()
  })
})
