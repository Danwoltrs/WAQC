// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SellerRequestState } from '@/lib/seller-requests/store'
import type { SellerRequests } from '@/lib/seller-requests/types'
import { SellerRequestRows, stateMembers } from './seller-request-ticks'

afterEach(cleanup)

const dest = {
  companyId: 'co', companyName: 'Blaser Trading', savedAddressId: null,
  lines: ['Street 1', 'Zurich'], country: 'Switzerland', recipientName: null,
  attention: null, phone: null, instructions: null,
}
const none = { locked: false, on: false, reason: null }
const req = (over: Partial<SellerRequests> = {}): SellerRequests => ({
  buyerSample: null, finalClientSample: null, stuffing: false, additionalSample: false, ssPerContainer: false, setBy: null, setAt: null, ...over,
})
const member = (id: string, contract: string, client: string, locks: any, requests: SellerRequests) =>
  ({
    sampleId: id, contractNumber: contract, clientId: `co-${client}`, clientName: client,
    importerId: null, roasterId: null, locks, requests,
  }) as unknown as SellerRequestState

const members = [
  member('a', 'C-1', 'Blaser', { buyerSample: { locked: true, on: true, reason: 'Blaser: sample always goes' }, stuffing: none }, req({ buyerSample: dest })),
  member('b', 'C-2', 'Ahold', { buyerSample: { locked: true, on: false, reason: 'Ahold: Wolthers has the final word' }, stuffing: none }, req()),
]
const value = { a: members[0].requests, b: members[1].requests }

/** The modal's way: the parent owns the value and the pending set. */
function Harness({ list, disabled }: { list: SellerRequestState[]; disabled?: boolean }) {
  const [v, setV] = useState<Record<string, SellerRequests>>(() =>
    Object.fromEntries(list.map((m) => [m.sampleId, m.requests])),
  )
  const [pending, setPending] = useState<Set<string>>(() => new Set())
  return (
    <SellerRequestRows
      members={stateMembers(list)}
      value={v}
      onChange={setV}
      pending={pending}
      onPendingChange={setPending}
      disabled={disabled}
    />
  )
}

const rows = (list: SellerRequestState[], v: Record<string, SellerRequests>, onChange = vi.fn()) =>
  render(
    <SellerRequestRows members={stateMembers(list)} value={v} onChange={onChange} pending={new Set()} onPendingChange={vi.fn()} />,
  )

const buyerBox = () => screen.getByRole('checkbox', { name: 'Send sample to buyer' })

describe('SellerRequestRows', () => {
  it('renders a heading per member and disables locked boxes with the reason', () => {
    rows(members, value)
    expect(screen.getByText('C-1 · Blaser')).toBeTruthy()
    expect(screen.getByText('C-2 · Ahold')).toBeTruthy()
    expect(screen.getByText('Ahold: Wolthers has the final word')).toBeTruthy()
    const boxes = screen.getAllByRole('checkbox', { name: 'Send sample to buyer' })
    expect(boxes[1].hasAttribute('disabled') || boxes[1].getAttribute('data-disabled') !== null).toBe(true)
  })

  it('groups each contract under its heading when there are several', () => {
    rows(members, value)
    expect(screen.getByRole('group', { name: 'C-1 · Blaser' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'C-2 · Ahold' })).toBeTruthy()
  })

  it('ticking stuffing on one member changes only that member', () => {
    const onChange = vi.fn()
    rows(members, value, onChange)
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Inform stuffing date/time/place' })[0])
    const next = onChange.mock.calls[0][0]
    expect(next.a.stuffing).toBe(true)
    expect(next.b).toBe(value.b)
  })

  it('shows the destination in the picker when buyer sample is ticked', () => {
    rows(members, value)
    expect(screen.getByText('Blaser Trading · Street 1, Zurich, Switzerland')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Sample address: Blaser Trading' })).toBeTruthy()
  })

  it('a single member renders no heading and no group', () => {
    rows([members[0]], { a: members[0].requests })
    expect(screen.queryByText('C-1 · Blaser')).toBeNull()
    expect(screen.queryByRole('group')).toBeNull()
    expect(buyerBox()).toBeTruthy()
  })

  it('ticking buyer sample off then on restores the starting destination', () => {
    const open = [member('c', 'C-3', 'Blaser', { buyerSample: none, stuffing: none }, req({ buyerSample: dest }))]
    render(<Harness list={open} />)
    expect(buyerBox().getAttribute('aria-checked')).toBe('true')
    fireEvent.click(buyerBox())
    expect(buyerBox().getAttribute('aria-checked')).toBe('false')
    expect(screen.queryByText('Blaser Trading · Street 1, Zurich, Switzerland')).toBeNull()
    fireEvent.click(buyerBox())
    expect(buyerBox().getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Blaser Trading · Street 1, Zurich, Switzerland')).toBeTruthy()
  })

  it('ticked on with no starting destination shows the picker empty', () => {
    const empty = [member('d', 'C-4', 'Ahold', { buyerSample: none, stuffing: none }, req())]
    render(<Harness list={empty} />)
    fireEvent.click(buyerBox())
    expect(buyerBox().getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('combobox', { name: 'Sample address' }).textContent).toContain('Choose the address')
    fireEvent.click(buyerBox())
    expect(screen.queryByRole('combobox', { name: /^Sample address/ })).toBeNull()
  })

  it('a fixed pre-approval with no address shows ticked, locked, with an empty picker', () => {
    const fixed = [member('e', 'C-5', 'Blaser', {
      buyerSample: { locked: true, on: true, reason: 'Blaser · Dulce: pre-approval, sample to Blaser' }, stuffing: none,
    }, req())]
    render(<Harness list={fixed} />)
    expect(buyerBox().getAttribute('aria-checked')).toBe('true')
    expect(buyerBox()).toBeDisabled()
    const picker = screen.getByRole('combobox', { name: 'Sample address' })
    expect(picker).not.toBeDisabled()
    expect(picker.textContent).toContain('Choose the address')
  })

  it('a locked buyer sample still lets the address be changed', () => {
    rows([members[0]], { a: members[0].requests })
    expect(screen.getByRole('combobox', { name: /^Sample address/ })).not.toBeDisabled()
  })

  it('disabled turns every box and the picker off', () => {
    const open = [member('f', 'C-6', 'Blaser', { buyerSample: none, stuffing: none }, req({ buyerSample: dest }))]
    render(<Harness list={open} disabled />)
    expect(buyerBox()).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Inform stuffing date/time/place' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: /^Sample address/ })).toBeDisabled()
  })
})
