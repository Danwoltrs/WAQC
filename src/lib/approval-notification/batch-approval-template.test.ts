import { describe, it, expect } from 'vitest'
import {
  buildBatchApprovalSubject,
  buildBatchApprovalBody,
  type BatchUnitLine,
} from './batch-approval-template'

const approvedLine: BatchUnitLine = {
  containerNr: 'ABCU1234567',
  certNumber: 'SAN-000123/26',
  contractNumber: '42250/26',
  reference: 'BUYER-REF-1',
  date: '2026-06-12T10:00:00Z',
  decision: 'approved',
  reason: null,
}
const rejectedLine: BatchUnitLine = {
  containerNr: 'XYZU7654321',
  certNumber: 'SAN-000124/26',
  contractNumber: '42251/26',
  reference: 'BUYER-REF-2',
  date: '2026-06-18T10:00:00Z',
  decision: 'rejected',
  reason: 'Phenol detected in cup 3',
}

describe('buildBatchApprovalSubject', () => {
  it('all approved', () => {
    expect(buildBatchApprovalSubject({ greeting: 'X', side: 'buyer', lines: [approvedLine] })).toBe(
      'Wolthers QC — 1 approved certificate',
    )
  })
  it('all rejected (plural)', () => {
    expect(
      buildBatchApprovalSubject({ greeting: 'X', side: 'seller', lines: [rejectedLine, rejectedLine] }),
    ).toBe('Wolthers QC — 2 rejected certificates')
  })
  it('mixed shows the breakdown', () => {
    expect(
      buildBatchApprovalSubject({ greeting: 'X', side: 'buyer', lines: [approvedLine, rejectedLine] }),
    ).toBe('Wolthers QC — 2 certificates (1 approved, 1 rejected)')
  })
})

describe('buildBatchApprovalBody', () => {
  it('uses the recipient reference, not our contract number', () => {
    const body = buildBatchApprovalBody({ greeting: 'Acme team', side: 'buyer', lines: [approvedLine] })
    expect(body).toContain('Dear Acme team,')
    expect(body).toContain('Approved:')
    expect(body).toContain('- Container ABCU1234567 · Cert SAN-000123/26 · Ref BUYER-REF-1')
    expect(body).not.toContain('42250/26')
    expect(body).not.toContain('Rejected:')
    expect(body).toContain('All certificates are attached.')
  })

  it('falls back to the contract number when no reference', () => {
    const body = buildBatchApprovalBody({
      greeting: 'X',
      side: 'seller',
      lines: [{ ...approvedLine, reference: null }],
    })
    expect(body).toContain('Ref 42250/26')
  })

  it('includes a range + approval-rate summary', () => {
    const body = buildBatchApprovalBody({ greeting: 'X', side: 'buyer', lines: [approvedLine, rejectedLine] })
    expect(body).toContain('2 certificates · 12 Jun 2026 – 18 Jun 2026 · 1 approved, 1 rejected (50% approved)')
  })

  it('single-day range collapses to one date', () => {
    const body = buildBatchApprovalBody({ greeting: 'X', side: 'buyer', lines: [approvedLine] })
    expect(body).toContain('1 certificate · 12 Jun 2026 · 1 approved (100% approved)')
  })

  it('rejected lines include the reason', () => {
    const body = buildBatchApprovalBody({ greeting: 'X', side: 'seller', lines: [rejectedLine] })
    expect(body).toContain('Rejected:')
    expect(body).toContain('Ref BUYER-REF-2 — Phenol detected in cup 3')
  })

  it('approved reasons are never shown', () => {
    const body = buildBatchApprovalBody({
      greeting: 'X',
      side: 'buyer',
      lines: [{ ...approvedLine, reason: 'internal note that must not leak' }],
    })
    expect(body).not.toContain('internal note')
  })

  it('mixed renders both sections in order', () => {
    const body = buildBatchApprovalBody({ greeting: 'X', side: 'buyer', lines: [approvedLine, rejectedLine] })
    expect(body.indexOf('Approved:')).toBeLessThan(body.indexOf('Rejected:'))
  })

  it('drops null parts gracefully', () => {
    const body = buildBatchApprovalBody({
      greeting: 'X',
      side: 'buyer',
      lines: [{ containerNr: null, certNumber: 'C-1', contractNumber: null, reference: null, date: null, decision: 'approved', reason: null }],
    })
    expect(body).toContain('- Cert C-1')
    expect(body).not.toContain('Container')
  })
})
