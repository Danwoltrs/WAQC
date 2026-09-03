import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { FlavorWheel } from './FlavorWheel'
import { NODES, CX, CY } from '@/lib/cva/flavor-wheel-data'
import { DWELL_IN, DWELL_OUT } from './dwell'

function mockMedia(reduced = true, compact = false) {
  // rAF is not faked by vi.useFakeTimers(): route it through the faked setTimeout so flush() drives the loop.
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16)) as any
  window.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as any
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({
      matches: q.includes('reduced-motion') ? reduced : q.includes('max-width: 1023px') ? compact : false,
      media: q, addEventListener() {}, removeEventListener() {},
    }),
  })
}
/** The root measures itself in its mount effect, so the size mocks must exist BEFORE render: install them on the prototype. */
function mockRoot() {
  const rect = { left: 0, top: 0, width: 440, height: 440, right: 440, bottom: 440, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect)
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { get: () => 440, configurable: true })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { get: () => 440, configurable: true })
}
/** Screen point for a node's centroid at the REST camera on a 440×440 root (scene = screen). */
function centroid(key: string) {
  const nd = NODES.find((n) => n.path.join('>') === key)!
  const mid = (nd.a0 + nd.a1) / 2, r = (nd.r0 + nd.r1) / 2
  return { clientX: CX + Math.cos(mid) * r, clientY: CY + Math.sin(mid) * r }
}
/** jsdom's PointerEvent support is patchy: build a MouseEvent of the pointer type and pin the pointer fields on it. */
export function pev(el: Element, type: string, init: { clientX: number; clientY: number; pointerType?: string; pointerId?: number }) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: init.clientX, clientY: init.clientY, button: 0 })
  Object.defineProperty(ev, 'pointerType', { value: init.pointerType ?? 'mouse' })
  Object.defineProperty(ev, 'pointerId', { value: init.pointerId ?? 1 })
  Object.defineProperty(ev, 'isPrimary', { value: true })
  act(() => { el.dispatchEvent(ev) })
}
function tap(root: HTMLElement, at: { clientX: number; clientY: number }, pointerType = 'mouse') {
  pev(root, 'pointerdown', { ...at, pointerType })
  pev(root, 'pointerup', { ...at, pointerType })
}
/** Where the wheel's hub actually renders on screen after the camera has flown —
    the viewport centre maps to the family centroid post-fly, not to the hub, so a
    literal (CX, CY) tap lands on the focused wedge instead. Read it off the camera
    div's own transform: translate(txpx, typx) satisfies tx = −(cam.x − CX)·k, so
    worldToScreen(CX, CY) = (220 + tx, 220 + ty) on this 440×440 root. */
function hubOnScreen(root: HTMLElement) {
  const t = root.querySelector<HTMLElement>('.wheel-camera')!.style.transform
  const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(t)!
  return { clientX: 220 + parseFloat(m[1]), clientY: 220 + parseFloat(m[2]) }
}
const flush = () => act(() => { vi.advanceTimersByTime(50) })

beforeEach(() => { mockMedia(true); mockRoot(); vi.useFakeTimers() })
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('FlavorWheel — assistive-tech path (role=button clicks)', () => {
  it('renders all 110 wedges; family click focuses, leaf click in the focused family toggles', () => {
    const onToggle = vi.fn()
    render(<FlavorWheel picks={[]} onToggle={onToggle} />)
    expect(screen.getAllByRole('button').filter((b) => b.tagName.toLowerCase() === 'g')).toHaveLength(110)
    const root = screen.getByTestId('flavor-wheel-stage')
    expect(root.getAttribute('data-focus')).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Fruity' }))
    expect(root.getAttribute('data-focus')).toBe('Fruity')
    expect(onToggle).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Fruity / Berry / Blueberry' }))
    expect(onToggle).toHaveBeenCalledWith({ path: ['Fruity', 'Berry', 'Blueberry'] })
  })

  it('a group inside the focused family is itself pickable (inner-ring picks are valid)', () => {
    const onToggle = vi.fn()
    render(<FlavorWheel picks={[]} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sweet' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sweet / Brown Sugar' }))
    expect(onToggle).toHaveBeenCalledWith({ path: ['Sweet', 'Brown Sugar'] })
  })

  it('a leaf of another family re-aims instead of toggling', () => {
    const onToggle = vi.fn()
    render(<FlavorWheel picks={[]} onToggle={onToggle} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    fireEvent.click(screen.getByRole('button', { name: 'Fruity' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roasted / Cereal / Malt' }))
    expect(onToggle).not.toHaveBeenCalled()
    expect(root.getAttribute('data-focus')).toBe('Roasted')
  })

  it('picked wedges carry is-picked', () => {
    render(<FlavorWheel picks={[{ path: ['Fruity', 'Berry', 'Blueberry'] }]} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: 'Fruity / Berry / Blueberry' }).classList.contains('is-picked')).toBe(true)
  })
})

describe('FlavorWheel — pointer path (single root listener, polar hit-test)', () => {
  it('a mouse tap on a family centroid at rest focuses it; a hub tap zooms out', () => {
    const onToggle = vi.fn()
    render(<FlavorWheel picks={[]} onToggle={onToggle} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    tap(root, centroid('Fruity')); flush()
    expect(root.getAttribute('data-focus')).toBe('Fruity')
    expect(root.getAttribute('data-zoomed')).toBe('1')
    // Documented behaviour: after the fly, the viewport centre IS the family
    // centroid — a tap at literal screen centre lands on the focused wedge and
    // toggles a pick (rule 1), it does not hit the hub.
    tap(root, { clientX: CX, clientY: CY })
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ path: expect.arrayContaining(['Fruity']) }))
    tap(root, hubOnScreen(root)); flush()
    expect(root.getAttribute('data-focus')).toBe('')
    expect(root.getAttribute('data-zoomed')).toBe('0')
  })

  it('a touch tap goes through the gesture machine and focuses too', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    tap(root, centroid('Spices'), 'touch'); flush()
    expect(root.getAttribute('data-focus')).toBe('Spices')
  })

  it('hover toggles is-hover directly on the wedge without a React re-render of the scene', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    const at = centroid('Nutty/Cocoa')
    pev(root, 'pointermove', at)
    expect(screen.getByRole('button', { name: 'Nutty/Cocoa' }).classList.contains('is-hover')).toBe(true)
    pev(root, 'pointermove', { clientX: CX, clientY: CY })
    expect(screen.getByRole('button', { name: 'Nutty/Cocoa' }).classList.contains('is-hover')).toBe(false)
  })

  it('the camera element carries the only transform', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    tap(root, centroid('Fruity')); flush()
    const cam = root.querySelector<HTMLElement>('.wheel-camera')!
    expect(cam.style.transform).toMatch(/^translate\(.+px, .+px\) scale\(1\.\d+\)$/)   // framed at ~80%, ≤ 1.5 on desktop
    expect(root.querySelectorAll('svg [style*="transform"], svg [transform]:not(text)')).toHaveLength(0)
  })

  it('a clean touch tap settles the loop: pressPending and the press ring never get stuck', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    const at = centroid('Fruity')
    pev(root, 'pointerdown', { ...at, pointerType: 'touch' })
    flush()   // drives tick() far enough that press-progress fires and shows the ring
    pev(root, 'pointerup', { ...at, pointerType: 'touch' })
    flush(); flush()
    const pressRing = root.querySelector<HTMLElement>('.wheel-press-ring')!
    expect(pressRing.hasAttribute('hidden')).toBe(true)
    expect(root.querySelector<HTMLElement>('.wheel-camera')!.style.willChange).toBe('')
  })

  it('a held stick input does not keep the loop alive once the target is clamped', () => {
    // Reduced motion snaps `current = target` every tick — no spring convergence to
    // wait out — and compact renders the Thumbstick.
    mockMedia(true, true)
    // The default fake-timer config here doesn't fake `performance`, so rAF
    // timestamps barely move; the stick's velocity integration needs a real dt.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] })
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    const cam = root.querySelector<HTMLElement>('.wheel-camera')!
    flush()
    fireEvent.click(screen.getByRole('button', { name: 'Fruity' }))
    flush(); flush()
    expect(cam.style.willChange).toBe('')   // settled baseline before the stick is touched

    const well = root.querySelector('.wheel-stick')!
    const knob = root.querySelector('.wheel-stick-knob')!
    vi.spyOn(well, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 112, height: 112, right: 112, bottom: 112, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
    pev(knob, 'pointerdown', { clientX: 56, clientY: 56 })
    pev(knob, 'pointermove', { clientX: 0, clientY: 56 })   // full deflection left — held, never released

    for (let i = 0; i < 30; i++) flush()
    expect(cam.style.willChange).toBe('')   // the target ran into the clamp and the loop stopped, even though the stick is still held

    pev(knob, 'pointerup', { clientX: 0, clientY: 56 })
    expect(cam.style.willChange).toBe('')
  })

  it('overlay controls do not feed the wheel\'s pointer/hit-test path', () => {
    const onToggle = vi.fn()
    render(<FlavorWheel picks={[]} onToggle={onToggle} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    fireEvent.click(screen.getByRole('button', { name: 'Sweet' }))
    expect(root.getAttribute('data-focus')).toBe('Sweet')
    const back = root.querySelector<HTMLElement>('.wheel-back')!
    pev(back, 'pointerdown', { clientX: 0, clientY: 0 })
    pev(back, 'pointerup', { clientX: 0, clientY: 0 })
    expect(onToggle).not.toHaveBeenCalled()
    expect(root.getAttribute('data-focus')).toBe('Sweet')   // raw pointer events on the button never reach the wheel's hit-test
    fireEvent.click(back)
    expect(root.getAttribute('data-focus')).toBe('')        // the button's own onClick still works
  })
})

describe('FlavorWheel — keyboard and lifecycle', () => {
  it('Escape zooms out one level and is consumed only while focused', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    fireEvent.click(screen.getByRole('button', { name: 'Sweet' }))
    const consumed = fireEvent.keyDown(document, { key: 'Escape' })
    expect(consumed).toBe(false)       // preventDefault called
    expect(root.getAttribute('data-focus')).toBe('')
    const passed = fireEvent.keyDown(document, { key: 'Escape' })
    expect(passed).toBe(true)          // at rest: not consumed
  })

  it('arrow keys move a visible focus ring; Enter activates', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    root.focus()
    fireEvent.keyDown(root, { key: 'ArrowRight' })
    const focused = root.querySelectorAll('.wheel-wedge.is-focus')
    expect(focused).toHaveLength(1)
    expect(root.getAttribute('aria-activedescendant')).toBe(focused[0].id)
    const name = focused[0].getAttribute('aria-label')!
    fireEvent.keyDown(root, { key: 'Enter' })
    expect(root.getAttribute('data-focus')).toBe(name.split(' / ')[0])
  })

  it('active=false resets focus and the camera', () => {
    const { rerender } = render(<FlavorWheel picks={[]} onToggle={() => {}} active />)
    const root = screen.getByTestId('flavor-wheel-stage')
    fireEvent.click(screen.getByRole('button', { name: 'Sweet' }))
    expect(root.getAttribute('data-focus')).toBe('Sweet')
    expect(root.querySelector<HTMLElement>('.wheel-camera')!.style.willChange).toBe('transform')   // the fly started the loop
    rerender(<FlavorWheel picks={[]} onToggle={() => {}} active={false} />)
    flush()
    expect(root.getAttribute('data-focus')).toBe('')
    expect(root.querySelector<HTMLElement>('.wheel-camera')!.style.transform).toBe('translate(0px, 0px) scale(1)')
    expect(root.querySelector<HTMLElement>('.wheel-camera')!.style.willChange).toBe('')
  })
})

describe('FlavorWheel — desktop hover dwell (Daniel 2026-09-03: "auto zoom in with the mouse when we mouse over")', () => {
  it('resting the mouse on a family for the guard band flies to it; a sweep that keeps moving does not', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    pev(root, 'pointermove', centroid('Fruity'))
    act(() => { vi.advanceTimersByTime(DWELL_IN - 50) })
    pev(root, 'pointermove', centroid('Sweet'))            // moved on before Fruity's band elapsed
    act(() => { vi.advanceTimersByTime(DWELL_IN - 50) })
    expect(root.getAttribute('data-focus')).toBe('')
    act(() => { vi.advanceTimersByTime(100) })              // Sweet's own band completes
    flush()
    expect(root.getAttribute('data-focus')).toBe('Sweet')
  })

  it('wandering between wedges of one family does not restart the clock; a leaf hovers its FAMILY', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    pev(root, 'pointermove', centroid('Fruity>Berry>Blueberry'))
    act(() => { vi.advanceTimersByTime(DWELL_IN - 40) })
    pev(root, 'pointermove', centroid('Fruity>Citrus Fruit>Lemon'))
    act(() => { vi.advanceTimersByTime(60) })
    flush()
    expect(root.getAttribute('data-focus')).toBe('Fruity')
  })

  it('inside the focused family nothing re-flies; resting on the hub zooms out', () => {
    const onToggle = vi.fn()
    render(<FlavorWheel picks={[]} onToggle={onToggle} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    tap(root, centroid('Fruity')); flush()
    expect(root.getAttribute('data-focus')).toBe('Fruity')
    pev(root, 'pointermove', { clientX: CX, clientY: CY })   // the viewport centre IS the focused family after the fly
    act(() => { vi.advanceTimersByTime(DWELL_OUT + 100) })
    expect(root.getAttribute('data-focus')).toBe('Fruity')
    expect(onToggle).not.toHaveBeenCalled()                   // a dwell never picks
    pev(root, 'pointermove', hubOnScreen(root))
    act(() => { vi.advanceTimersByTime(DWELL_OUT + 10) })
    flush()
    expect(root.getAttribute('data-focus')).toBe('')
  })

  it('a press cancels a pending dwell, and touch never dwells', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    pev(root, 'pointermove', centroid('Fruity'))
    pev(root, 'pointerdown', { clientX: 1, clientY: 1 })     // press on the ground: supersedes the hover intent
    act(() => { vi.advanceTimersByTime(DWELL_IN + 100) })
    expect(root.getAttribute('data-focus')).toBe('')
    pev(root, 'pointermove', { ...centroid('Spices'), pointerType: 'touch' })
    act(() => { vi.advanceTimersByTime(DWELL_IN + 100) })
    flush()
    expect(root.getAttribute('data-focus')).toBe('')
  })

  it('leaving the wheel cancels a pending dwell', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    pev(root, 'pointermove', centroid('Fruity'))
    pev(root, 'pointerout', { clientX: -5, clientY: -5 })    // React synthesises onPointerLeave from pointerout
    act(() => { vi.advanceTimersByTime(DWELL_IN + 100) })
    flush()
    expect(root.getAttribute('data-focus')).toBe('')
  })
})

describe('FlavorWheel — the rest of the wheel stays visible while one family is framed', () => {
  it('a fly dims no family and hides no other family\'s labels (Daniel 2026-09-03)', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    fireEvent.click(screen.getByRole('button', { name: 'Fruity' }))
    flush(); flush()
    expect(root.getAttribute('data-focus')).toBe('Fruity')
    expect(root.querySelectorAll('.is-muted')).toHaveLength(0)
    // labels are display-toggled on settle; a neighbouring family's own label must not be switched off
    for (const fam of ['Roasted', 'Sweet']) {
      const label = root.querySelector<HTMLElement>(`.wheel-lw[data-key="${fam}"]`)!
      expect(label.style.display, fam).toBe('')
    }
  })
})

describe('FlavorWheel — bottom inset (the descriptors tray band)', () => {
  const translateY = (root: HTMLElement) => {
    const t = root.querySelector<HTMLElement>('.wheel-camera')!.style.transform
    return parseFloat(/translate\(-?[\d.]+px, (-?[\d.]+)px\)/.exec(t)![1])
  }
  const flyToBottomFamily = (inset: number) => {
    const r = render(<FlavorWheel picks={[]} onToggle={() => {}} insetBottom={inset} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    fireEvent.click(screen.getByRole('button', { name: 'Green/Vegetative' })); flush(); flush()
    const ty = translateY(root)
    r.unmount()
    return ty
  }

  it('a fly to a bottom family lands one tray-height higher when the tray band is declared', () => {
    const plain = flyToBottomFamily(0)
    const lifted = flyToBottomFamily(120)
    expect(lifted).toBeLessThan(plain)               // translate y is smaller → the scene moved UP
    expect(plain - lifted).toBeCloseTo(120, 3)       // exactly the band: the wheel box bottom now sits on the tray top
  })

  it('at rest the inset is exposed on the root and leaves the desktop camera untouched', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} insetBottom={90} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    expect(root.getAttribute('data-inset')).toBe('90')
    expect(root.querySelector<HTMLElement>('.wheel-camera')!.style.transform).toBe('translate(0px, 0px) scale(1)')
  })
})
