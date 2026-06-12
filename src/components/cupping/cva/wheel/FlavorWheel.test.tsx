import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { FlavorWheel, splitLabel } from './FlavorWheel'
import { NODES, CX, CY } from '@/lib/cva/flavor-wheel-data'
import { DWELL } from './zoom-machine'

describe('FlavorWheel — render + tap path', () => {
  it('renders all 110 selectable wedges', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    expect(screen.getAllByRole('button', { name: /.+/ }).filter((b) => b.tagName.toLowerCase() === 'g')).toHaveLength(110)
  })

  it('starts at rest; tapping a family zooms it; tapping a note then toggles the pick', () => {
    const onToggle = vi.fn()
    const { container } = render(<FlavorWheel picks={[]} onToggle={onToggle} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('data-zoom-mode')).toBe('rest')

    fireEvent.click(screen.getByRole('button', { name: 'Fruity' }))
    expect(svg.getAttribute('data-zoom-mode')).toBe('full')
    expect(onToggle).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Fruity / Berry / Blueberry' }))
    expect(onToggle).toHaveBeenCalledWith({ path: ['Fruity', 'Berry', 'Blueberry'] })
  })

  it('tapping a different family while focused re-aims instead of toggling', () => {
    const onToggle = vi.fn()
    const { container } = render(<FlavorWheel picks={[]} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fruity' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roasted / Cereal / Malt' }))
    expect(onToggle).not.toHaveBeenCalled()
    expect(container.querySelector('svg')!.getAttribute('data-zoom-mode')).toBe('full')
  })

  it('background click and Escape return to rest', () => {
    const { container } = render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const svg = container.querySelector('svg')!
    fireEvent.click(screen.getByRole('button', { name: 'Sweet' }))
    fireEvent.click(svg)
    expect(svg.getAttribute('data-zoom-mode')).toBe('rest')
    fireEvent.click(screen.getByRole('button', { name: 'Sweet' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(svg.getAttribute('data-zoom-mode')).toBe('rest')
  })

  it('picked wedges carry the is-picked class', () => {
    render(<FlavorWheel picks={[{ path: ['Fruity', 'Berry', 'Blueberry'] }]} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: 'Fruity / Berry / Blueberry' }).classList.contains('is-picked')).toBe(true)
  })

  it('frost: only the focused family clears its outer-ring frost', () => {
    const { container } = render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    expect(container.querySelectorAll('.cva-wheel-w3.is-clear')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Fruity' }))
    const clear = container.querySelectorAll('.cva-wheel-w3.is-clear')
    expect(clear).toHaveLength(1)
  })

  it('splitLabel wraps at the slash, then the most central space, else not at all', () => {
    expect(splitLabel('Sour/Fermented', 11)).toEqual(['Sour/', 'Fermented'])
    expect(splitLabel('Citrus Fruit', 11)).toEqual(['Citrus', 'Fruit'])
    expect(splitLabel('Sweet Aromatics', 22)).toEqual(['Sweet Aromatics'])
    expect(splitLabel('Blackberry', 22)).toEqual(['Blackberry'])
  })
})

/** Dispatch a pointermove at a wheel node's centroid (viewBox coords map 1:1
 *  because we mock the svg rect to 440×440). act-wrapped: the handler setState-s. */
function moveTo(svg: SVGSVGElement, pathKey: string, pointerType = 'mouse') {
  const nd = NODES.find((n) => n.path.join('>') === pathKey)!
  const mid = (nd.a0 + nd.a1) / 2
  const r = (nd.r0 + nd.r1) / 2
  const ev = new MouseEvent('pointermove', {
    bubbles: true,
    clientX: CX + Math.cos(mid) * r,
    clientY: CY + Math.sin(mid) * r,
  })
  Object.defineProperty(ev, 'pointerType', { value: pointerType })
  act(() => { svg.dispatchEvent(ev) })
}

function mockRect(svg: SVGSVGElement) {
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 440, height: 440, right: 440, bottom: 440, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect)
}

describe('FlavorWheel — hover layer', () => {
  it('dwelling on a family zooms in after DWELL.in; the hub dwell zooms back out', () => {
    vi.useFakeTimers()
    const { container } = render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const svg = container.querySelector('svg')! as SVGSVGElement
    mockRect(svg)

    moveTo(svg, 'Fruity>Berry')
    expect(svg.getAttribute('data-zoom-mode')).toBe('rest')   // not yet — dwell pending
    act(() => { vi.advanceTimersByTime(DWELL.in + 5) })
    expect(svg.getAttribute('data-zoom-mode')).toBe('full')

    // pointer to the hub → breathes out after DWELL.out
    const ev = new MouseEvent('pointermove', { bubbles: true, clientX: CX, clientY: CY })
    Object.defineProperty(ev, 'pointerType', { value: 'mouse' })
    act(() => { svg.dispatchEvent(ev) })
    act(() => { vi.advanceTimersByTime(DWELL.out + 5) })
    expect(svg.getAttribute('data-zoom-mode')).toBe('rest')
    vi.useRealTimers()
  })

  it('hover at rest lifts the family immediately (is-hot) and unfrosts its outer ring', () => {
    const { container } = render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const svg = container.querySelector('svg')! as SVGSVGElement
    mockRect(svg)
    moveTo(svg, 'Roasted>Burnt>Smoky')
    expect(container.querySelectorAll('.cva-wheel-branch.is-hot')).toHaveLength(1)
    expect(container.querySelectorAll('.cva-wheel-w3.is-clear')).toHaveLength(1)
  })

  it('while focused, hovering a note pops it (wedge + label ride together)', () => {
    vi.useFakeTimers()
    const { container } = render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const svg = container.querySelector('svg')! as SVGSVGElement
    mockRect(svg)
    fireEvent.click(screen.getByRole('button', { name: 'Fruity' }))
    moveTo(svg, 'Fruity>Berry>Blueberry')
    expect(screen.getByRole('button', { name: 'Fruity / Berry / Blueberry' }).classList.contains('is-popped')).toBe(true)
    expect(container.querySelectorAll('.cva-wheel-lw.is-popped')).toHaveLength(1)
    vi.useRealTimers()
  })

  it('touch pointermoves are fully ignored (no lift, no dwell zoom)', () => {
    vi.useFakeTimers()
    const { container } = render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const svg = container.querySelector('svg')! as SVGSVGElement
    mockRect(svg)
    moveTo(svg, 'Fruity>Berry', 'touch')
    act(() => { vi.advanceTimersByTime(1000) })
    expect(svg.getAttribute('data-zoom-mode')).toBe('rest')
    expect(container.querySelectorAll('.cva-wheel-branch.is-hot')).toHaveLength(0)
    vi.useRealTimers()
  })
})
