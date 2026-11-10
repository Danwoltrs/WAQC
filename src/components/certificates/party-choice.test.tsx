import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { PartyChoice, PartyStep } from './party-choice'
import { ALL_PARTIES, type CertificateParty } from '@/lib/approval-notification/types'

const box = (name: RegExp | string) => screen.getByRole('checkbox', { name }) as HTMLInputElement

function Harness() {
  const [value, setValue] = useState<CertificateParty[]>([...ALL_PARTIES])
  return <PartyChoice value={value} onChange={setValue} />
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
    fireEvent.click(box('All parties'))
    expect(box('Client').checked).toBe(true)
    for (const n of ['Importer', 'Roaster', 'Seller']) expect(box(n).checked).toBe(false)
    fireEvent.click(box('All parties'))
    for (const n of ['Importer', 'Roaster', 'Seller']) expect(box(n).checked).toBe(true)
  })

  it('unticking one party unticks All parties', () => {
    render(<Harness />)
    fireEvent.click(box('Roaster'))
    expect(box('All parties').checked).toBe(false)
    expect(box('Importer').checked).toBe(true)
  })
})

describe('PartyStep', () => {
  it('has Include already sent off by default and passes it on', () => {
    const onContinue = vi.fn()
    render(<PartyStep count={2} onContinue={onContinue} />)
    expect(box(/include already sent/i).checked).toBe(false)
    expect(screen.getByText('2 certificates selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onContinue).toHaveBeenLastCalledWith(['buyer', 'importer', 'roaster', 'seller'], false)
    fireEvent.click(box(/include already sent/i))
    fireEvent.click(box('Seller'))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onContinue).toHaveBeenLastCalledWith(['buyer', 'importer', 'roaster'], true)
  })
})
