// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SellerDetailPanel } from './seller-detail'
import type { SellerDetail } from '@/lib/portal/supplier-review'

afterEach(cleanup)

const row = { seller: 'Cooxupé', certificates: 20, rejected: 7, approvalRate: 65, pssRate: 60, ssRate: 70, ssMt: 12.5, fewLots: false }
const cert = (n: string) => ({
  id: n, certificateNumber: n, contractRef: '42089/26', issuedAt: '2026-10-01T00:00:00Z',
  measured: [{ label: 'Primary defects', value: '12', limit: 'max 8' }],
})
const reason = (i: number, count: number) => ({
  reason: 'primary' as const, name: `Black ${i}`, label: `Primary defects: Black ${i}`, count, certificates: [cert(`SAG-00${i}/26`)],
})
const detail = (over: Partial<SellerDetail> = {}): SellerDetail => ({
  seller: 'Cooxupé', row, topReasons: [1, 2, 3, 4, 5].map(i => reason(i, 6 - i)), multiReason: 2, rejectedTotal: 7,
  monthly: [{ month: '2026-09', approvalRate: 70, certificates: 10 }], ...over,
})

describe('SellerDetailPanel', () => {
  it('lists the five reasons with counts and the multi-reason line', () => {
    render(<SellerDetailPanel detail={detail()} periodLabel="Crop 26/27" />)
    for (let i = 1; i <= 5; i++) expect(screen.getByText(`Primary defects: Black ${i}`)).toBeTruthy()
    expect(screen.getByText('Rejected for more than one reason: 2')).toBeTruthy()
  })

  it('expands a reason to its certificates with value and limit', () => {
    render(<SellerDetailPanel detail={detail()} periodLabel="Crop 26/27" />)
    expect(screen.queryByText('SAG-001/26')).toBeNull()
    fireEvent.click(screen.getByText('Primary defects: Black 1'))
    expect(screen.getByText('SAG-001/26')).toBeTruthy()
    expect(screen.getByText('12, max 8')).toBeTruthy()
  })

  it('shows the empty text when nothing was rejected', () => {
    render(<SellerDetailPanel detail={detail({ topReasons: [], multiReason: 0, rejectedTotal: 0 })} periodLabel="Crop 26/27" />)
    expect(screen.getByText('No rejections for Cooxupé in Crop 26/27')).toBeTruthy()
  })
})
