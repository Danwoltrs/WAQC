import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { PrintMenu, type PrintMenuProps } from './print-menu'
import type { PrintListEntry } from '@/lib/print-list'

const entry = (id: string, cert: string, sample: string, lab: string | null): PrintListEntry => ({
  id,
  certificate_number: cert,
  sample_id: sample,
  lab_source_sample_id: lab,
  client_name: 'Acme Roasters',
  contract_ref: 'C-100',
  buyer_id: null,
  seller_id: null,
})

function setup(over: Partial<PrintMenuProps> = {}) {
  const props: PrintMenuProps = {
    entries: [],
    today: { count: 3, loaded: true, error: null },
    onPrintTins: vi.fn(),
    onPrintBagSleeves: vi.fn(),
    onPrintToday: vi.fn(),
    onRemove: vi.fn(),
    onClear: vi.fn(),
    ...over,
  }
  render(<PrintMenu {...props} />)
  return props
}

const siblings = [entry('c1', 'SAG-011960/26', 's1', 'lot'), entry('c2', 'SAG-011961/26', 's2', 'lot')]

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('PrintMenu', () => {
  it('a tap opens it (iPads have no hover)', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /Print/ }))
    expect(await screen.findByText('Tin labels 4 cm')).toBeVisible()
  })

  it('a resting mouse opens it, and leaving closes it', () => {
    vi.useFakeTimers()
    setup()
    const trigger = screen.getByRole('button', { name: /Print/ })
    fireEvent.mouseEnter(trigger)
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(screen.getByText('Bag sleeves (6 per A4)')).toBeInTheDocument()
    fireEvent.mouseLeave(trigger)
    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(screen.queryByText('Bag sleeves (6 per A4)')).not.toBeInTheDocument()
  })

  it('shows the count and the tin dedupe', async () => {
    setup({ entries: siblings })
    fireEvent.click(screen.getByRole('button', { name: /Print/ }))
    expect(screen.getByRole('button', { name: 'Print · 2' })).toBeInTheDocument()
    expect(await screen.findByText('2 certificates → 1 tin')).toBeInTheDocument()
  })

  it("an empty list offers only today's batch", async () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: /Print/ }))
    expect(await screen.findByText('Tick certificates to add them')).toBeInTheDocument()
    for (const name of ['Tin labels 4 cm', 'Tin labels 2.5 cm', 'Bag sleeves (6 per A4)']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-disabled', 'true')
    }
    const today = screen.getByRole('button', { name: "Today's batch · 3" })
    expect(today).not.toBeDisabled()
    fireEvent.click(today)
    expect(props.onPrintToday).toHaveBeenCalled()
    expect(screen.queryByText('Clear list')).not.toBeInTheDocument()
  })

  it('an error disables today and shows the reason as title', async () => {
    setup({ today: { count: 0, loaded: true, error: 'boom' } })
    fireEvent.click(screen.getByRole('button', { name: /Print/ }))
    const b = await screen.findByRole('button', { name: "Today's batch unavailable" })
    expect(b).toBeDisabled()
    expect(b).toHaveAttribute('title', 'boom')
  })

  it('picks a size and closes', async () => {
    const props = setup({ entries: siblings })
    fireEvent.click(screen.getByRole('button', { name: /Print/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Tin labels 2.5 cm' }))
    expect(props.onPrintTins).toHaveBeenCalledWith('2.5cm')
    expect(screen.queryByText('Tin labels 2.5 cm')).not.toBeInTheDocument()
  })

  it('removes one certificate', async () => {
    const props = setup({ entries: siblings })
    fireEvent.click(screen.getByRole('button', { name: /Print/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove SAG-011960/26' }))
    expect(props.onRemove).toHaveBeenCalledWith('c1')
  })

  it('clears the list', async () => {
    const props = setup({ entries: siblings })
    fireEvent.click(screen.getByRole('button', { name: /Print/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Clear list' }))
    expect(props.onClear).toHaveBeenCalled()
  })
})
