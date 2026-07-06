import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToBuffer, Document, Page } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import { SSCertAppendixTable } from './ss-cert-appendix-table'
import type { WeeklySSCertRow } from '@/lib/report-data'

const row: WeeklySSCertRow = {
  approval_date: '2026-02-26T00:00:00Z', certificate_number: '36.686/26',
  exporter_name: 'Cooxupe', seller_name: 'Cooxupe', importer_name: 'Coffee America',
  importer_contract_nr: 'P07113.000', roaster_name: 'Unsold', container_nr: 'TCKU 186.924-2',
  ico_marks: '002/4600/1551', bags: 333, mt: 20.0, is_rejected: false,
}

describe('SSCertAppendixTable', () => {
  it('renders a non-empty PDF', async () => {
    const el = React.createElement(Document, {}, React.createElement(Page, { size: 'A4', orientation: 'landscape' },
      React.createElement(SSCertAppendixTable, { rows: [row], totals: { certificate_count: 1, bag_count: 333 }, hideRoasterCol: false }),
    ))
    const buf = await renderToBuffer(el as any)
    expect(buf.length).toBeGreaterThan(1000)
  })
})
