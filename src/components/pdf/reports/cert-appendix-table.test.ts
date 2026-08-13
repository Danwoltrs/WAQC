import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToBuffer, Document, Page } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import { CertAppendixTable, visibleCols, shouldShowSeller } from './cert-appendix-table'
import type { WeeklySSCertRow } from '@/lib/report-data'

const row = (over: Partial<WeeklySSCertRow> = {}): WeeklySSCertRow => ({
  approval_date: '2026-02-26T00:00:00Z', certificate_number: '36.686/26',
  exporter_name: 'Cooxupe', seller_name: 'Cooxupe', importer_name: 'Coffee America',
  importer_contract_nr: 'P07113.000', roaster_name: 'Unsold', container_nr: 'TCKU 186.924-2',
  ico_marks: '002/4600/1551', bags: 333, mt: 20.0, is_rejected: false,
  ...over,
})

describe('visibleCols', () => {
  const sums100 = (cols: Array<{ width: string }>) => {
    const sum = cols.reduce((s, c) => s + parseFloat(c.width), 0)
    expect(sum).toBeGreaterThan(99.9)
    expect(sum).toBeLessThan(100.1)
  }
  it('full SS layout has 12 columns summing to ~100%', () => {
    const cols = visibleCols()
    expect(cols.map(c => c.key)).toEqual([
      'date', 'cert', 'shipper', 'seller', 'importer', 'contract', 'roaster',
      'container', 'ico', 'bags', 'mt', 'status',
    ])
    sums100(cols)
  })
  it('drops roaster, container and seller columns on demand, widths renormalized', () => {
    const cols = visibleCols({ hideRoaster: true, hideContainer: true, hideSeller: true })
    expect(cols.find(c => c.key === 'roaster')).toBeUndefined()
    expect(cols.find(c => c.key === 'container')).toBeUndefined()
    expect(cols.find(c => c.key === 'seller')).toBeUndefined()
    sums100(cols)
  })
  it('PSS drops ICO + Container + Importer (single importer) columns', () => {
    const cols = visibleCols({ hideContainer: true, hideIco: true, hideImporter: true })
    expect(cols.find(c => c.key === 'ico')).toBeUndefined()
    expect(cols.find(c => c.key === 'importer')).toBeUndefined()
    expect(cols.find(c => c.key === 'container')).toBeUndefined()
    expect(cols.find(c => c.key === 'shipper')).toBeDefined()
    sums100(cols)
  })
})

describe('shouldShowSeller', () => {
  it('is true when any row has a seller different from its shipper', () => {
    expect(shouldShowSeller([
      row({ exporter_name: 'Grano Trading', seller_name: 'Volcafe CH' }),
      row({ exporter_name: 'Ecom', seller_name: 'Ecom' }),
    ])).toBe(true)
  })
  it('is false when every seller repeats its shipper', () => {
    expect(shouldShowSeller([
      row({ exporter_name: 'Ecom', seller_name: 'Ecom' }),
      row({ exporter_name: 'Comexim', seller_name: ' comexim ' }),
    ])).toBe(false)
  })
  it('is false when no row records a seller', () => {
    expect(shouldShowSeller([row({ seller_name: null }), row({ seller_name: '  ' })])).toBe(false)
  })
})

describe('CertAppendixTable', () => {
  it('renders approved + rejected rows to a non-empty PDF', async () => {
    const el = React.createElement(Document, {}, React.createElement(Page, { size: 'A4', orientation: 'landscape' },
      React.createElement(CertAppendixTable, {
        rows: [row(), row({ certificate_number: '36.687/26', is_rejected: true })],
        totals: {
          approved: { certificate_count: 1, bag_count: 333, mt: 20.0 },
          rejected: { certificate_count: 1, bag_count: 333, mt: 20.0 },
        },
        hideRoasterCol: false,
      }),
    ))
    const buf = await renderToBuffer(el as any)
    expect(buf.length).toBeGreaterThan(1000)
  })
  it('renders the PSS variant (no container/ICO/importer columns)', async () => {
    const el = React.createElement(Document, {}, React.createElement(Page, { size: 'A4', orientation: 'landscape' },
      React.createElement(CertAppendixTable, {
        rows: [row({ container_nr: null, ico_marks: null })],
        totals: {
          approved: { certificate_count: 1, bag_count: 333, mt: 20.0 },
          rejected: { certificate_count: 1, bag_count: 333, mt: 20.0 },
        },
        hideRoasterCol: true,
        hideContainerCol: true,
        hideIcoCol: true,
        hideImporterCol: true,
      }),
    ))
    const buf = await renderToBuffer(el as any)
    expect(buf.length).toBeGreaterThan(1000)
  })

  it('renders an all-rejected table without a zeroed approved total', async () => {
    const el = React.createElement(Document, {}, React.createElement(Page, { size: 'A4', orientation: 'landscape' },
      React.createElement(CertAppendixTable, {
        rows: [row({ is_rejected: true }), row({ certificate_number: '36.688/26', is_rejected: true })],
        totals: {
          approved: { certificate_count: 0, bag_count: 0, mt: 0 },
          rejected: { certificate_count: 2, bag_count: 666, mt: 40.0 },
        },
        hideRoasterCol: false,
      }),
    ))
    const buf = await renderToBuffer(el as any)
    expect(buf.length).toBeGreaterThan(1000)
  })
})
