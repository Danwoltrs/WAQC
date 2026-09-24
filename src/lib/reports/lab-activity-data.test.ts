import { describe, it, expect } from 'vitest'
import {
  aggregateLabActivity,
  parseIsoDate,
  periodLabel,
  previousPeriod,
  type AggregateInput,
} from './lab-activity-data'

describe('previousPeriod', () => {
  it('weekly: the previous Monday–Sunday, end exclusive, from any weekday', () => {
    // Thursday 17 Sep 2026 → Mon 7 – Sun 13 Sep (end = Mon 14)
    expect(previousPeriod('weekly', new Date('2026-09-17T15:00:00Z'))).toEqual({ start: '2026-09-07', end: '2026-09-14' })
    // Monday 14 Sep → the week that just ended
    expect(previousPeriod('weekly', new Date('2026-09-14T09:00:00Z'))).toEqual({ start: '2026-09-07', end: '2026-09-14' })
    // Sunday 13 Sep still belongs to the running week
    expect(previousPeriod('weekly', new Date('2026-09-13T09:00:00Z'))).toEqual({ start: '2026-08-31', end: '2026-09-07' })
  })

  it('monthly: the previous calendar month, across a year boundary too', () => {
    expect(previousPeriod('monthly', new Date('2026-09-17T15:00:00Z'))).toEqual({ start: '2026-08-01', end: '2026-09-01' })
    expect(previousPeriod('monthly', new Date('2026-01-03T15:00:00Z'))).toEqual({ start: '2025-12-01', end: '2026-01-01' })
  })
})

describe('periodLabel', () => {
  it('prints the inclusive range', () => {
    expect(periodLabel({ start: '2026-09-07', end: '2026-09-14' })).toBe('7 – 13 Sep 2026')
    expect(periodLabel({ start: '2026-08-01', end: '2026-09-01' })).toBe('1 – 31 Aug 2026')
    expect(periodLabel({ start: '2026-09-28', end: '2026-10-05' })).toBe('28 Sep – 4 Oct 2026')
    expect(periodLabel({ start: '2025-12-29', end: '2026-01-05' })).toBe('29 Dec 2025 – 4 Jan 2026')
  })
})

describe('parseIsoDate', () => {
  it('accepts a real YYYY-MM-DD and nothing else', () => {
    expect(parseIsoDate('2026-09-17')).toBe('2026-09-17')
    expect(parseIsoDate('2026-02-30')).toBeNull()
    expect(parseIsoDate('17/09/2026')).toBeNull()
    expect(parseIsoDate(20260917)).toBeNull()
  })
})

const santos = { id: 'lab-santos', name: 'Santos HQ', country: 'Brazil', is_active: true }
const buenaventura = { id: 'lab-bv', name: 'Buenaventura', country: 'Colombia', is_active: true }
const closed = { id: 'lab-old', name: 'Old lab', country: null, is_active: false }

function input(over: Partial<AggregateInput> = {}): AggregateInput {
  return {
    labs: [santos, buenaventura, closed],
    certificates: [
      { id: 'c1', created_at: '2026-09-08T10:00:00Z', is_rejected: false, sample: { id: 's1', laboratory_id: 'lab-santos', sample_type: 'pss' } },
      { id: 'c2', created_at: '2026-09-09T10:00:00Z', is_rejected: false, sample: { id: 's2', laboratory_id: 'lab-santos', sample_type: 'pss' } },
      { id: 'c3', created_at: '2026-09-09T11:00:00Z', is_rejected: true, sample: { id: 's3', laboratory_id: 'lab-santos', sample_type: 'ss' } },
      { id: 'c4', created_at: '2026-09-10T10:00:00Z', is_rejected: true, sample: { id: 's4', laboratory_id: 'lab-bv', sample_type: 'pss' } },
      { id: 'c5', created_at: '2026-09-10T10:00:00Z', is_rejected: false, sample: { id: 's5', laboratory_id: 'lab-bv', sample_type: 'ss' } },
      { id: 'c6', created_at: '2026-09-10T10:00:00Z', is_rejected: false, sample: { id: 's6', laboratory_id: 'lab-santos', sample_type: 'specialty' } },
      { id: 'c7', created_at: '2026-09-10T10:00:00Z', is_rejected: false, sample: null },
    ],
    deletedSamples: [
      {
        id: 's1', tracking_number: 'SAN-00901/26', laboratory_id: 'lab-santos', sample_type: 'pss',
        wolthers_contract_nr: '42611/26', buyer_contract_nr: '107048', created_at: '2026-09-01T10:00:00Z', created_by: 'u-matheus',
        deleted_at: '2026-09-12T18:00:00Z', deleted_by: 'u-anderson', deleted_reason: 'wrong contract',
        seller: { name: 'Ipanema Agrícola S.A.', fantasy_name: 'Ipanema' }, importer: null,
        qc_client: { name: 'Blaser Trading AG', fantasy_name: 'Blaser' }, importer_is_qc_client: true,
      },
      {
        id: 's9', tracking_number: 'SAN-00909/26', laboratory_id: 'lab-santos', sample_type: 'ss',
        wolthers_contract_nr: null, buyer_contract_nr: null, created_at: '2026-09-02T10:00:00Z', created_by: null,
        deleted_at: '2026-09-11T18:00:00Z', deleted_by: 'u-anderson', deleted_reason: null,
        seller: null, importer: { name: 'Coffee America', fantasy_name: null }, qc_client: null, importer_is_qc_client: false,
      },
      {
        id: 's10', tracking_number: 'GUA-00010/26', laboratory_id: null, sample_type: 'pss',
        wolthers_contract_nr: '1/26', buyer_contract_nr: null, created_at: null, created_by: 'u-ghost',
        deleted_at: '2026-09-11T19:00:00Z', deleted_by: null, deleted_reason: '  ',
        seller: null, importer: null, qc_client: null, importer_is_qc_client: null,
      },
    ],
    deletedCertificates: [
      { sample_id: 's1', certificate_number: 'BR-000901/26', created_at: '2026-09-08T10:00:00Z', issued_at: null, is_rejected: false },
    ],
    deletedEvents: [
      { sample_id: 's1', event_type: 'certificate_sent', occurred_at: '2026-09-09T08:00:00Z' },
      { sample_id: 's1', event_type: 'certificate_downloaded', occurred_at: '2026-09-13T08:00:00Z' }, // after the deletion
    ],
    userNames: new Map([['u-matheus', 'Matheus'], ['u-anderson', 'Anderson Nunes']]),
    ...over,
  }
}

const period = { start: '2026-09-07', end: '2026-09-14' }

describe('aggregateLabActivity', () => {
  const report = aggregateLabActivity(input(), { period, breakdown: 'pss_approved_ss_rejected', now: new Date('2026-09-14T11:00:00Z') })

  it('counts certificates per lab and type, listing every active lab and the unassigned bucket last', () => {
    expect(report.labs.map((l) => l.labName)).toEqual(['Buenaventura', 'Santos HQ', 'Unassigned lab'])
    const santosRow = report.labs.find((l) => l.labName === 'Santos HQ')!
    expect(santosRow).toMatchObject({ pssApproved: 2, pssRejected: 0, ssApproved: 0, ssRejected: 1, otherIssued: 1, deleted: 2 })
    const bv = report.labs.find((l) => l.labName === 'Buenaventura')!
    expect(bv).toMatchObject({ pssApproved: 0, pssRejected: 1, ssApproved: 1, ssRejected: 0, otherIssued: 0, deleted: 0 })
    expect(report.labs.find((l) => l.labName === 'Unassigned lab')).toMatchObject({ deleted: 1 })
    // The closed lab had no activity and is not listed.
    expect(report.labs.find((l) => l.labName === 'Old lab')).toBeUndefined()
  })

  it('totals across labs', () => {
    expect(report.totals).toEqual({ pssApproved: 2, pssRejected: 1, ssApproved: 1, ssRejected: 1, otherIssued: 1, deleted: 3 })
  })

  it('keeps counting a certificate whose sample was deleted afterwards — the approval happened', () => {
    // s1 was approved on the 8th and deleted on the 12th: counted AND listed.
    expect(report.labs.find((l) => l.labName === 'Santos HQ')!.pssApproved).toBe(2)
    expect(report.deleted.map((d) => d.trackingNumber)).toContain('SAN-00901/26')
  })

  it('describes each deleted sample: parties, people, reason, and the certificate that existed before the deletion', () => {
    const s1 = report.deleted.find((d) => d.sampleId === 's1')!
    expect(s1).toMatchObject({
      labName: 'Santos HQ',
      contractRef: '42611/26',
      seller: 'Ipanema',
      importer: 'Blaser', // the QC client stands in when the importer is the QC client
      createdBy: 'Matheus',
      deletedBy: 'Anderson Nunes',
      deletedAt: '2026-09-12T18:00:00Z',
      deletedReason: 'wrong contract',
      certificate: {
        number: 'BR-000901/26',
        numberReissued: false,
        issuedAt: '2026-09-08T10:00:00Z',
        isRejected: false,
        sentBeforeDeletion: true,
        downloadedBeforeDeletion: false, // the download came after
      },
    })
    const s9 = report.deleted.find((d) => d.sampleId === 's9')!
    expect(s9).toMatchObject({ contractRef: null, seller: null, importer: 'Coffee America', createdBy: null, certificate: null })
    const s10 = report.deleted.find((d) => d.sampleId === 's10')!
    // An unknown user id is shown as is rather than dropped; a blank reason is none.
    expect(s10).toMatchObject({ labName: 'Unassigned lab', createdBy: 'u-ghost', deletedBy: null, deletedReason: null })
  })

  it('prints a released void under its original number and says it was reissued', () => {
    const voided = aggregateLabActivity(
      input({
        deletedCertificates: [
          { sample_id: 's1', certificate_number: 'BR-000901/26 VOID-3f2a9c01', created_at: '2026-09-08T10:00:00Z', issued_at: null, is_rejected: false },
        ],
      }),
      { period, breakdown: 'pss_approved_ss_rejected', now: new Date('2026-09-14T11:00:00Z') },
    )
    expect(voided.deleted.find((d) => d.sampleId === 's1')!.certificate).toMatchObject({ number: 'BR-000901/26', numberReissued: true })
  })

  it('orders deleted rows by lab then time', () => {
    expect(report.deleted.map((d) => d.sampleId)).toEqual(['s9', 's1', 's10'])
  })

  it('carries the period, breakdown and generation time', () => {
    expect(report.period).toEqual(period)
    expect(report.breakdown).toBe('pss_approved_ss_rejected')
    expect(report.generatedAt).toBe('2026-09-14T11:00:00.000Z')
  })
})
