import '@testing-library/jest-dom/vitest'

// jsdom lacks the pointer-capture / layout APIs that Radix Popover + cmdk call
// when opening. Stub them so combobox (SearchableSelect) interactions work under test.
if (typeof window !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {}
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {}
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
  if (!('ResizeObserver' in window)) {
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class
    ;(window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
}
