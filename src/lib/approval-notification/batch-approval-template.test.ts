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
  decision: 'approved',
  reason: null,
}
const rejectedLine: BatchUnitLine = {
  containerNr: 'XYZU7654321',
  certNumber: 'SAN-000124/26',
  contractNumber: '42251/26',
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
  it('greets the recipient and lists approved certs', () => {
    const body = buildBatchApprovalBody({ greeting: 'Acme team', side: 'buyer', lines: [approvedLine] })
    expect(body).toContain('Dear Acme team,')
    expect(body).toContain('Approved:')
    expect(body).toContain('- Container ABCU1234567 · Cert SAN-000123/26 · Contract 42250/26')
    expect(body).not.toContain('Rejected:')
    expect(body).toContain('All certificates are attached.')
  })

  it('rejected lines include the reason', () => {
    const body = buildBatchApprovalBody({ greeting: 'X', side: 'seller', lines: [rejectedLine] })
    expect(body).toContain('Rejected:')
    expect(body).toContain('Contract 42251/26 — Phenol detected in cup 3')
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
      lines: [{ containerNr: null, certNumber: 'C-1', contractNumber: null, decision: 'approved', reason: null }],
    })
    expect(body).toContain('- Cert C-1')
    expect(body).not.toContain('Container')
  })
})