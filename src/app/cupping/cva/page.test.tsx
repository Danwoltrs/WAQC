import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * The picker (/cupping/cva) renders without the app shell — no sidebar, no
 * app header — so until 2026-09-17 the only way back out was the browser's
 * Back button. It now carries the journey's header: a breadcrumb trail from
 * a desk and a back chevron on a phone, both leading to Cupping.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}))

import CvaIndexPage from './page'

afterEach(() => { vi.unstubAllGlobals() })

async function renderPicker(samples: unknown[] = []) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ samples }) })))
  render(<CvaIndexPage />)
  await screen.findByText(samples.length ? /selected$/ : /no specialty samples yet/i)
}

describe('CVA picker breadcrumbs', () => {
  it('offers a way back out of a shell-less route: a trail from a desk, a chevron on a phone', async () => {
    await renderPicker()
    expect(screen.getByRole('link', { name: 'Cupping' })).toHaveAttribute('href', '/cupping')
    expect(screen.getByRole('link', { name: 'Back to Cupping' })).toHaveAttribute('href', '/cupping')
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(trail).toHaveTextContent('Cupping/Specialty (CVA)')
    // The current page is the trail's end, not a link to itself.
    expect(screen.queryByRole('link', { name: 'Specialty (CVA)' })).toBeNull()
  })

  it('keeps the list and its Start button under the header', async () => {
    await renderPicker([{ id: 's1', reference: 'BR-1/26', reference_slug: 'BR-1_26' }])
    expect(screen.getByRole('button', { name: 'BR-1/26' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start cupping' })).toBeDisabled()
  })
})
