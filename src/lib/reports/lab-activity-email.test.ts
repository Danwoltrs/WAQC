import { describe, it, expect } from 'vitest'
import { buildLabActivityEmail, certificateBeforeDeletionLabel, labActivityColumns } from './lab-activity-email'
import type { DeletedSampleRow, LabActivityReport } from './lab-activity-data'

const deleted: DeletedSampleRow = {
  sampleId: 's1', labName: 'Santos HQ', trackingNumber: 'SAN-00901/26', sampleType: 'pss', contractRef: '42611/26',
  seller: 'Ipanema', importer: 'Blaser', createdBy: 'Matheus', createdAt: '2026-09-01T10:00:00Z',
  deletedBy: 'Anderson <b>Nunes</b>', deletedAt: '2026-09-12T18:00:00Z', deletedReason: 'wrong contract',
  certificate: { number: 'BR-000901/26', issuedAt: '2026-09-08T10:00:00Z', isRejected: false, sentBeforeDeletion: true, downloadedBeforeDeletion: false },
}

function report(over: Partial<LabActivityReport> = {}): LabActivityReport {
  return {
    period: { start: '2026-09-07', end: '2026-09-14' },
    breakdown: 'pss_approved_ss_rejected',
    labs: [
      { labId: 'bv', labName: 'Buenaventura', country: 'Colombia', pssApproved: 0, pssRejected: 1, ssApproved: 1, ssRejected: 0, otherIssued: 0, deleted: 0 },
      { labId: 'santos', labName: 'Santos HQ', country: 'Brazil', pssApproved: 2, pssRejected: 0, ssApproved: 0, ssRejected: 1, otherIssued: 1, deleted: 1 },
    ],
    totals: { pssApproved: 2, pssRejected: 1, ssApproved: 1, ssRejected: 1, otherIssued: 1, deleted: 1 },
    deleted: [deleted],
    generatedAt: '2026-09-14T11:00:00.000Z',
    ...over,
  }
}

describe('labActivityColumns', () => {
  it('shows PSS approved / SS rejected / deleted by default and every split in full', () => {
    expect(labActivityColumns('pss_approved_ss_rejected').map((c) => c.key)).toEqual(['pssApproved', 'ssRejected', 'deleted'])
    expect(labActivityColumns('full').map((c) => c.key)).toEqual(['pssApproved', 'pssRejected', 'ssApproved', 'ssRejected', 'deleted'])
  })
})

describe('certificateBeforeDeletionLabel', () => {
  it('names the certificate, when it was issued and that it was sent', () => {
    expect(certificateBeforeDeletionLabel(deleted)).toBe('BR-000901/26 · issued 8 Sep 2026 · SENT before deletion')
  })
  it('mentions a download when nothing was sent, and says so when there was no certificate', () => {
    expect(certificateBeforeDeletionLabel({ ...deleted, certificate: { ...deleted.certificate!, sentBeforeDeletion: false, downloadedBeforeDeletion: true } }))
      .toBe('BR-000901/26 · issued 8 Sep 2026 · downloaded before deletion')
    expect(certificateBeforeDeletionLabel({ ...deleted, certificate: null })).toBe('No certificate')
  })
})

describe('buildLabActivityEmail', () => {
  it('subject carries the period and the cadence', () => {
    expect(buildLabActivityEmail(report(), { cadence: 'weekly' }).subject).toBe('QC lab activity · 7 – 13 Sep 2026 · weekly')
    expect(buildLabActivityEmail(report()).subject).toBe('QC lab activity · 7 – 13 Sep 2026')
  })

  it('tables every lab with the breakdown columns and a totals row', () => {
    const { html, text } = buildLabActivityEmail(report())
    expect(html).toContain('Santos HQ')
    expect(html).toContain('Buenaventura')
    expect(html).toContain('PSS approved')
    expect(html).toContain('SS rejected')
    expect(html).not.toContain('PSS rejected')
    expect(html).toContain('>Total<')
    expect(text).toContain('Santos HQ: PSS approved 2, SS rejected 1, Samples deleted 1')
    expect(text).toContain('Total: PSS approved 2, SS rejected 1, Samples deleted 1')
  })

  it('shows every count in the full breakdown', () => {
    const { html } = buildLabActivityEmail(report({ breakdown: 'full' }))
    for (const h of ['PSS approved', 'PSS rejected', 'SS approved', 'SS rejected', 'Samples deleted']) expect(html).toContain(h)
  })

  it('lists each deleted sample with the certificate column and escapes user text', () => {
    const { html, text } = buildLabActivityEmail(report())
    expect(html).toContain('SAN-00901/26')
    expect(html).toContain('42611/26')
    expect(html).toContain('Ipanema')
    expect(html).toContain('Blaser')
    expect(html).toContain('Matheus')
    expect(html).toContain('Anderson &lt;b&gt;Nunes&lt;/b&gt;')
    expect(html).not.toContain('<b>Nunes</b>')
    expect(html).toContain('wrong contract')
    expect(html).toContain('BR-000901/26 · issued 8 Sep 2026 · SENT before deletion')
    expect(text).toContain('SAN-00901/26 [Santos HQ] contract 42611/26 · seller Ipanema · importer Blaser · created by Matheus · deleted by Anderson <b>Nunes</b>')
  })

  it('says so when nothing was deleted', () => {
    const { html, text } = buildLabActivityEmail(report({ deleted: [] }))
    expect(html).toContain('No samples were deleted in this period.')
    expect(text).toContain('No samples were deleted in this period.')
  })
})
