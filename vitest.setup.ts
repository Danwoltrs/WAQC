import '@testing-library/jest-dom/vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// react-pdf downloads Inter from fonts.gstatic.com at render time, which makes
// PDF render tests depend on outbound network from the node binary (blocked on
// some machines even when curl works). Serve a local TTF for font requests so
// renders are deterministic and offline-safe. Test-only; glyph fidelity is
// irrelevant to what the render tests assert.
const LOCAL_TTF = join(
  process.cwd(),
  'node_modules/next/dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf',
)
if (existsSync(LOCAL_TTF)) {
  const realFetch = globalThis.fetch.bind(globalThis)
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.includes('fonts.gstatic.com')) {
      return new Response(readFileSync(LOCAL_TTF), {
        status: 200,
        headers: { 'Content-Type': 'font/ttf' },
      })
    }
    return realFetch(input, init)
  }) as typeof fetch
}

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
