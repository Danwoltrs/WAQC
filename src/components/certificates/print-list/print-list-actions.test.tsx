import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PrintListPrintActions, PrintListReview, type PrintListActionsProps } from './print-list-actions'
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
  include_qr: true,
})

function setup(over: Partial<PrintListActionsProps> = {}) {
  const props: PrintListActionsProps = {
    entries: siblings,
    ready: true,
    onPrintTins: vi.fn(),
    onPrintBagSleeves: vi.fn(),
    onRemove: vi.fn(),
    ...over,
  }
  render(
    <>
      <PrintListReview {...props} />
      <PrintListPrintActions {...props} />
    </>,
  )
  return props
}

// Two contract siblings of one lot: two certificates, one tin.
const siblings = [entry('c1', 'SAG-011960/26', 's1', 'lot'), entry('c2', 'SAG-011961/26', 's2', 'lot')]

const tinLabels = () => screen.getByRole('button', { name: 'Tin labels' })

describe('PrintListPrintActions', () => {
  it('Tin labels opens on a click and hands back the size picked', async () => {
    const props = setup()
    await userEvent.click(tinLabels())
    await userEvent.click(await screen.findByRole('menuitem', { name: '2.5 cm' }))
    await waitFor(() => expect(props.onPrintTins).toHaveBeenCalledWith('2.5cm'))
    expect(screen.queryByRole('menuitem', { name: '2.5 cm' })).not.toBeInTheDocument()
  })

  // R6: the size dialog opens only after the modal menu has closed and released the page.
  it('a picked size reaches the page on the next tick, not while the menu is closing', () => {
    vi.useFakeTimers()
    try {
      const props = setup()
      fireEvent.keyDown(tinLabels(), { key: 'Enter' })
      fireEvent.click(screen.getByRole('menuitem', { name: '4 cm' }))
      expect(props.onPrintTins).not.toHaveBeenCalled()
      act(() => { vi.runAllTimers() })
      expect(props.onPrintTins).toHaveBeenCalledWith('4cm')
    } finally {
      vi.useRealTimers()
    }
  })

  it('a disabled Tin labels still shows its title on hover', () => {
    setup({ ready: false })
    expect(tinLabels()).toHaveClass('disabled:pointer-events-auto')
  })

  it('Tin labels offers 4 cm and 2.5 cm, and says how many tins the list makes', async () => {
    setup()
    expect(tinLabels()).toHaveAttribute('title', '2 certificates → 1 tin')
    await userEvent.click(tinLabels())
    expect((await screen.findAllByRole('menuitem')).map((m) => m.textContent)).toEqual(['4 cm', '2.5 cm'])
  })

  it('Bag sleeves prints straight away', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Bag sleeves' }))
    expect(props.onPrintBagSleeves).toHaveBeenCalled()
  })

  it('both are 28px outline buttons', () => {
    setup()
    for (const b of [tinLabels(), screen.getByRole('button', { name: 'Bag sleeves' })]) {
      expect(b).toHaveClass('h-7', 'border')
    }
  })

  it('until the list is ready, nothing that acts on it can be pressed', async () => {
    const props = setup({ ready: false })
    expect(tinLabels()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Bag sleeves' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'View list' }))
    for (const name of ['Remove SAG-011960/26', 'Remove SAG-011961/26']) {
      const remove = screen.getByRole('button', { name })
      expect(remove).toBeDisabled()
      fireEvent.click(remove)
    }
    expect(props.onRemove).not.toHaveBeenCalled()
  })
})

describe('PrintListReview', () => {
  it('lists each certificate with its client and contract, and the tin dedupe', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'View list' }))
    expect(await screen.findByText('2 certificates → 1 tin')).toBeInTheDocument()
    expect(screen.getByText('SAG-011960/26')).toBeInTheDocument()
    expect(screen.getAllByText('Acme Roasters · C-100')).toHaveLength(2)
  })

  it('removes one certificate', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'View list' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Remove SAG-011960/26' }))
    expect(props.onRemove).toHaveBeenCalledWith('c1')
  })

  it('the remove button is a 28px target with a focus ring', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'View list' }))
    const remove = await screen.findByRole('button', { name: 'Remove SAG-011960/26' })
    expect(remove).toHaveClass('h-7', 'w-7', 'items-center', 'justify-center', 'focus-visible:ring-2', 'focus-visible:ring-ring')
  })
})
