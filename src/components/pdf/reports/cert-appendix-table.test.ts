import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToBuffer, Document, Page } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import { CertAppendixTable, visibleCols } from './cert-appendix-table'
import type { WeeklySSCertRow } from '@/lib/report-data'

const row = (over: Partial<WeeklySSCertRow> = {}): WeeklySSCertRow => ({
  approval_date: '2026-02-26T00:00:00Z', certificate_number: '36.686/26',
  exporter_name: 'Cooxupe', seller_name: 'Cooxupe', importer_name: 'Coffee America',
  importer_contract_nr: 'P07113.000', roaster_name: 'Unsold', container_nr: 'TCKU 186.924-2',
  ico_marks: '002/4600/1551', bags: 333, mt: 20.0, is_rejected: false,
  ...over,
})

describe('visibleCols', () => {
  it('full SS layout has 11 columns summing to ~100%', () => {
    const cols = visibleCols(false, false)
    expect(cols.map(c => c.key)).toEqual([
      'date', 'cert', 'shipper', 'importer', 'contract', 'roaster',
      'container', 'ico', 'bags', 'mt', 'status',
    ])
    const sum = cols.reduce((s, c) => s + parseFloat(c.width), 0)
    expect(sum).toBeGreaterThan(99.9)
    expect(sum).toBeLessThan(100.1)
  })
  it('drops roaster and container columns on demand, widths renormalized', () => {
    const cols = visibleCols(true, true)
    expect(cols.find(c => c.key === 'roaster')).toBeUndefined()
    expect(cols.find(c => c.key === 'container')).toBeUndefined()
    const sum = cols.reduce((s, c) => s + parseFloat(c.width), 0)
    expect(sum).toBeGreaterThan(99.9)
    expect(sum).toBeLessThan(100.1)
  })
})

describe('CertAppendixTable', () => {
  it('renders approved + rejected rows to a non-empty PDF', async () => {
    const el = React.createElement(Document, {}, React.createElement(Page, { size: 'A4', orientation: 'landscape' },
      React.createElement(CertAppendixTable, {
        rows: [row(), row({ certificate_number: '36.687/26', is_rejected: true })],
        totals: { certificate_count: 1, bag_count: 333, mt: 20.0 },
        hideRoasterCol: false,
      }),
    ))
    const buf = await renderToBuffer(el as any)
    expect(buf.length).toBeGreaterThan(1000)
  })
  it('renders the PSS variant (no container column)', async () => {
    const el = React.createElement(Document, {}, React.createElement(Page, { size: 'A4', orientation: 'landscape' },
      React.createElement(CertAppendixTable, {
        rows: [row({ container_nr: null })],
        totals: { certificate_count: 1, bag_count: 333, mt: 20.0 },
        hideRoasterCol: true,
        hideContainerCol: true,
      }),
    ))
    const buf = await renderToBuffer(el as any)
    expect(buf.length).toBeGreaterThan(1000)
  })
})
