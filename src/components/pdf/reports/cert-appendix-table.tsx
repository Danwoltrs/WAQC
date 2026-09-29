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
import { reportDay } from '@/lib/reports/periods'

const GREEN = '#556b2f'
const GREEN_DARK = '#2f6b21'
const RED = '#ef4444'
const RED_DARK = '#b91c1c'
const GRAY_BORDER = '#e3e3e3'
const ZEBRA = '#f7f7f5'

export type ColKey =
  | 'date' | 'cert' | 'shipper' | 'seller' | 'importer' | 'contract' | 'roaster'
  | 'container' | 'ico' | 'bags' | 'mt' | 'status'

interface ColDef { key: ColKey; label: string; weight: number; align?: 'right' | 'center' }

// Weights are POINTS, measured with the real Inter metrics (10pt of cell
// padding + border included), so the full layout — Seller shown — just fits
// the 794pt table and no identifier wraps: "MRKU 815.0973-3" is 69.3pt of
// Inter 8 and "S & D / WESTROCK" 73.4pt. Dropped columns hand their share to
// the rest (renormalized). Roaster is "Roaster": "Roaster destination"
// hyphenated over two lines. MT and Bags need no more than four digits and
// their bold totals ("12,666", "500.0" at Inter 9.5, ~32pt).
const ALL_COLS: ColDef[] = [
  { key: 'date', label: 'Date', weight: 48 },
  // Importer contract leads the identifiers: it is the number the client quotes
  // back at us, so it reads before our own certificate number.
  { key: 'contract', label: 'Importer contract', weight: 86 },
  { key: 'cert', label: 'Certificate #', weight: 70 },
  { key: 'shipper', label: 'Shipper', weight: 70 },
  { key: 'seller', label: 'Seller', weight: 70 },
  { key: 'importer', label: 'Importer', weight: 76 },
  { key: 'roaster', label: 'Roaster', weight: 86 },
  { key: 'container', label: 'Container', weight: 84 },
  { key: 'ico', label: 'ICO marks', weight: 70 },
  { key: 'bags', label: 'Bags', weight: 44, align: 'right' },
  { key: 'mt', label: 'MT', weight: 42, align: 'right' },
  { key: 'status', label: 'Status', weight: 52, align: 'center' },
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

/** dd/mm/yy of the São Paulo day, whatever clock renders the PDF. */
const formatDate = (iso: string) => {
  const [yyyy, mm, dd] = reportDay(iso).split('-')
  return `${dd}/${mm}/${yyyy.slice(-2)}`
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

/**
 * The totals row's cells. Its label ("Approved", bold 9.5) is wider than the
 * Date column, and the Importer contract cell next to it is empty in a
 * totals row, so the label takes both widths instead of hyphenating.
 */
export function totalsCols<C extends { key: ColKey; width: string }>(cols: C[]): C[] {
  if (cols[0]?.key !== 'date' || cols[1]?.key !== 'contract') return cols
  const merged = { ...cols[0], width: `${(parseFloat(cols[0].width) + parseFloat(cols[1].width)).toFixed(2)}%` }
  return [merged, ...cols.slice(2)]
}

interface TotalsRow { key: 'approved' | 'rejected'; label: string; totals: AppendixTotals }

/**
 * Which totals rows actually print. A period with only rejections used to
 * force an approved row anyway, showing `Total | 0 | 0 | 0.0` under five
 * rejected rows — a row is included only when it has something to total.
 */
export function totalsRowsToRender(
  totals: { approved: AppendixTotals; rejected: AppendixTotals },
): TotalsRow[] {
  const out: TotalsRow[] = []
  if (totals.approved.certificate_count > 0) {
    out.push({ key: 'approved', label: 'Approved', totals: totals.approved })
  }
  if (totals.rejected.certificate_count > 0) {
    out.push({ key: 'rejected', label: 'Rejected', totals: totals.rejected })
  }
  return out
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
    <>
    {/* The header repeats on every page (fixed), which react-pdf exempts from
        minPresenceAhead. This empty sibling carries it instead: with less than
        a header and two rows of room left, the whole table starts on the next
        page rather than leaving its header alone at the foot of this one. */}
    <View minPresenceAhead={60} />
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

      {totalsRowsToRender(totals).map(tr => (
        <View
          key={tr.key}
          style={[styles.totalRow, tr.key === 'rejected' ? { backgroundColor: RED_DARK } : {}]}
        >
          {totalsCols(cols).map(c => (
            <Text
              key={c.key}
              style={[
                styles.totalCell,
                { width: c.width },
                tr.key === 'rejected' ? { borderRightColor: RED_DARK } : {},
                c.align ? { textAlign: c.align } : {},
              ]}
            >
              {totalText(c.key, tr.label, tr.totals)}
            </Text>
          ))}
        </View>
      ))}
    </View>
    </>
  )
}
