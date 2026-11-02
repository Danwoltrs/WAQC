/**
 * The lab activity digest as an email: a per-lab table, totals, and one row
 * per deleted sample with the certificate column the trading desk reads
 * first. Pure — the same builder feeds the cron send and the in-app "Send
 * now", and the in-app view renders the same report from JSON.
 */
import { escapeHtml } from '@/lib/html'
import {
  MONTHS_SHORT,
  labCountrySuffix,
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

const TD = 'padding:8px 10px;border-bottom:1px solid #e5e5e5;font-size:14px;vertical-align:top;'
const TH = 'padding:6px 10px;border-bottom:2px solid #556b2f;font-size:11px;text-align:left;color:#556b2f;text-transform:uppercase;letter-spacing:0.04em;font-weight:600;'
const NUM = 'text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;'
const MUTED = 'color:#888;'

/** "Created and deleted by X" when one person did both, else both names. */
function whoLine(d: DeletedSampleRow): string {
  if (d.createdBy && d.createdBy === d.deletedBy) return `Created and deleted by ${d.createdBy}`
  const parts: string[] = []
  if (d.createdBy) parts.push(`Created by ${d.createdBy}`)
  parts.push(`Deleted by ${d.deletedBy ?? '—'}`)
  return parts.join(' · ')
}

/** "Contract 42611/26 · Seller Ipanema · Importer Blaser", skipping blanks. */
function tradeLine(d: DeletedSampleRow): string {
  const parts: string[] = []
  if (d.contractRef) parts.push(`Contract ${d.contractRef}`)
  if (d.seller) parts.push(`Seller ${d.seller}`)
  if (d.importer) parts.push(`Importer ${d.importer}`)
  return parts.length ? parts.join(' · ') : 'No contract on the sample'
}

export function buildLabActivityEmail(
  report: LabActivityReport,
  opts: { cadence?: LabActivityCadence | null } = {},
): LabActivityEmail {
  const columns = labActivityColumns(report.breakdown)
  const label = periodLabel(report.period)
  const subject = labActivitySubject(report, opts.cadence)
  const cadence = opts.cadence ? `${opts.cadence[0].toUpperCase()}${opts.cadence.slice(1)} digest` : 'Digest'

  // --- HTML --------------------------------------------------------------
  const labRows = report.labs
    .map((lab) => {
      const cells = columns
        .map((c) => `<td style="${TD}${NUM}${lab[c.key] === 0 ? MUTED : ''}">${lab[c.key]}</td>`)
        .join('')
      const country = labCountrySuffix(lab.labName, lab.country)
      const name = `${escapeHtml(lab.labName)}${country ? ` <span style="${MUTED}">(${escapeHtml(country)})</span>` : ''}`
      return `<tr><td style="${TD}">${name}</td>${cells}</tr>`
    })
    .join('')
  const totalCells = columns.map((c) => `<td style="${TD}${NUM}font-weight:700;border-bottom:none">${report.totals[c.key]}</td>`).join('')
  const labTable = `
<table cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;width:100%;max-width:640px">
  <thead><tr><th style="${TH}">Lab</th>${columns.map((c) => `<th style="${TH}text-align:right">${escapeHtml(c.label)}</th>`).join('')}</tr></thead>
  <tbody>${labRows}<tr><td style="${TD}font-weight:700;border-bottom:none">Total</td>${totalCells}</tr></tbody>
</table>`

  // One card per deleted sample: a 10-column table cannot be read on a phone.
  const multiLab = new Set(report.deleted.map((d) => d.labName)).size > 1 || report.labs.length > 1
  const deletedCards = report.deleted
    .map((d) => {
      const cert = d.certificate
      const type = d.sampleType ? ` <span style="font-size:11px;font-weight:600;color:#556b2f;border:1px solid #556b2f;border-radius:3px;padding:0 4px;margin-left:4px">${escapeHtml(d.sampleType.toUpperCase())}</span>` : ''
      const certLine = cert
        ? `<div style="margin-top:6px;font-size:13px;color:#b91c1c;font-weight:600">Certificate ${escapeHtml(certificateBeforeDeletionLabel(d))}</div>`
        : `<div style="margin-top:6px;font-size:13px;${MUTED}">No certificate</div>`
      return `<div style="border-left:3px solid ${cert ? '#b91c1c' : '#d4d4d4'};padding:8px 0 8px 12px;margin:0 0 12px">
  <div style="font-size:15px;font-weight:600">${escapeHtml(d.sampleRef)}${type}</div>
  <div style="font-size:13px;margin-top:4px">${escapeHtml(tradeLine(d))}</div>
  <div style="font-size:13px;margin-top:2px;color:#555">${escapeHtml(whoLine(d))} · ${escapeHtml(fmtDateTime(d.deletedAt))}${multiLab ? ` · ${escapeHtml(d.labName)}` : ''}</div>
  ${d.deletedReason ? `<div style="font-size:13px;margin-top:2px;color:#555">Reason: ${escapeHtml(d.deletedReason)}</div>` : ''}
  ${certLine}
</div>`
    })
    .join('')
  const deletedSection = report.deleted.length === 0
    ? `<p style="font-size:13px;color:#555;margin:0">No samples were deleted in this period.</p>`
    : deletedCards

  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#151618;max-width:640px">
  <p style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#556b2f;margin:0 0 4px">Wolthers QC</p>
  <h2 style="font-size:20px;margin:0 0 4px">Lab activity · ${escapeHtml(label)}</h2>
  <p style="font-size:13px;color:#555;margin:0 0 16px">${escapeHtml(cadence)}, per lab.</p>
  ${labTable}
  <h3 style="font-size:15px;margin:28px 0 10px">Deleted samples${report.deleted.length ? ` (${report.deleted.length})` : ''}</h3>
  ${deletedSection}
  <p style="font-size:11px;line-height:1.5;color:#888;margin-top:24px">
    Approved and rejected are certificates issued in the period, one per contract, under the sample's lab. A lot deleted after certification still counts.<br>
    Generated ${escapeHtml(fmtDateTime(report.generatedAt))} · qc.wolthers.com
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
        `- ${d.sampleRef}${d.sampleType ? ` (${d.sampleType.toUpperCase()})` : ''}${multiLab ? ` · ${d.labName}` : ''}`,
        `  ${tradeLine(d)}`,
        `  ${whoLine(d)} · ${fmtDateTime(d.deletedAt)}`,
      )
      if (d.deletedReason) textLines.push(`  Reason: ${d.deletedReason}`)
      textLines.push(`  ${d.certificate ? `Certificate ${certificateBeforeDeletionLabel(d)}` : 'No certificate'}`)
    }
  }
  textLines.push('', `Generated ${fmtDateTime(report.generatedAt)} · qc.wolthers.com`)

  return { subject, html, text: textLines.join('\n') }
}
