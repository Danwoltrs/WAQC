import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * The picker (/cupping/cva) renders without the app shell — no sidebar, no
 * app header — so until 2026-09-17 the only way back out was the browser's
 * Back button. It now carries the journey's header: a breadcrumb trail from
 * a desk and a back chevron on a phone, both leading to Cupping.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}))

// The intake is its own tested form; here it stands in as a button that
// saves a lot the way the real one reports it: its lab number and its id.
const intakeProps: Array<Record<string, any>> = []
vi.mock('@/components/samples/sample-intake-dialog', () => ({
  SampleIntakeDialog: (props: any) => {
    intakeProps.push(props)
    return props.open ? (
      <div role="dialog" aria-label="New specialty sample">
        <button type="button" onClick={() => props.onSuccess?.('SAN-00999/26', 's-new')}>Save the lot</button>
      </div>
    ) : null
  },
}))

import CvaIndexPage from './page'

afterEach(() => { vi.unstubAllGlobals() })

async function renderPicker(samples: unknown[] = []) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ samples }) })))
  render(<CvaIndexPage />)
  await screen.findByText(samples.length ? /selected$/ : /no specialty samples waiting/i)
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

// Daniel 2026-10-07, on an empty picker: "add a add sample button here, which
// will only add specialty samples".
describe('CVA picker Add sample', () => {
  it('opens the intake for specialty lots only, from an empty picker too', async () => {
    intakeProps.length = 0
    await renderPicker()
    fireEvent.click(screen.getByRole('button', { name: 'Add sample' }))
    expect(await screen.findByRole('dialog', { name: 'New specialty sample' })).toBeInTheDocument()
    expect(intakeProps.at(-1)).toMatchObject({ open: true, specialtyOnly: true })
  })

  it('shows the new lot selected, and never its lab number', async () => {
    let saved = false
    const newLot = { id: 's-new', reference: 'SL 1201/26', reference_slug: 'SL_1201_26' }
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ samples: saved ? [newLot] : [] }) })))
    render(<CvaIndexPage />)
    await screen.findByText(/no specialty samples waiting/i)

    fireEvent.click(screen.getByRole('button', { name: 'Add sample' }))
    saved = true
    fireEvent.click(await screen.findByRole('button', { name: 'Save the lot' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // Selected: its tick is part of the row's name.
    expect(await screen.findByRole('button', { name: /SL 1201\/26/ })).toHaveTextContent('✓')
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start cupping' })).toBeEnabled()
    expect(screen.queryByText(/SAN-/)).toBeNull()
  })

  it('stays on the list once there are lots', async () => {
    await renderPicker([{ id: 's1', reference: 'BR-1/26', reference_slug: 'BR-1_26' }])
    expect(screen.getByRole('button', { name: 'Add sample' })).toBeInTheDocument()
  })
})
