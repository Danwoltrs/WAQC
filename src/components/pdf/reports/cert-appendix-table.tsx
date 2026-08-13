/**
 * Certificate appendix table shared by the SS / PSS / SS+PSS reports.
 * One chronological table of ALL certs in a bucket with a green/red Status
 * column, Bags (60kg equivalent) + MT columns, and separate approved/rejected
 * totals rows (each omitted when its count is zero, so a period with only
 * rejections doesn't print a zeroed "approved" footer). Roaster, Container
 * and Seller columns drop out per client/bucket with the remaining widths
 * renormalized.
 */
import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import type { WeeklySSCertRow } from '@/lib/report-data'

const GREEN = '#556b2f'
const GREEN_DARK = '#2f6b21'
const RED = '#ef4444'
const RED_DARK = '#b91c1c'
const GRAY_BORDER = '#e3e3e3'
const ZEBRA = '#f7f7f5'

type ColKey =
  | 'date' | 'cert' | 'shipper' | 'seller' | 'importer' | 'contract' | 'roaster'
  | 'container' | 'ico' | 'bags' | 'mt' | 'status'

interface ColDef { key: ColKey; label: string; weight: number; align?: 'right' | 'center' }

const ALL_COLS: ColDef[] = [
  { key: 'date', label: 'Approval date', weight: 9 },
  { key: 'cert', label: 'Certificate #', weight: 12 },
  { key: 'shipper', label: 'Shipper', weight: 12 },
  { key: 'seller', label: 'Seller', weight: 12 },
  { key: 'importer', label: 'Importer', weight: 14 },
  { key: 'contract', label: 'Importer contract', weight: 13 },
  { key: 'roaster', label: 'Roaster destination', weight: 12 },
  { key: 'container', label: 'Container', weight: 10 },
  { key: 'ico', label: 'ICO marks', weight: 10 },
  { key: 'bags', label: 'Bags', weight: 6, align: 'right' },
  { key: 'mt', label: 'MT', weight: 6, align: 'right' },
  { key: 'status', label: 'Status', weight: 7, align: 'center' },
]

export interface HiddenCols {
  hideRoaster?: boolean
  hideContainer?: boolean
  hideIco?: boolean
  hideImporter?: boolean
  hideSeller?: boolean
}

/** Visible columns with widths renormalized to sum to 100%. */
export function visibleCols(hidden: HiddenCols = {}): Array<ColDef & { width: string }> {
  const cols = ALL_COLS.filter(c =>
    (c.key !== 'roaster' || !hidden.hideRoaster) &&
    (c.key !== 'container' || !hidden.hideContainer) &&
    (c.key !== 'ico' || !hidden.hideIco) &&
    (c.key !== 'importer' || !hidden.hideImporter) &&
    (c.key !== 'seller' || !hidden.hideSeller),
  )
  const total = cols.reduce((s, c) => c.weight + s, 0)
  return cols.map(c => ({ ...c, width: `${((c.weight / total) * 100).toFixed(2)}%` }))
}

/**
 * Whether the Seller column earns its width. Seller and shipper are often the
 * same company (Ecom sells and ships its own coffee); a column repeating the
 * shipper name adds nothing. Shown as soon as ONE row differs — e.g. Grano
 * ships what Volcafe sold.
 */
export function shouldShowSeller(rows: WeeklySSCertRow[]): boolean {
  return rows.some(r => {
    const seller = r.seller_name?.trim().toLowerCase()
    if (!seller) return false
    return seller !== (r.exporter_name?.trim().toLowerCase() ?? '')
  })
}

const styles = StyleSheet.create({
  table: { borderTopWidth: 1, borderTopColor: GRAY_BORDER },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: GREEN },
  tableHeaderCell: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: 700,
    paddingVertical: 6,
    paddingHorizontal: 5,
    borderRightWidth: 1,
    borderRightColor: '#FFFFFF',
  },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: GRAY_BORDER },
  tableCell: {
    fontSize: 8,
    paddingVertical: 3,
    paddingHorizontal: 5,
    borderRightWidth: 1,
    borderRightColor: GRAY_BORDER,
    color: '#222',
  },
  totalRow: { flexDirection: 'row', backgroundColor: GREEN_DARK },
  totalCell: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: 700,
    paddingVertical: 5,
    paddingHorizontal: 5,
    borderRightWidth: 1,
    borderRightColor: GREEN_DARK,
  },
})

const formatDate = (iso: string) => {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}

function cellText(r: WeeklySSCertRow, key: ColKey): string {
  switch (key) {
    case 'date': return formatDate(r.approval_date)
    case 'cert': return r.certificate_number
    case 'shipper': return r.exporter_name || '—'
    case 'seller': return r.seller_name || '—'
    case 'importer': return r.importer_name || '—'
    case 'contract': return r.importer_contract_nr || '—'
    case 'roaster': return r.roaster_name || '—'
    case 'container': return r.container_nr || '—'
    case 'ico': return r.ico_marks || '—'
    case 'bags': return r.bags != null ? r.bags.toLocaleString('en-US') : '—'
    case 'mt': return r.mt != null ? r.mt.toFixed(1) : '—'
    case 'status': return r.is_rejected ? 'Rejected' : 'Approved'
  }
}

export interface AppendixTotals {
  certificate_count: number
  bag_count: number
  mt: number
}

function totalText(key: ColKey, label: string, totals: AppendixTotals): string {
  switch (key) {
    case 'date': return label
    case 'cert': return String(totals.certificate_count)
    case 'bags': return totals.bag_count.toLocaleString('en-US')
    case 'mt': return totals.mt.toFixed(1)
    default: return ''
  }
}

export function CertAppendixTable({
  rows,
  totals,
  hideRoasterCol,
  hideContainerCol = false,
  hideIcoCol = false,
  hideImporterCol = false,
  hideSellerCol = false,
  emptyMessage = 'No certificates issued in this period.',
}: {
  rows: WeeklySSCertRow[]
  /** Two separate sums. A period with only rejections used to print a
   *  0 / 0 / 0.0 footer because totals were approved-only. */
  totals: { approved: AppendixTotals; rejected: AppendixTotals }
  hideRoasterCol: boolean
  /** PSS has no container — drop the column. */
  hideContainerCol?: boolean
  /** PSS has no ICO marks (shipment-only) — drop the column. */
  hideIcoCol?: boolean
  /** Single-importer periods drop the redundant Importer column. */
  hideImporterCol?: boolean
  /** Dropped when no row's seller differs from its shipper. */
  hideSellerCol?: boolean
  emptyMessage?: string
}) {
  const cols = visibleCols({
    hideRoaster: hideRoasterCol,
    hideContainer: hideContainerCol,
    hideIco: hideIcoCol,
    hideImporter: hideImporterCol,
    hideSeller: hideSellerCol,
  })
  return (
    <View style={styles.table}>
      <View style={styles.tableHeaderRow} fixed>
        {cols.map(c => (
          <Text
            key={c.key}
            style={[styles.tableHeaderCell, { width: c.width }, c.align ? { textAlign: c.align } : {}]}
          >
            {c.label}
          </Text>
        ))}
      </View>

      {rows.length === 0 ? (
        <View style={styles.tableRow}>
          <Text style={[styles.tableCell, { width: '100%', textAlign: 'center', color: '#888' }]}>
            {emptyMessage}
          </Text>
        </View>
      ) : (
        rows.map((r, idx) => (
          <View
            key={`${r.certificate_number}-${idx}`}
            style={[styles.tableRow, { backgroundColor: idx % 2 === 1 ? ZEBRA : '#FFFFFF' }]}
            wrap={false}
          >
            {cols.map(c => (
              <Text
                key={c.key}
                style={[
                  styles.tableCell,
                  { width: c.width },
                  c.align ? { textAlign: c.align } : {},
                  c.key === 'status'
                    ? { color: r.is_rejected ? RED : GREEN, fontWeight: 700 }
                    : {},
                ]}
              >
                {cellText(r, c.key)}
              </Text>
            ))}
          </View>
        ))
      )}

      {totals.approved.certificate_count > 0 ? (
        <View style={styles.totalRow}>
          {cols.map(c => (
            <Text
              key={c.key}
              style={[styles.totalCell, { width: c.width }, c.align ? { textAlign: c.align } : {}]}
            >
              {totalText(c.key, 'Total approved', totals.approved)}
            </Text>
          ))}
        </View>
      ) : null}

      {totals.rejected.certificate_count > 0 ? (
        <View style={[styles.totalRow, { backgroundColor: RED_DARK }]}>
          {cols.map(c => (
            <Text
              key={c.key}
              style={[
                styles.totalCell,
                { width: c.width, borderRightColor: RED_DARK },
                c.align ? { textAlign: c.align } : {},
              ]}
            >
              {totalText(c.key, 'Total rejected', totals.rejected)}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  )
}
