import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { PartyChoice } from './party-choice'
import type { PartyOption } from '@/lib/approval-notification/certificate-parties'
import { ALL_PARTIES, type CertificateParty } from '@/lib/approval-notification/types'

// Radix checkboxes are buttons: read state from aria-checked / disabled.
const box = (name: RegExp | string) => {
  const el = screen.getByRole('checkbox', { name }) as HTMLButtonElement
  return { checked: el.getAttribute('aria-checked') === 'true', disabled: el.disabled }
}
const click = (name: RegExp | string) => fireEvent.click(screen.getByRole('checkbox', { name }))

function Harness({ options, initial }: { options?: PartyOption[]; initial?: CertificateParty[] }) {
  const [value, setValue] = useState<CertificateParty[]>(initial ?? [...ALL_PARTIES])
  return <PartyChoice value={value} onChange={setValue} options={options} />
}

describe('PartyChoice', () => {
  it('starts with All parties and every party ticked, and the client cannot be unticked', () => {
    render(<Harness />)
    expect(box('All parties').checked).toBe(true)
    for (const n of ['Client', 'Importer', 'Roaster', 'Seller']) expect(box(n).checked).toBe(true)
    expect(box('Client').disabled).toBe(true)
  })

  it('unticking All parties leaves only the client; re-ticking restores all', () => {
    render(<Harness />)
    click('All parties')
    expect(box('Client').checked).toBe(true)
    for (const n of ['Importer', 'Roaster', 'Seller']) expect(box(n).checked).toBe(false)
    click('All parties')
    for (const n of ['Importer', 'Roaster', 'Seller']) expect(box(n).checked).toBe(true)
  })

  it('unticking one party unticks All parties', () => {
    render(<Harness />)
    click('Roaster')
    expect(box('All parties').checked).toBe(false)
    expect(box('Importer').checked).toBe(true)
  })
})

const dunkin: PartyOption[] = [
  { party: 'seller', companies: [{ id: 'ldc', name: 'LDC Suisse' }] },
  { party: 'importer', companies: [{ id: 'imp', name: 'Olam' }] },
  { party: 'roaster', companies: [{ id: 'roa', name: 'Roaster Co' }] },
  { party: 'buyer', companies: [{ id: 'd', name: "Dunkin'" }] },
]

describe('PartyChoice with options', () => {
  it('lists the given parties in order with company names', () => {
    render(<Harness options={dunkin} initial={['buyer', 'importer', 'roaster', 'seller']} />)
    expect(screen.getAllByRole('checkbox').map((c) => c.closest('label')!.textContent)).toEqual([
      'All parties',
      'Seller · LDC Suisse',
      'Importer · Olam',
      'Roaster · Roaster Co',
      "Client · Dunkin'",
    ])
  })

  it('shows only listed parties', () => {
    render(<Harness options={[dunkin[0], dunkin[3]]} initial={['buyer', 'seller']} />)
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
  })

  it('names more than two companies as two plus "+N"', () => {
    render(
      <Harness
        options={[{ party: 'buyer', companies: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }] }]}
        initial={['buyer']}
      />,
    )
    expect(screen.getByText('Client · A, B +1')).toBeInTheDocument()
  })

  it('unticking Roaster emits buyer, importer, seller', async () => {
    const onChange = vi.fn()
    render(<PartyChoice options={dunkin} value={['buyer', 'importer', 'roaster', 'seller']} onChange={onChange} />)
    await userEvent.click(screen.getByLabelText('Roaster · Roaster Co'))
    expect(onChange).toHaveBeenLastCalledWith(['buyer', 'importer', 'seller'])
  })

  it('the client cannot be unticked', () => {
    render(<Harness options={dunkin} initial={['buyer']} />)
    expect(screen.getByLabelText("Client · Dunkin'")).toBeDisabled()
  })

  it('without a client row nothing is disabled and All parties toggles only the listed parties', async () => {
    const onChange = vi.fn()
    render(<PartyChoice options={[dunkin[0], dunkin[1]]} value={['seller', 'importer']} onChange={onChange} />)
    for (const c of screen.getAllByRole('checkbox')) expect(c).not.toBeDisabled()
    await userEvent.click(screen.getByLabelText('All parties'))
    expect(onChange).toHaveBeenLastCalledWith([])
  })
})
