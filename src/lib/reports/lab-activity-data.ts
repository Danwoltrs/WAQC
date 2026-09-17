/**
 * Lab activity summary — the scheduled per-lab digest for the trading desk.
 *
 * Per laboratory over a period: PSS approved, SS rejected (or, with the full
 * breakdown, approved and rejected for both), and samples deleted — with a
 * detail row per deleted sample that says who registered it, who deleted it,
 * when, why, and whether a certificate existed before the deletion. That
 * last column is the point of the report: a lab that issues a certificate,
 * sends it, deletes the record and invoices elsewhere shows up here.
 *
 * Period and breakdown are parameters; the cron picks them from its cadence,
 * the in-app view from the user. `aggregateLabActivity` is pure; the fetch
 * lives in `getLabActivityReport`.
 *
 * Counting rules:
 *   - Approved / rejected count CERTIFICATES issued in the period (same unit
 *     as the client reports: one certificate per contract), by the sample's
 *     lab and type. A certificate whose sample was deleted later still
 *     counts — the approval happened — and the lot appears in the deleted
 *     table with its certificate flagged.
 *   - Deleted counts every sample row (lab units and contract siblings) whose
 *     deleted_at falls in the period, whatever its type.
 *   - The period end is EXCLUSIVE (ISO dates), as on the other report routes.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { selectInChunks } from '@/lib/supabase-in-chunks'

export type LabActivityBreakdown = 'pss_approved_ss_rejected' | 'full'
export type LabActivityCadence = 'weekly' | 'monthly'

export const LAB_ACTIVITY_BREAKDOWNS: LabActivityBreakdown[] = ['pss_approved_ss_rejected', 'full']
export const LAB_ACTIVITY_CADENCES: LabActivityCadence[] = ['weekly', 'monthly']

export interface LabActivityPeriod {
  /** YYYY-MM-DD, inclusive. */
  start: string
  /** YYYY-MM-DD, EXCLUSIVE. */
  end: string
}

export interface LabActivityLabRow {
  labId: string | null
  labName: string
  country: string | null
  pssApproved: number
  pssRejected: number
  ssApproved: number
  ssRejected: number
  /** Certificates for other sample types (type, specialty, stocklot) issued in the period. */
  otherIssued: number
  deleted: number
}

export interface DeletedSampleRow {
  sampleId: string
  labName: string
  trackingNumber: string
  sampleType: string | null
  contractRef: string | null
  seller: string | null
  importer: string | null
  createdBy: string | null
  createdAt: string | null
  deletedBy: string | null
  deletedAt: string
  deletedReason: string | null
  /** The certificate that existed when the sample was deleted, if any. */
  certificate: {
    number: string | null
    issuedAt: string | null
    isRejected: boolean
    /** A certificate_sent event before the deletion. */
    sentBeforeDeletion: boolean
    /** A certificate_downloaded event before the deletion. */
    downloadedBeforeDeletion: boolean
  } | null
}

export interface LabActivityReport {
  period: LabActivityPeriod
  breakdown: LabActivityBreakdown
  labs: LabActivityLabRow[]
  totals: Omit<LabActivityLabRow, 'labId' | 'labName' | 'country'>
  deleted: DeletedSampleRow[]
  generatedAt: string
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

const isoDate = (d: Date) => d.toISOString().slice(0, 10)

/** Fixed English abbreviations: ICU's en-GB says "Sept", and locale data drifts. */
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/**
 * The last COMPLETE period before `today` (UTC): the previous Monday–Sunday
 * week, or the previous calendar month. `end` is exclusive.
 */
export function previousPeriod(cadence: LabActivityCadence, today: Date = new Date()): LabActivityPeriod {
  const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  if (cadence === 'monthly') {
    const firstOfThisMonth = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1))
    const firstOfLastMonth = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1))
    return { start: isoDate(firstOfLastMonth), end: isoDate(firstOfThisMonth) }
  }
  const day = t.getUTCDay() // 0 = Sunday
  const offsetToMonday = day === 0 ? -6 : -(day - 1)
  const thisMonday = new Date(t)
  thisMonday.setUTCDate(t.getUTCDate() + offsetToMonday)
  const lastMonday = new Date(thisMonday)
  lastMonday.setUTCDate(thisMonday.getUTCDate() - 7)
  return { start: isoDate(lastMonday), end: isoDate(thisMonday) }
}

/** "8 – 14 Sep 2026" / "1 – 31 Aug 2026" / "29 Sep – 5 Oct 2026" — the inclusive range. */
export function periodLabel(period: LabActivityPeriod): string {
  const start = new Date(`${period.start}T00:00:00Z`)
  const lastDay = new Date(`${period.end}T00:00:00Z`)
  lastDay.setUTCDate(lastDay.getUTCDate() - 1)
  const month = (d: Date) => MONTHS_SHORT[d.getUTCMonth()]
  const sameMonth = start.getUTCFullYear() === lastDay.getUTCFullYear() && start.getUTCMonth() === lastDay.getUTCMonth()
  if (sameMonth) return `${start.getUTCDate()} – ${lastDay.getUTCDate()} ${month(lastDay)} ${lastDay.getUTCFullYear()}`
  const sameYear = start.getUTCFullYear() === lastDay.getUTCFullYear()
  const left = `${start.getUTCDate()} ${month(start)}${sameYear ? '' : ` ${start.getUTCFullYear()}`}`
  return `${left} – ${lastDay.getUTCDate()} ${month(lastDay)} ${lastDay.getUTCFullYear()}`
}

/** A YYYY-MM-DD string, or null. */
export function parseIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const d = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || isoDate(d) !== value ? null : value
}

export function isLabActivityBreakdown(value: unknown): value is LabActivityBreakdown {
  return typeof value === 'string' && (LAB_ACTIVITY_BREAKDOWNS as string[]).includes(value)
}

export function isLabActivityCadence(value: unknown): value is LabActivityCadence {
  return typeof value === 'string' && (LAB_ACTIVITY_CADENCES as string[]).includes(value)
}

// ---------------------------------------------------------------------------
// Aggregation (pure)
// ---------------------------------------------------------------------------

export interface LabInput {
  id: string
  name: string
  country: string | null
  is_active?: boolean | null
}

export interface CertificateInput {
  id: string
  created_at: string
  is_rejected: boolean | null
  sample: { id: string; laboratory_id: string | null; sample_type: string | null } | null
}

export interface DeletedSampleInput {
  id: string
  tracking_number: string
  laboratory_id: string | null
  sample_type: string | null
  wolthers_contract_nr: string | null
  buyer_contract_nr: string | null
  created_at: string | null
  created_by: string | null
  deleted_at: string
  deleted_by: string | null
  deleted_reason: string | null
  seller: { name: string | null; fantasy_name: string | null } | null
  importer: { name: string | null; fantasy_name: string | null } | null
  qc_client: { name: string | null; fantasy_name: string | null } | null
  importer_is_qc_client: boolean | null
}

export interface DeletedCertificateInput {
  sample_id: string
  certificate_number: string | null
  created_at: string | null
  issued_at?: string | null
  is_rejected: boolean | null
}

export interface DeletedEventInput {
  sample_id: string
  event_type: string
  occurred_at: string
}

export interface AggregateInput {
  labs: LabInput[]
  certificates: CertificateInput[]
  deletedSamples: DeletedSampleInput[]
  deletedCertificates: DeletedCertificateInput[]
  deletedEvents: DeletedEventInput[]
  /** user id → display name */
  userNames: Map<string, string>
}

const UNKNOWN_LAB = 'Unassigned lab'

const displayName = (c: { name: string | null; fantasy_name: string | null } | null | undefined) =>
  c?.fantasy_name?.trim() || c?.name?.trim() || null

function emptyCounts(): Omit<LabActivityLabRow, 'labId' | 'labName' | 'country'> {
  return { pssApproved: 0, pssRejected: 0, ssApproved: 0, ssRejected: 0, otherIssued: 0, deleted: 0 }
}

export function aggregateLabActivity(
  input: AggregateInput,
  opts: { period: LabActivityPeriod; breakdown: LabActivityBreakdown; now?: Date },
): LabActivityReport {
  const rows = new Map<string, LabActivityLabRow>()
  const rowFor = (labId: string | null): LabActivityLabRow => {
    const key = labId ?? ''
    let row = rows.get(key)
    if (!row) {
      const lab = labId ? input.labs.find((l) => l.id === labId) : undefined
      row = { labId, labName: lab?.name ?? UNKNOWN_LAB, country: lab?.country ?? null, ...emptyCounts() }
      rows.set(key, row)
    }
    return row
  }
  // Every active lab is listed, activity or not: a silent lab is information.
  for (const lab of input.labs) if (lab.is_active !== false) rowFor(lab.id)

  for (const c of input.certificates) {
    if (!c.sample) continue
    const row = rowFor(c.sample.laboratory_id)
    const rejected = Boolean(c.is_rejected)
    const type = (c.sample.sample_type ?? '').toLowerCase()
    if (type === 'pss') rejected ? row.pssRejected++ : row.pssApproved++
    else if (type === 'ss') rejected ? row.ssRejected++ : row.ssApproved++
    else row.otherIssued++
  }

  const certsBySample = new Map<string, DeletedCertificateInput>()
  for (const c of input.deletedCertificates) {
    const prev = certsBySample.get(c.sample_id)
    if (!prev || String(c.created_at ?? '') > String(prev.created_at ?? '')) certsBySample.set(c.sample_id, c)
  }
  const eventsBySample = new Map<string, DeletedEventInput[]>()
  for (const e of input.deletedEvents) {
    const list = eventsBySample.get(e.sample_id) ?? []
    list.push(e)
    eventsBySample.set(e.sample_id, list)
  }

  const deleted: DeletedSampleRow[] = []
  for (const s of input.deletedSamples) {
    const row = rowFor(s.laboratory_id)
    row.deleted++
    const cert = certsBySample.get(s.id) ?? null
    const before = (type: string) =>
      (eventsBySample.get(s.id) ?? []).some((e) => e.event_type === type && e.occurred_at <= s.deleted_at)
    deleted.push({
      sampleId: s.id,
      labName: row.labName,
      trackingNumber: s.tracking_number,
      sampleType: s.sample_type,
      contractRef: s.wolthers_contract_nr?.trim() || s.buyer_contract_nr?.trim() || null,
      seller: displayName(s.seller),
      importer: displayName(s.importer) ?? (s.importer_is_qc_client ? displayName(s.qc_client) : null),
      createdBy: s.created_by ? input.userNames.get(s.created_by) ?? s.created_by : null,
      createdAt: s.created_at,
      deletedBy: s.deleted_by ? input.userNames.get(s.deleted_by) ?? s.deleted_by : null,
      deletedAt: s.deleted_at,
      deletedReason: s.deleted_reason?.trim() || null,
      certificate: cert
        ? {
            number: cert.certificate_number,
            issuedAt: cert.issued_at ?? cert.created_at ?? null,
            isRejected: Boolean(cert.is_rejected),
            sentBeforeDeletion: before('certificate_sent'),
            downloadedBeforeDeletion: before('certificate_downloaded'),
          }
        : null,
    })
  }
  deleted.sort((a, b) => a.labName.localeCompare(b.labName) || a.deletedAt.localeCompare(b.deletedAt))

  const labs = [...rows.values()].sort((a, b) => {
    // Named labs alphabetically; the unassigned bucket last.
    if (!a.labId !== !b.labId) return a.labId ? -1 : 1
    return a.labName.localeCompare(b.labName)
  })
  const totals = emptyCounts()
  for (const r of labs) {
    totals.pssApproved += r.pssApproved
    totals.pssRejected += r.pssRejected
    totals.ssApproved += r.ssApproved
    totals.ssRejected += r.ssRejected
    totals.otherIssued += r.otherIssued
    totals.deleted += r.deleted
  }

  return {
    period: opts.period,
    breakdown: opts.breakdown,
    labs,
    totals,
    deleted,
    generatedAt: (opts.now ?? new Date()).toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Build the report from the database. `db` should be a service-role client:
 * the cron has no session, and deleted rows and sample_events are what the
 * report is about.
 */
export async function getLabActivityReport(
  db: SupabaseClient<any>,
  opts: { period: LabActivityPeriod; breakdown: LabActivityBreakdown },
): Promise<LabActivityReport> {
  const startIso = `${opts.period.start}T00:00:00.000Z`
  const endIso = `${opts.period.end}T00:00:00.000Z`
  // Untyped: the generated types do not know sample_events or the new sample
  // columns yet, and the embeds below are shaped by their FK hints.
  const q = db as any

  const [labsRes, certsRes, deletedRes] = await Promise.all([
    q.from('laboratories').select('id, name, country, is_active').order('name'),
    q
      .from('certificates')
      .select('id, created_at, is_rejected, sample:samples!certificates_sample_id_fkey(id, laboratory_id, sample_type)')
      .gte('created_at', startIso)
      .lt('created_at', endIso),
    q
      .from('samples')
      .select(
        'id, tracking_number, laboratory_id, sample_type, wolthers_contract_nr, buyer_contract_nr, created_at, created_by, ' +
          'deleted_at, deleted_by, deleted_reason, importer_is_qc_client, ' +
          'seller:companies!samples_seller_id_fkey(name, fantasy_name), ' +
          'importer:companies!samples_importer_id_fkey(name, fantasy_name), ' +
          'qc_client:companies!samples_client_id_fkey(name, fantasy_name)',
      )
      .gte('deleted_at', startIso)
      .lt('deleted_at', endIso),
  ])
  for (const [label, res] of [['laboratories', labsRes], ['certificates', certsRes], ['deleted samples', deletedRes]] as const) {
    if (res.error) throw new Error(`lab activity: ${label} query failed: ${res.error.message}`)
  }

  const deletedSamples = (deletedRes.data ?? []) as unknown as DeletedSampleInput[]
  const deletedIds = deletedSamples.map((s) => s.id)

  let deletedCertificates: DeletedCertificateInput[] = []
  let deletedEvents: DeletedEventInput[] = []
  const userNames = new Map<string, string>()
  if (deletedIds.length > 0) {
    const [certs, events] = await Promise.all([
      selectInChunks<DeletedCertificateInput>(deletedIds, (chunk) =>
        q.from('certificates').select('sample_id, certificate_number, created_at, issued_at, is_rejected').in('sample_id', chunk),
      ),
      selectInChunks<DeletedEventInput>(deletedIds, (chunk) =>
        q
          .from('sample_events')
          .select('sample_id, event_type, occurred_at')
          .in('sample_id', chunk)
          .in('event_type', ['certificate_sent', 'certificate_downloaded']),
      ),
    ])
    if (certs.error) throw new Error(`lab activity: certificates of deleted samples failed: ${certs.error.message}`)
    // The event log may not exist yet on an environment behind on migrations;
    // the table then simply reports no sends.
    if (events.error) console.warn('[lab-activity] sample_events query failed (sends unknown):', events.error.message)
    deletedCertificates = certs.data ?? []
    deletedEvents = events.data ?? []

    const userIds = [...new Set(deletedSamples.flatMap((s) => [s.created_by, s.deleted_by]).filter(Boolean))] as string[]
    if (userIds.length > 0) {
      const { data } = await selectInChunks<{ id: string; full_name: string | null; email: string | null }>(userIds, (chunk) =>
        q.from('profiles').select('id, full_name, email').in('id', chunk),
      )
      for (const p of data ?? []) userNames.set(p.id, p.full_name?.trim() || p.email || p.id)
    }
  }

  return aggregateLabActivity(
    {
      labs: (labsRes.data ?? []) as unknown as LabInput[],
      certificates: (certsRes.data ?? []) as unknown as CertificateInput[],
      deletedSamples,
      deletedCertificates,
      deletedEvents,
      userNames,
    },
    opts,
  )
}
