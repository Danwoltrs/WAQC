// One haptic tick for every touch surface of the CVA journey: the impression
// row and the intensity track as they cross an integer, the wheel's stick as
// it steps from wedge to wedge, a pick, a refusal.
//
// Android Chrome has navigator.vibrate. iOS Safari has NO vibrate API, but from
// iOS 17.4 toggling an <input type="checkbox" switch> plays the system switch
// haptic, and a programmatic click on its <label> from inside a user-gesture
// handler counts — the trick the ios-haptics / use-haptic packages rely on.
// Everywhere else this is a silent no-op. It never throws: haptics are a
// courtesy, never a failure.

export const IOS_SWITCH_ID = 'waqc-haptic-switch'

let label: HTMLLabelElement | null = null

function iosSwitchLabel(): HTMLLabelElement | null {
  if (typeof document === 'undefined') return null
  if (label?.isConnected) return label
  const existing = document.getElementById(IOS_SWITCH_ID)
  if (existing?.parentElement instanceof HTMLLabelElement) return (label = existing.parentElement)
  const l = document.createElement('label')
  l.setAttribute('aria-hidden', 'true')
  l.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none'
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.setAttribute('switch', '')
  input.id = IOS_SWITCH_ID
  input.tabIndex = -1
  l.appendChild(input)
  document.body.appendChild(l)
  return (label = l)
}

export function haptic(pattern: number | number[]): void {
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : null
    if (nav && typeof nav.vibrate === 'function') { nav.vibrate(pattern); return }
    iosSwitchLabel()?.click()
  } catch { /* no haptics here */ }
}

/** Crossing an integer, stepping to the next wedge: the "tac". */
export const hapticTick = (): void => haptic(5)
/** A pick landed. */
export const hapticSelect = (): void => haptic(8)
/** A tap that did nothing (the cap). */
export const hapticRefuse = (): void => haptic([12, 40, 12])
