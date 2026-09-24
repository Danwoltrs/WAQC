/**
 * The lab activity digest as an email: a per-lab table, totals, and one row
 * per deleted sample with the certificate column the trading desk reads
 * first. Pure — the same builder feeds the cron send and the in-app "Send
 * now", and the in-app view renders the same report from JSON.
 */
import { escapeHtml } from '@/lib/html'
import {
  MONTHS_SHORT,
  periodLabel,
  type DeletedSampleRow,
  type LabActivityBreakdown,
  type LabActivityCadence,
  type LabActivityLabRow,
  type LabActivityReport,
} from './lab-activity-data'

export interface LabActivityColumn {
  key: keyof Omit<LabActivityLabRow, 'labId' | 'labName' | 'country'>
  label: string
}

/** The count columns a breakdown shows, in order. */
export function labActivityColumns(breakdown: LabActivityBreakdown): LabActivityColumn[] {
  if (breakdown === 'full') {
    return [
      { key: 'pssApproved', label: 'PSS approved' },
      { key: 'pssRejected', label: 'PSS rejected' },
      { key: 'ssApproved', label: 'SS approved' },
      { key: 'ssRejected', label: 'SS rejected' },
      { key: 'deleted', label: 'Samples deleted' },
    ]
  }
  return [
    { key: 'pssApproved', label: 'PSS approved' },
    { key: 'ssRejected', label: 'SS rejected' },
    { key: 'deleted', label: 'Samples deleted' },
  ]
}

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}
const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${fmtDate(iso)}, ${hh}:${mm} UTC`
}

/** "BR-000901/26 · issued 8 Sep 2026 · sent" / "No certificate". */
export function certificateBeforeDeletionLabel(row: DeletedSampleRow): string {
  const c = row.certificate
  if (!c) return 'No certificate'
  const parts = [c.number ?? 'certificate', `${c.isRejected ? 'rejected' : 'issued'} ${fmtDate(c.issuedAt)}`]
  if (c.sentBeforeDeletion) parts.push('SENT before deletion')
  else if (c.downloadedBeforeDeletion) parts.push('downloaded before deletion')
  if (c.numberReissued) parts.push('number reissued')
  return parts.join(' · ')
}

export function labActivitySubject(report: LabActivityReport, cadence?: LabActivityCadence | null): string {
  const tail = cadence ? ` · ${cadence}` : ''
  return `QC lab activity · ${periodLabel(report.period)}${tail}`
}

export interface LabActivityEmail {
  subject: string
  html: string
  text: string
}

const TD = 'padding:6px 10px;border-bottom:1px solid #e5e5e5;font-size:13px;vertical-align:top;'
const TH = 'padding:6px 10px;border-bottom:2px solid #556b2f;font-size:12px;text-align:left;color:#556b2f;text-transform:uppercase;letter-spacing:0.03em;'
const NUM = 'text-align:right;font-variant-numeric:tabular-nums;'

export function buildLabActivityEmail(
  report: LabActivityReport,
  opts: { cadence?: LabActivityCadence | null } = {},
): LabActivityEmail {
  const columns = labActivityColumns(report.breakdown)
  const label = periodLabel(report.period)
  const subject = labActivitySubject(report, opts.cadence)

  // --- HTML --------------------------------------------------------------
  const labRows = report.labs
    .map((lab) => {
      const cells = columns.map((c) => `<td style="${TD}${NUM}">${lab[c.key]}</td>`).join('')
      const name = `${escapeHtml(lab.labName)}${lab.country ? ` <span style="color:#888">(${escapeHtml(lab.country)})</span>` : ''}`
      return `<tr><td style="${TD}">${name}</td>${cells}</tr>`
    })
    .join('')
  const totalCells = columns.map((c) => `<td style="${TD}${NUM}font-weight:600">${report.totals[c.key]}</td>`).join('')
  const labTable = `
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;min-width:420px">
  <thead><tr><th style="${TH}">Lab</th>${columns.map((c) => `<th style="${TH}text-align:right">${escapeHtml(c.label)}</th>`).join('')}</tr></thead>
  <tbody>${labRows}<tr><td style="${TD}font-weight:600">Total</td>${totalCells}</tr></tbody>
</table>`

  const deletedHeaders = ['Lab', 'Sample ref', 'Contract ref', 'Seller', 'Importer', 'Created by', 'Deleted by', 'Deleted at', 'Reason', 'Certificate before deletion']
  const deletedRows = report.deleted
    .map((d) => {
      const cert = d.certificate
      const certStyle = cert ? `${TD}color:#b91c1c;font-weight:600` : TD
      return `<tr>
  <td style="${TD}">${escapeHtml(d.labName)}</td>
  <td style="${TD}white-space:nowrap">${escapeHtml(d.trackingNumber)}${d.sampleType ? ` <span style="color:#888">${escapeHtml(d.sampleType.toUpperCase())}</span>` : ''}</td>
  <td style="${TD}">${escapeHtml(d.contractRef ?? '—')}</td>
  <td style="${TD}">${escapeHtml(d.seller ?? '—')}</td>
  <td style="${TD}">${escapeHtml(d.importer ?? '—')}</td>
  <td style="${TD}">${escapeHtml(d.createdBy ?? '—')}</td>
  <td style="${TD}">${escapeHtml(d.deletedBy ?? '—')}</td>
  <td style="${TD}white-space:nowrap">${escapeHtml(fmtDateTime(d.deletedAt))}</td>
  <td style="${TD}">${escapeHtml(d.deletedReason ?? '—')}</td>
  <td style="${certStyle}">${escapeHtml(certificateBeforeDeletionLabel(d))}</td>
</tr>`
    })
    .join('')
  const deletedSection = report.deleted.length === 0
    ? `<p style="font-size:13px;color:#555">No samples were deleted in this period.</p>`
    : `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
  <thead><tr>${deletedHeaders.map((h) => `<th style="${TH}">${escapeHtml(h)}</th>`).join('')}</tr></thead>
  <tbody>${deletedRows}</tbody>
</table>`

  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#151618;max-width:1100px">
  <p style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#556b2f;margin:0 0 4px">Wolthers QC</p>
  <h2 style="font-size:18px;margin:0 0 4px">Lab activity · ${escapeHtml(label)}</h2>
  <p style="font-size:13px;color:#555;margin:0 0 16px">${opts.cadence ? `${escapeHtml(opts.cadence[0].toUpperCase() + opts.cadence.slice(1))} digest, per laboratory.` : 'Per laboratory.'}</p>
  ${labTable}
  <h3 style="font-size:14px;margin:24px 0 8px">Deleted samples${report.deleted.length ? ` (${report.deleted.length})` : ''}</h3>
  ${deletedSection}
  <p style="font-size:11px;color:#888;margin-top:20px">
    Approved and rejected count certificates issued in the period (one per contract), by the sample's lab; a lot deleted after its certificate still counts and is listed above.
    Deleted counts every sample row whose deletion falls in the period. Generated ${escapeHtml(fmtDateTime(report.generatedAt))} by qc.wolthers.com.
  </p>
</div>`

  // --- Text --------------------------------------------------------------
  const textLines: string[] = [`Lab activity · ${label}`, '']
  for (const lab of report.labs) {
    textLines.push(`${lab.labName}: ${columns.map((c) => `${c.label} ${lab[c.key]}`).join(', ')}`)
  }
  textLines.push(`Total: ${columns.map((c) => `${c.label} ${report.totals[c.key]}`).join(', ')}`, '')
  if (report.deleted.length === 0) {
    textLines.push('No samples were deleted in this period.')
  } else {
    textLines.push(`Deleted samples (${report.deleted.length}):`)
    for (const d of report.deleted) {
      textLines.push(
        `- ${d.trackingNumber} [${d.labName}] contract ${d.contractRef ?? '—'} · seller ${d.seller ?? '—'} · importer ${d.importer ?? '—'} · ` +
          `created by ${d.createdBy ?? '—'} · deleted by ${d.deletedBy ?? '—'} on ${fmtDateTime(d.deletedAt)}` +
          `${d.deletedReason ? ` (${d.deletedReason})` : ''} · ${certificateBeforeDeletionLabel(d)}`,
      )
    }
  }
  textLines.push('', `Generated ${fmtDateTime(report.generatedAt)} by qc.wolthers.com.`)

  return { subject, html, text: textLines.join('\n') }
}
