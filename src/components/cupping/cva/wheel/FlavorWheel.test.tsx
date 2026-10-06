import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { FlavorWheel } from './FlavorWheel'
import { wedgeDomId } from './WheelScene'
import { NODES, CX, CY } from '@/lib/cva/flavor-wheel-data'
import { DWELL_IN, DWELL_OUT, DWELL_SWITCH, DWELL_REARM_PX } from './dwell'

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
/**
 * rAF timestamps that actually advance. vi.useFakeTimers does not move
 * performance.now() in this environment, so the loop's dt is ~0 and anything
 * that waits on time — the stick's repeat, a real spring — never happens. This
 * shim hands the loop 16 ms per frame, on performance.now()'s own time base so
 * the gesture machine's timestamps stay comparable.
 */
function frameClock() {
  let now = performance.now()
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => setTimeout(() => cb((now += 16)), 16)) as any
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
/** Where a scene point renders now, read off the camera's own transform (origin = the 440×440 root's centre). */
function sceneToScreen(root: HTMLElement, x: number, y: number) {
  const t = root.querySelector<HTMLElement>('.wheel-camera')!.style.transform
  const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(t)!
  const s = parseFloat(m[3])
  return { clientX: 220 + parseFloat(m[1]) + s * (x - 220), clientY: 220 + parseFloat(m[2]) + s * (y - 220) }
}
/** Scene point at `deg` clockwise from 12 o'clock and radius `r` — the wheel's own angle convention. */
const fromTop = (deg: number, r: number) => {
  const a = ((deg - 90) * Math.PI) / 180
  return [CX + Math.cos(a) * r, CY + Math.sin(a) * r] as const
}
const flush = () => act(() => { vi.advanceTimersByTime(50) })
/** The stick cursor's y on screen: it moves by transform (left/top re-laid it out every frame). */
const dotY = (dot: HTMLElement) => parseFloat(/translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(dot.style.transform)?.[2] ?? 'NaN')

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

  it('hover outlines the wedge on its own layer and leaves the scene untouched (a scene repaint per wedge crossing dropped a frame each time, 2026-10-06)', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    pev(root, 'pointermove', centroid('Nutty/Cocoa'))
    const outline = root.querySelector('.wheel-hover-path')!
    const wedgePath = screen.getByRole('button', { name: 'Nutty/Cocoa' }).querySelector('path')!
    expect(outline.getAttribute('data-key')).toBe('Nutty/Cocoa')
    expect(outline.getAttribute('d')).toBe(wedgePath.getAttribute('d'))
    expect(root.querySelectorAll('.wheel-scene .is-hover')).toHaveLength(0)
    pev(root, 'pointermove', { clientX: CX, clientY: CY })   // the hub: nothing hovered
    expect(outline.getAttribute('d') ?? '').toBe('')
    expect(outline.getAttribute('data-key') ?? '').toBe('')
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
    // the ring is drawn on the outline layer (a scene class re-rendered and re-laid out the scene per step)
    const ring = root.querySelector('.wheel-focus-path')!
    const focused = root.querySelector<SVGGElement>(`.wheel-wedge[data-key="${ring.getAttribute('data-key')}"]`)!
    expect(ring.getAttribute('d')).toBe(focused.querySelector('path')!.getAttribute('d'))
    expect(root.querySelectorAll('.wheel-scene .is-focus')).toHaveLength(0)
    expect(root.getAttribute('aria-activedescendant')).toBe(focused.id)
    const name = focused.getAttribute('aria-label')!
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

  it('a leaf hovers its FAMILY', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    pev(root, 'pointermove', centroid('Fruity>Citrus Fruit>Lemon'))
    act(() => { vi.advanceTimersByTime(DWELL_IN + 10) })
    flush()
    expect(root.getAttribute('data-focus')).toBe('Fruity')
  })

  it('a mouse that keeps moving across one family never flies; it flies once the pointer rests there (Daniel 2026-10-06: "mouse circling around makes it very laggy")', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    const sweep = ['Fruity>Berry>Blueberry', 'Fruity>Citrus Fruit>Lemon', 'Fruity>Other Fruit>Apple', 'Fruity>Dried Fruit>Raisin']
    for (let i = 0; i < 12; i++) {                          // 600 ms inside Fruity, one move every 50 ms
      pev(root, 'pointermove', centroid(sweep[i % sweep.length]))
      act(() => { vi.advanceTimersByTime(50) })
    }
    expect(root.getAttribute('data-focus')).toBe('')        // never rested, never flew
    act(() => { vi.advanceTimersByTime(DWELL_IN) })          // now it rests on the last wedge
    flush()
    expect(root.getAttribute('data-focus')).toBe('Fruity')
  })

  it('hand jitter of a few pixels still counts as resting', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    const at = centroid('Fruity')
    pev(root, 'pointermove', at)
    act(() => { vi.advanceTimersByTime(80) })
    pev(root, 'pointermove', { clientX: at.clientX + 3, clientY: at.clientY - 2 })
    act(() => { vi.advanceTimersByTime(80) })
    pev(root, 'pointermove', { clientX: at.clientX - 2, clientY: at.clientY + 3 })
    act(() => { vi.advanceTimersByTime(DWELL_IN - 160 + 10) })   // DWELL_IN after the FIRST move
    flush()
    expect(root.getAttribute('data-focus')).toBe('Fruity')
  })

  it('after a fly the wheel has moved under a still hand: a nudge onto the neighbour does not fly again, a deliberate move does', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    const at = centroid('Floral')
    pev(root, 'pointermove', at)
    act(() => { vi.advanceTimersByTime(DWELL_IN + 10) }); flush()
    expect(root.getAttribute('data-focus')).toBe('Floral')
    // Floral is framed at 1.5×; Fruity's first group (Berry) starts 16.9° from the top.
    const near = sceneToScreen(root, ...fromTop(18.5, 130))
    expect(Math.hypot(near.clientX - at.clientX, near.clientY - at.clientY)).toBeLessThan(DWELL_REARM_PX)
    pev(root, 'pointermove', near)
    act(() => { vi.advanceTimersByTime(DWELL_SWITCH + 50) }); flush()
    expect(root.getAttribute('data-focus')).toBe('Floral')
    const far = sceneToScreen(root, ...fromTop(40, 130))       // well inside Fruity, far from where the fly began
    pev(root, 'pointermove', far)
    act(() => { vi.advanceTimersByTime(DWELL_SWITCH + 10) }); flush()
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

describe('FlavorWheel — the thumbstick drives a cursor (Daniel 2026-09-09: "if I hold it down left, it should keep going down left, the further my thumb is from the center, the faster it goes")', () => {
  /** Compact + reduced motion: the stick renders, the camera snaps. frameClock() gives the loop 16 ms per frame. */
  function mountStick(onToggle: (p: unknown) => void = () => {}) {
    mockMedia(true, true)
    frameClock()
    const vibrate = vi.fn(() => true)
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true, writable: true })
    render(<FlavorWheel picks={[]} onToggle={onToggle} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    const well = root.querySelector('.wheel-stick')!
    const knob = root.querySelector('.wheel-stick-knob')!
    vi.spyOn(well, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 112, height: 112, right: 112, bottom: 112, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
    const grab = () => pev(knob, 'pointerdown', { clientX: 56, clientY: 56 })
    /** Full deflection is 28 px from the well centre (56 − knob/2); half is 14. */
    const push = (dir: 'up' | 'down' | 'left' | 'right', amount = 28) => {
      const at = dir === 'up' ? { clientX: 56, clientY: 56 - amount } : dir === 'down' ? { clientX: 56, clientY: 56 + amount } : dir === 'left' ? { clientX: 56 - amount, clientY: 56 } : { clientX: 56 + amount, clientY: 56 }
      pev(knob, 'pointermove', at)
    }
    const release = () => pev(knob, 'pointerup', { clientX: 56, clientY: 56 })
    const highlighted = () => root.getAttribute('aria-activedescendant')
    const cam = root.querySelector<HTMLElement>('.wheel-camera')!
    const dot = root.querySelector<HTMLElement>('.wheel-cursor')!
    return { root, knob, cam, dot, vibrate, grab, push, release, highlighted }
  }
  afterEach(() => { delete (navigator as unknown as { vibrate?: unknown }).vibrate })

  it('held up from rest, the cursor leaves the hub into Floral, lights it, ticks — and keeps going into its outer wedges, ticking at each', () => {
    const t = mountStick()
    t.grab()
    expect(t.dot.hidden).toBe(false)
    t.push('up')
    for (let i = 0; i < 9; i++) flush()      // 27 frames × 2.4 units: past the 58-unit hub into the family ring
    expect(t.highlighted()).toBe(wedgeDomId('Floral'))
    expect(t.root.querySelector('.wheel-focus-path')!.getAttribute('data-key')).toBe('Floral')
    expect(t.root.getAttribute('data-stick')).toBe('1')   // the outline layer is promoted while the knob is held
    expect(t.vibrate).toHaveBeenCalledTimes(1)
    expect(t.root.getAttribute('data-focus')).toBe('')   // highlighted, not selected
    for (let i = 0; i < 21; i++) flush()     // held on: out through the rings to the rim
    const id = t.highlighted()!
    const wedge = t.root.querySelector('#' + id)!
    expect(wedge.getAttribute('aria-label')!.startsWith('Floral / ')).toBe(true)
    expect(t.vibrate.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('the further the thumb, the faster: half deflection covers less ground than full in the same time', () => {
    const a = mountStick()
    a.grab(); a.push('up', 14)
    for (let i = 0; i < 10; i++) flush()
    const halfTop = dotY(a.dot)
    a.release()
    // fresh mount for the full push so both start from the hub
    document.body.innerHTML = ''
    const b = mountStick()
    b.grab(); b.push('up', 28)
    for (let i = 0; i < 10; i++) flush()
    const fullTop = dotY(b.dot)
    expect(Number.isFinite(halfTop) && Number.isFinite(fullTop)).toBe(true)
    expect(fullTop).toBeLessThan(halfTop)   // higher on the glass = travelled further up
    expect(halfTop).toBeLessThan(220)       // and half did move
  })

  it('held into the rim the cursor stops there and the loop rests', () => {
    const t = mountStick()
    t.grab(); t.push('up')
    for (let i = 0; i < 40; i++) flush()
    expect(t.highlighted()).toBe(wedgeDomId('Floral>Black Tea'))   // the wedge on the rim straight up
    expect(t.cam.style.willChange).toBe('')
  })

  it('letting the knob go selects what is under the cursor: a family flies in, and inside it a wedge toggles a pick', () => {
    const onToggle = vi.fn()
    const t = mountStick(onToggle)
    t.grab(); t.push('up')
    for (let i = 0; i < 9; i++) flush()
    expect(t.highlighted()).toBe(wedgeDomId('Floral'))
    t.release(); flush(); flush()
    expect(t.dot.hidden).toBe(true)
    expect(t.root.getAttribute('data-focus')).toBe('Floral')
    expect(onToggle).not.toHaveBeenCalled()
    t.grab(); t.push('up')                    // outward from the family wedge (the cursor restarts on its centroid)
    for (let i = 0; i < 8; i++) flush()
    const id = t.highlighted()!
    const label = t.root.querySelector('#' + id)!.getAttribute('aria-label')!
    expect(label.startsWith('Floral / ')).toBe(true)   // one of Floral's own groups or leaves
    t.release(); flush()
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle.mock.calls[0][0]).toEqual({ path: label.split(' / ') })
  })

  it('released over a leaf of an unframed family, it frames the FAMILY and keeps the leaf highlighted — the next release picks it', () => {
    const onToggle = vi.fn()
    const t = mountStick(onToggle)
    t.grab(); t.push('up')
    for (let i = 0; i < 30; i++) flush()
    expect(t.highlighted()).toBe(wedgeDomId('Floral>Black Tea'))
    t.release(); flush(); flush()
    expect(t.root.getAttribute('data-focus')).toBe('Floral')
    expect(t.highlighted()).toBe(wedgeDomId('Floral>Black Tea'))
    expect(onToggle).not.toHaveBeenCalled()
    t.grab(); t.push('down'); flush(); flush()   // a nudge inward, still on the same wedge
    t.release(); flush()
    expect(onToggle).toHaveBeenCalledWith({ path: ['Floral', 'Black Tea'] })
  })

  it('a knob taken and let go without moving selects nothing', () => {
    const onToggle = vi.fn()
    const t = mountStick(onToggle)
    t.grab(); t.release(); flush()
    expect(t.root.getAttribute('data-focus')).toBe('')
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('a tap on the glass while the knob is held selects what is under the cursor, not the wedge under the finger — and the release then selects nothing more', () => {
    const onToggle = vi.fn()
    const t = mountStick(onToggle)
    t.grab(); t.push('up')
    for (let i = 0; i < 9; i++) flush()
    expect(t.highlighted()).toBe(wedgeDomId('Floral'))
    tap(t.root, centroid('Sweet'), 'touch')
    t.push('up', 0)                           // thumb back to centre: the cursor stops where it is
    flush()
    expect(t.root.getAttribute('data-focus')).toBe('Floral')
    t.release(); flush()
    expect(t.root.getAttribute('data-focus')).toBe('Floral')
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('… but a stick still pushed after that tap keeps the cursor going, and the release selects again — release always selects a hold that moved', () => {
    const onToggle = vi.fn()
    const t = mountStick(onToggle)
    t.grab(); t.push('up')
    for (let i = 0; i < 9; i++) flush()
    tap(t.root, centroid('Sweet'), 'touch'); flush()   // frames Floral; the thumb stays up
    expect(t.root.getAttribute('data-focus')).toBe('Floral')
    t.release(); flush()
    expect(onToggle).toHaveBeenCalledTimes(1)          // whatever the cursor reached inside Floral
    expect(onToggle.mock.calls[0][0].path[0]).toBe('Floral')
  })
})

describe('FlavorWheel — a compact wheel rests zoomed in (REST_SCALE_MOBILE)', () => {
  it('rests at 1.7× even when its size is only known after the screen class is (fonts load late on a phone)', async () => {
    mockMedia(true, true)
    let fontsReady!: () => void
    const ready = new Promise<void>((r) => { fontsReady = r })
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready } })
    try {
      render(<FlavorWheel picks={[]} onToggle={() => {}} />)
      const cam = screen.getByTestId('flavor-wheel-stage').querySelector<HTMLElement>('.wheel-camera')!
      flush()                                   // the compact answer arrives; the root is not measured yet
      await act(async () => { fontsReady(); await ready })
      flush()
      expect(cam.style.transform).toMatch(/scale\(1\.7\)$/)
    } finally {
      delete (document as unknown as { fonts?: unknown }).fonts
    }
  })
})

describe('FlavorWheel — a moving mouse costs nothing (Daniel 2026-10-06: "mouse circling around makes it very laggy, and low FPS")', () => {
  /** Real spring + edge pan (no reduced motion); Fruity framed and settled. */
  function framed() {
    mockMedia(false, false)
    frameClock()
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    const cam = root.querySelector<HTMLElement>('.wheel-camera')!
    flush()
    fireEvent.click(screen.getByRole('button', { name: 'Fruity' }))
    for (let i = 0; i < 60; i++) flush()
    expect(cam.style.willChange).toBe('')   // settled
    return { root, cam }
  }

  it('a mouse moving over a framed wheel away from its edges does not wake the frame loop', () => {
    const { root, cam } = framed()
    pev(root, 'pointermove', { clientX: CX, clientY: CY })
    expect(cam.style.willChange).toBe('')
  })

  it('a hand crossing the edge band on its way out does not pan the wheel', () => {
    const { root, cam } = framed()
    const before = cam.style.transform
    pev(root, 'pointermove', { clientX: 8, clientY: 220 })      // into the left band ...
    act(() => { vi.advanceTimersByTime(60) })
    pev(root, 'pointerout', { clientX: -5, clientY: 220 })     // ... and straight out
    for (let i = 0; i < 6; i++) flush()
    expect(cam.style.transform).toBe(before)
  })
})

describe('FlavorWheel — review fixes 2026-10-06', () => {
  it('after an edge pan has slid the wheel under a parked hand, a nudge does not fly to what slid under it', () => {
    mockMedia(false, false); frameClock()
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    const cam = root.querySelector<HTMLElement>('.wheel-camera')!
    flush()
    fireEvent.click(screen.getByRole('button', { name: 'Fruity' }))
    for (let i = 0; i < 60; i++) flush()
    pev(root, 'pointermove', { clientX: 40, clientY: 200 })   // parked in the left band
    for (let i = 0; i < 100; i++) flush()                      // pans to the clamp and settles
    expect(cam.style.willChange).toBe('')
    expect(root.getAttribute('data-focus')).toBe('Fruity')
    pev(root, 'pointermove', { clientX: 43, clientY: 200 })   // a 3 px nudge
    act(() => { vi.advanceTimersByTime(DWELL_SWITCH + 10) }); flush()
    expect(root.getAttribute('data-focus')).toBe('Fruity')
  })

  it('a dwell already counting does not survive an Escape zoom-out under a still mouse', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    fireEvent.click(screen.getByRole('button', { name: 'Fruity' })); flush()
    pev(root, 'pointermove', sceneToScreen(root, ...fromTop(340, 82)))   // Sweet's family wedge, framed view
    act(() => { vi.advanceTimersByTime(100) })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(root.getAttribute('data-focus')).toBe('')
    act(() => { vi.advanceTimersByTime(DWELL_SWITCH) }); flush()
    expect(root.getAttribute('data-focus')).toBe('')
  })

  it('the corner pill goes away the moment it is pressed (no "Whole wheel" relabel during the zoom-out) and hands focus to the wheel', () => {
    mockMedia(false, false); frameClock()
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    fireEvent.click(screen.getByRole('button', { name: 'Fruity' }))
    for (let i = 0; i < 60; i++) flush()
    const back = screen.getByRole('button', { name: 'Zoom out of Fruity' })
    back.focus()
    fireEvent.click(back)
    expect(screen.queryByRole('button', { name: /zoom out/i })).toBeNull()
    expect(document.activeElement).toBe(root)
  })

  it('a host zoom-out request (the side panel button) zooms out and hands focus to the wheel', () => {
    const { rerender } = render(<FlavorWheel picks={[]} onToggle={() => {}} chrome="external" />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    fireEvent.click(screen.getByRole('button', { name: 'Fruity' })); flush()
    rerender(<FlavorWheel picks={[]} onToggle={() => {}} chrome="external" zoomOutRequests={1} />)
    expect(root.getAttribute('data-focus')).toBe('')
    expect(document.activeElement).toBe(root)
  })
})

describe('FlavorWheel — hover touches one element', () => {
  it('the pointer cursor is set on the glass over the wheel, never on the root (an inherited style there restyles every node of the wheel)', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    fireEvent.click(screen.getByRole('button', { name: 'Fruity' })); flush()
    pev(root, 'pointermove', { clientX: CX, clientY: CY })     // after the fly the centre is Fruity's own wedge
    const glass = root.querySelector<HTMLElement>('.wheel-glass')
    expect(glass?.style.cursor).toBe('pointer')
    expect(root.style.cursor).toBe('')
  })
})

describe('FlavorWheel — nothing sits on the wedges (Daniel 2026-10-06: "when we mouse over the lower part of the wheel, we cant see the buttons")', () => {
  it('with its chrome outside (the desktop side panel) the wheel draws no back pill and no counter, reports its frame, and zooms out on request', () => {
    const frames: Array<{ family: string | null; zoomed: boolean }> = []
    const onFrameChange = (f: { family: string | null; zoomed: boolean }) => { frames.push(f) }
    const { rerender } = render(<FlavorWheel picks={[]} onToggle={() => {}} chrome="external" onFrameChange={onFrameChange} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    expect(root.querySelector('.wheel-back')).toBeNull()
    expect(root.querySelector('.wheel-counter')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Fruity' })); flush()
    expect(frames[frames.length - 1]).toEqual({ family: 'Fruity', zoomed: true })
    expect(root.querySelector('.wheel-back')).toBeNull()
    rerender(<FlavorWheel picks={[]} onToggle={() => {}} chrome="external" onFrameChange={onFrameChange} zoomOutRequests={1} />)
    flush()
    expect(root.getAttribute('data-focus')).toBe('')
    expect(frames[frames.length - 1]).toEqual({ family: null, zoomed: false })
  })

  it('the corner pill is named for what it does, not after the family wedge it would otherwise share a name with', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    flush()
    fireEvent.click(screen.getByRole('button', { name: 'Fruity' })); flush()
    expect(screen.getAllByRole('button', { name: 'Fruity' })).toHaveLength(1)   // the wedge only
    expect(screen.getByRole('button', { name: 'Zoom out of Fruity' })).toBeTruthy()
  })

  it('zoomed with no family framed, the corner pill takes the cupper back to the whole wheel; there is no pill in the middle of the wheel', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    fireEvent.wheel(root, { deltaY: -400, ctrlKey: true, clientX: CX, clientY: CY })   // a trackpad pinch in
    flush()
    expect(root.getAttribute('data-zoomed')).toBe('1')
    expect(root.querySelector('.wheel-home')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /whole wheel/i }))
    flush()
    expect(root.getAttribute('data-zoomed')).toBe('0')
  })
})

describe('FlavorWheel — the loop\'s first frame integrates (the bug that made the stick and the edge pan dead at rest)', () => {
  it('a mouse parked in the edge band of a framed wheel pans it', () => {
    mockMedia(false, false)   // real spring, no reduced motion (edge pan is off under reduced motion)
    frameClock()
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    const cam = root.querySelector<HTMLElement>('.wheel-camera')!
    flush()
    fireEvent.click(screen.getByRole('button', { name: 'Fruity' }))
    for (let i = 0; i < 60; i++) flush()
    expect(cam.style.willChange).toBe('')   // the fly has settled
    const before = cam.style.transform
    // Fruity sits to the right, already at the clamp — park the mouse in the LEFT band
    pev(root, 'pointermove', { clientX: 8, clientY: 220, pointerType: 'mouse' })
    for (let i = 0; i < 6; i++) flush()
    expect(cam.style.transform).not.toBe(before)
    // the mouse rests over Spices out there, but a hand parked in the band is panning, not choosing
    expect(root.getAttribute('data-focus')).toBe('Fruity')
  })
})
