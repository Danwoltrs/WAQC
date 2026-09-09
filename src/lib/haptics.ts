// One haptic tick for every touch surface of the CVA journey: the impression
// row and the intensity track as they cross an integer, the wheel's stick
// cursor as it crosses a wedge, a pick, a refusal.
//
// Android Chrome has navigator.vibrate. iOS Safari has NO vibrate API, but from
// iOS 17.4 toggling an <input type="checkbox" switch> plays the system switch
// haptic — the trick the ios-haptics / use-haptic packages rely on. iOS honours
// it only from inside a trusted user event, so a tick that arrives from the
// rAF loop (the stick cursor crossing a wedge) is QUEUED and played on the very
// next touch event the page sees; several queued ticks play once. Everywhere
// else this is a silent no-op. It never throws: haptics are a courtesy.

export const IOS_SWITCH_ID = 'waqc-haptic-switch'

let sw: HTMLInputElement | null = null
let pending = 0
let flushArmed = false

function iosSwitch(): HTMLInputElement | null {
  if (typeof document === 'undefined') return null
  if (sw?.isConnected) return sw
  const existing = document.getElementById(IOS_SWITCH_ID)
  if (existing instanceof HTMLInputElement) return (sw = existing)
  const el = document.createElement('input')
  el.type = 'checkbox'
  el.setAttribute('switch', '')
  el.id = IOS_SWITCH_ID
  el.tabIndex = -1
  el.setAttribute('aria-hidden', 'true')
  // Rendered but invisible — not display:none — in case the haptic needs a laid-out control.
  el.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;margin:0;opacity:0;pointer-events:none'
  document.body.appendChild(el)
  return (sw = el)
}

/** True while a trusted (user-initiated) event is being dispatched. */
function inTrustedEvent(): boolean {
  try {
    const e = (window as unknown as { event?: { isTrusted?: boolean } }).event
    return !!(e && e.isTrusted)
  } catch { return false }
}

function playSwitch(): void { iosSwitch()?.click() }

/** Play whatever was queued on the next touch or pointer event, capture phase, once per event. */
function armFlush(): void {
  if (flushArmed || typeof document === 'undefined') return
  flushArmed = true
  const flush = () => { if (pending > 0) { pending = 0; playSwitch() } }
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend']) {
    document.addEventListener(type, flush, { capture: true, passive: true })
  }
}

export function haptic(pattern: number | number[]): void {
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : null
    if (nav && typeof nav.vibrate === 'function') { nav.vibrate(pattern); return }
    if (typeof document === 'undefined') return
    if (inTrustedEvent()) { playSwitch(); return }
    iosSwitch()   // planted now, so the flush has nothing to build mid-gesture
    pending += 1
    armFlush()
  } catch { /* no haptics here */ }
}

/** Crossing an integer, the cursor entering a wedge: the "tac". */
export const hapticTick = (): void => haptic(5)
/** A pick landed. */
export const hapticSelect = (): void => haptic(8)
/** A tap that did nothing (the cap). */
export const hapticRefuse = (): void => haptic([12, 40, 12])
