import { describe, it, expect } from 'vitest'
import { filterByQcClients, summarizeQcClients, NO_QC_CLIENT } from './qc-client-filter'
import type { BatchUnit } from './batch-send'

const unit = (side: 'buyer' | 'seller', companyId: string, sampleIds: string[]): BatchUnit => ({
  side,
  companyId,
  companyName: companyId,
  greeting: 'all',
  to: [],
  cc: [],
  subject: '',
  body: '',
  samples: sampleIds.map((sampleId) => ({
    sampleId,
    containerNr: null,
    certNumber: null,
    contractNumber: null,
    decision: 'approved' as const,
    reason: null,
    reference: null,
    date: null,
  })),
  needsRecipients: true,
})

describe('summarizeQcClients', () => {
  const names = new Map([
    ['ahold', 'Ahold'],
    ['dunkin', 'Dunkin'],
  ])

  it('counts each certificate once even when its buyer and seller emails are both pending, sorted by name', () => {
    const units = [
      unit('buyer', 'dunkin', ['s3']),
      unit('buyer', 'ahold', ['s1', 's2']),
      unit('seller', 'ldc-suisse', ['s1', 's2']),
      unit('seller', 'ofi', ['s3']),
    ]
    const clientOf = new Map<string, string | null>([
      ['s1', 'ahold'],
      ['s2', 'ahold'],
      ['s3', 'dunkin'],
    ])
    expect(summarizeQcClients(units, clientOf, names)).toEqual([
      { id: 'ahold', name: 'Ahold', certificates: 2 },
      { id: 'dunkin', name: 'Dunkin', certificates: 1 },
    ])
  })

  it('lists a client whose certificates wait only on the seller email', () => {
    const units = [unit('seller', 'ofi', ['s3'])]
    expect(summarizeQcClients(units, new Map([['s3', 'dunkin']]), names)).toEqual([
      { id: 'dunkin', name: 'Dunkin', certificates: 1 },
    ])
  })

  it('gives certificates with no QC client an entry of their own', () => {
    const units = [unit('seller', 'sucafina', ['t1'])]
    expect(summarizeQcClients(units, new Map([['t1', null]]), names)).toEqual([
      { id: NO_QC_CLIENT, name: 'No QC client', certificates: 1 },
    ])
  })
})

describe('filterByQcClients', () => {
  const certs = [
    { id: 'c1', client: 'ahold' },
    { id: 'c2', client: 'dunkin' },
    { id: 'c3', client: null },
  ]

  it('keeps only the chosen clients’ certificates', () => {
    expect(filterByQcClients(certs, (c) => c.client, new Set(['dunkin'])).map((c) => c.id)).toEqual(['c2'])
  })

  it('keeps certificates with no QC client when that entry is chosen', () => {
    expect(
      filterByQcClients(certs, (c) => c.client, new Set([NO_QC_CLIENT, 'ahold'])).map((c) => c.id),
    ).toEqual(['c1', 'c3'])
  })
})
