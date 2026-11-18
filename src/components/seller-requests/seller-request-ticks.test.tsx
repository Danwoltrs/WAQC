// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SellerRequestState } from '@/lib/seller-requests/store'
import type { SellerRequests } from '@/lib/seller-requests/types'
import { SellerRequestTicks } from './seller-request-ticks'

afterEach(cleanup)

const dest = {
  companyId: 'co', companyName: 'Blaser Trading', savedAddressId: null,
  lines: ['Street 1', 'Zurich'], country: 'Switzerland', recipientName: null,
  attention: null, phone: null, instructions: null,
}
const none = { locked: false, reason: null }
const req = (over: Partial<SellerRequests> = {}): SellerRequests => ({
  buyerSample: null, stuffing: false, setBy: null, setAt: null, ...over,
})
const member = (id: string, contract: string, client: string, locks: any, requests: SellerRequests) =>
  ({ sampleId: id, contractNumber: contract, clientName: client, locks, requests }) as unknown as SellerRequestState

const members = [
  member('a', 'C-1', 'Blaser', { buyerSample: { locked: true, reason: 'Blaser: sample always goes' }, stuffing: none }, req({ buyerSample: dest })),
  member('b', 'C-2', 'Ahold', { buyerSample: { locked: true, reason: 'Ahold: Wolthers has the final word' }, stuffing: none }, req()),
]
const value = { a: members[0].requests, b: members[1].requests }

describe('SellerRequestTicks', () => {
  it('renders a heading per member and disables locked boxes with the reason', () => {
    render(<SellerRequestTicks members={members} value={value} onChange={vi.fn()} />)
    expect(screen.getByText('C-1 · Blaser')).toBeTruthy()
    expect(screen.getByText('C-2 · Ahold')).toBeTruthy()
    expect(screen.getByText('Ahold: Wolthers has the final word')).toBeTruthy()
    const boxes = screen.getAllByRole('checkbox', { name: 'Send sample to buyer' })
    expect(boxes[1].hasAttribute('disabled') || boxes[1].getAttribute('data-disabled') !== null).toBe(true)
  })

  it('ticking stuffing on one member changes only that member', () => {
    const onChange = vi.fn()
    render(<SellerRequestTicks members={members} value={value} onChange={onChange} />)
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Inform stuffing date/time/place' })[0])
    const next = onChange.mock.calls[0][0]
    expect(next.a.stuffing).toBe(true)
    expect(next.b).toBe(value.b)
  })

  it('shows the destination line when buyer sample is ticked', () => {
    render(<SellerRequestTicks members={members} value={value} onChange={vi.fn()} />)
    expect(screen.getByText('Blaser Trading · Street 1, Zurich, Switzerland')).toBeTruthy()
  })
})
