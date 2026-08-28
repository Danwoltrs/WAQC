/**
 * One certificate per group member.
 *
 * A physical sample that covers N contracts is N `samples` rows — a lab unit
 * and its siblings (see src/lib/sample-group.ts). Each row gets exactly one
 * certificate, and a decision applies to the whole group. Everything that
 * certifies a lot — the two finalize routes, POST /api/samples/[id]/certificate,
 * the quality-assessment auto-certify and the siblings endpoint — mints through
 * here so the rules exist once:
 *
 *  - Members are minted in group order (lab unit, then contract_ordinal), so
 *    the gap-free number series follows contract order.
 *  - Numbers are NEVER generated here. A row goes in with certificate_number
 *    null and the assign_certificate_number trigger fills it (the lab unit
 *    reuses its tracking number; a sibling mints a fresh official number).
 *  - A member that already has a certificate is revised in place and keeps its
 *    number. Re-finalizing must never produce a second number.
 *  - Every insert error is inspected and reported. supabase-js resolves rather
 *    than throws, and the old sub-contract loop swallowed the trigger RAISE
 *    that left splits with no certificate and nothing to print on the sleeve.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchGroup, groupSampleIds, isLabUnit } from '@/lib/sample-group'

/**
 * A certificate row as the mint hands it back. A fresh insert and a revision
 * both select `created_at`; the "update failed, keep what we read" fallback
 * carries `revision_number`/`approved` instead. Left open so a route can put
 * the row straight into its response body.
 */
export type MintedCertificate = {
  id: string
  certificate_number: string | null
} & Record<string, unknown>

export interface MintGroupOptions {
  /** Acting user (auth.users id) — recorded as issued_by / the version's created_by. */
  issuedBy: string
  isRejected: boolean
  /** ISO timestamps; see resolveValidityWindow for the per-client window. */
  validFrom: string
  validUntil: string | null
  /** Compliance violations to stamp on every member; [] writes NULL. */
  violations?: string[]
  /**
   * Written on FRESH certificates only. A revision never touches
   * override_comment: it prints verbatim on the customer's certificate, and
   * this path once overwrote genuine remarks with bookkeeping.
   */
  overrideComment?: string | null
  /**
   * Default true (a finalize is a decision, and an existing certificate must
   * reflect it). False for "make sure a certificate exists" callers, which
   * leave an existing row exactly as it is.
   */
  reviseExisting?: boolean
  /** Mint only these members (e.g. siblings just created on a certified lot). */
  onlySampleIds?: string[]
}

export interface MintGroupResult {
  /** Sample ids whose certificate was inserted, in group order. */
  minted: string[]
  /** Sample ids whose existing certificate was revised in place. */
  revised: string[]
  /** Sample ids whose existing certificate was left alone (reviseExisting: false). */
  unchanged: string[]
  failed: Array<{ sampleId: string; error: string }>
  /** The certificate row per sample id — inserted, revised, or as read when a revision failed. */
  certificates: Record<string, MintedCertificate>
}

const emptyResult = (): MintGroupResult => ({ minted: [], revised: [], unchanged: [], failed: [], certificates: {} })

/**
 * Certificate validity window, per client: qc_client_settings
 * .certificate_validity_months. NULL/0 → no expiry is printed (the
 * "Certificate validity period" toggle is off for that client).
 */
export async function resolveValidityWindow(
  db: SupabaseClient<any>,
  clientId: string | null,
  from: Date = new Date(),
): Promise<{ validFrom: string; validUntil: string | null }> {
  let validUntil: Date | null = null
  if (clientId) {
    const { data } = await db
      .from('qc_client_settings')
      .select('certificate_validity_months')
      .eq('company_id', clientId)
      .maybeSingle()
    const months = data?.certificate_validity_months
    if (typeof months === 'number' && months > 0) {
      validUntil = new Date(from)
      validUntil.setMonth(validUntil.getMonth() + months)
    }
  }
  return { validFrom: from.toISOString(), validUntil: validUntil ? validUntil.toISOString() : null }
}

export async function mintGroupCertificates(
  db: SupabaseClient<any>,
  sampleId: string,
  opts: MintGroupOptions,
): Promise<MintGroupResult> {
  const result = emptyResult()
  const members = await fetchGroup(db, sampleId)
  if (members.length === 0) return result

  const only = opts.onlySampleIds ? new Set(opts.onlySampleIds) : null
  const targets = only ? members.filter((m) => only.has(m.id)) : members
  if (targets.length === 0) return result

  const violations = opts.violations ?? []
  const complianceViolations = violations.length > 0 ? violations : null
  const reviseExisting = opts.reviseExisting ?? true
  const labUnit = members.find(isLabUnit) ?? members[0]

  // One read each for the group's existing certificates and its clients'
  // names, instead of two per member.
  const { data: existingRows } = await db
    .from('certificates')
    .select('id, sample_id, certificate_number, is_rejected, compliance_violations, revision_number, approved, created_at')
    .in('sample_id', targets.map((m) => m.id))
  const existingBySample = new Map<string, MintedCertificate>()
  for (const row of ((existingRows ?? []) as Array<MintedCertificate & { sample_id: string; created_at?: string | null }>)
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))) {
    if (!existingBySample.has(row.sample_id)) existingBySample.set(row.sample_id, row)
  }

  const clientIds = [...new Set([labUnit.client_id, ...targets.map((m) => m.client_id)].filter(Boolean))] as string[]
  const nameByClient = new Map<string, string>()
  if (clientIds.length > 0) {
    const { data: companies } = await db.from('companies').select('id, name, fantasy_name').in('id', clientIds)
    for (const c of (companies ?? []) as Array<{ id: string; name: string | null; fantasy_name: string | null }>) {
      const name = c.fantasy_name || c.name
      if (name) nameByClient.set(c.id, name)
    }
  }
  const labUnitIssuedTo = (labUnit.client_id && nameByClient.get(labUnit.client_id)) || 'Unknown Client'

  for (const member of targets) {
    const existing = existingBySample.get(member.id)

    if (existing) {
      if (!reviseExisting) {
        result.unchanged.push(member.id)
        result.certificates[member.id] = existing
        continue
      }

      // Re-certification: keep the number, record what changed.
      const previousIsRejected = Boolean(existing.is_rejected ?? false)
      const previousViolations = (existing.compliance_violations as string[] | null) || []
      const changes: string[] = []
      if (previousIsRejected !== opts.isRejected) {
        changes.push(previousIsRejected
          ? 'Decision changed from REJECTED to APPROVED'
          : 'Decision changed from APPROVED to REJECTED')
      }
      const added = violations.filter((v) => !previousViolations.includes(v))
      const removed = previousViolations.filter((v) => !violations.includes(v))
      if (added.length > 0) changes.push(`New violations: ${added.join('; ')}`)
      if (removed.length > 0) changes.push(`Resolved violations: ${removed.join('; ')}`)
      if (changes.length === 0) changes.push('Re-certified with no changes to decision or violations')

      const revisionNumber = Number(existing.revision_number ?? 0)

      // Version history first, off the pre-update revision. This is where the
      // change description lives — never in override_comment.
      await db.from('certificate_versions').insert({
        certificate_id: existing.id,
        version_number: revisionNumber,
        changes_description: changes.join('. '),
        created_by: opts.issuedBy,
      })

      // pdf_url cleared so the download route regenerates with current data.
      const { data: updated, error: updateError } = await db
        .from('certificates')
        .update({
          is_rejected: opts.isRejected,
          approved: !opts.isRejected,
          compliance_violations: complianceViolations,
          revision_number: revisionNumber + 1,
          pdf_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('id, certificate_number, created_at, is_rejected, compliance_violations')
        .single()

      if (updateError) {
        console.error(`[certificate-mint] revision of ${existing.id} (sample ${member.id}) failed:`, updateError.message)
        result.failed.push({ sampleId: member.id, error: updateError.message })
        result.certificates[member.id] = existing
      } else {
        result.revised.push(member.id)
        result.certificates[member.id] = updated as MintedCertificate
      }
      continue
    }

    const issuedTo = (member.client_id && nameByClient.get(member.client_id)) || labUnitIssuedTo
    const insertRow: Record<string, unknown> = {
      sample_id: member.id,
      certificate_number: null,
      issued_to: issuedTo,
      issued_by: opts.issuedBy,
      status: 'issued',
      valid_from: opts.validFrom,
      valid_until: opts.validUntil,
      is_rejected: opts.isRejected,
      compliance_violations: complianceViolations,
    }
    if (opts.overrideComment) insertRow.override_comment = opts.overrideComment

    const { data: inserted, error: insertError } = await db
      .from('certificates')
      .insert(insertRow)
      .select('id, certificate_number, created_at, is_rejected, compliance_violations')
      .single()

    if (insertError || !inserted) {
      const message = insertError?.message || 'insert returned no row'
      console.error(
        `[certificate-mint] certificate for sample ${member.id} (group of ${labUnit.id}) failed:`,
        message, insertError?.details || '', insertError?.hint || '',
      )
      result.failed.push({ sampleId: member.id, error: message })
      continue
    }
    result.minted.push(member.id)
    result.certificates[member.id] = inserted as MintedCertificate
  }

  return result
}

export type GroupDecisionPatch = Partial<{
  status: string
  workflow_stage: string
  seller_comment: string | null
}>

/**
 * Applies a status / stage / seller-comment patch to every member of the
 * group `sampleId` belongs to (decision 3 of the spec: siblings never
 * diverge). An unknown id updates itself alone, so a caller is never left
 * with a silent no-op. Non-throwing: the database error comes back for the
 * caller to word.
 */
export async function applyDecisionToGroup(
  db: SupabaseClient<any>,
  sampleId: string,
  patch: GroupDecisionPatch,
): Promise<{ ids: string[]; error: { message: string } | null }> {
  const resolved = await groupSampleIds(db, sampleId)
  const ids = resolved.length > 0 ? resolved : [sampleId]
  const { error } = await db
    .from('samples')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .in('id', ids)
  return { ids, error: error ? { message: error.message } : null }
}
