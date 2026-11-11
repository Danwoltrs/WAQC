// src/lib/portal/spec-change-email.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendMail } from '@/lib/graph/send'
import { HOUSE_CC } from '@/lib/approval-notification/resolve-panels'
import { isValidEmail } from '@/lib/html'
import { companyDisplayName } from '@/lib/contract-intake-mapping'
import { diffSpecParameters, formatSpecDate, type SpecChange } from '@/lib/quality-spec/spec-diff'
import { WOLTHERS_CANCEL_NOTE, type VersionRow } from '@/lib/quality-spec/types'
import { BODY_OPEN, QC_MAILBOX, SIGNATURE, escapeHtml, sandboxedRecipients, type BuiltEmail } from './invite-email'
import { portalServiceClient } from './qc-portal-gate'
import { qualityName } from './portal-qualities-fetch'
import { noSan } from './portal-qualities'

/**
 * The email a client's spec change (or its cancellation) sends to Wolthers
 * head office (HOUSE_CC, house rule) and to every lab that graded this
 * quality in the last year. Only client versions are ever emailed (R29):
 * Wolthers and migration versions never are. Sent from the QC mailbox;
 * MICROSOFT_GRAPH_TEST_RECIPIENT redirects it, as every QC email.
 *
 * Never carries a SAN number or a fee_ field.
 */

export interface SpecChangeEmailInput {
  clientName: string
  qualityName: string
  versionNo: number
  effectiveFrom: string // YYYY-MM-DD
  changedBy: string
  note: string | null
  changes: SpecChange[]
  cancelled?: boolean
  /** The client's change was cancelled by a Wolthers change to the spec (R33); `changedBy` is the staff member. */
  cancelledByWolthers?: boolean
}

const LAB_LOOKBACK_DAYS = 365
const clean = (t: string): string => noSan(t) ?? ''
const hasFee = (c: SpecChange) => /fee_/i.test(`${c.path} ${c.before} ${c.after}`)

export function buildSpecChangeEmail(input: SpecChangeEmailInput): BuiltEmail {
  const quality = clean(input.qualityName)
  const client = clean(input.clientName)
  const who = clean(input.changedBy)
  const date = formatSpecDate(input.effectiveFrom)
  const note = input.note ? clean(input.note) : ''
  const changes = input.changes
    .filter((c) => !hasFee(c))
    .map((c) => clean(`${c.section}: ${c.path} ${c.before} → ${c.after}`))

  const subject = input.cancelled
    ? `Quality specification change cancelled: ${quality} for ${client}, from ${date}`
    : `Quality specification changed: ${quality} for ${client}, from ${date}`
  const intro = input.cancelled && input.cancelledByWolthers
    ? `${who} changed the quality specification ${quality} for ${client} at Wolthers. That cancelled the client change scheduled from ${date} (version ${input.versionNo}). The Wolthers change is in force from today.`
    : input.cancelled
    ? `${who} cancelled the change to the quality specification ${quality} for ${client} that was scheduled from ${date} (version ${input.versionNo}). The specification in force stays as it was.`
    : `${who} changed the quality specification ${quality} for ${client}. The change applies from ${date} (version ${input.versionNo}).`
  const listTitle = input.cancelled ? 'The cancelled change:' : 'Changes:'
  const empty = 'No parameter differs from the previous version.'
  const after = input.cancelled
    ? null
    : 'Lots whose contract is dated from this date, or that have no contract date and start grading from it, use the new version. Lots already started keep theirs.'

  const text = [
    intro,
    '',
    listTitle,
    ...(changes.length ? changes.map((l) => `- ${l}`) : [empty]),
    ...(note ? ['', `Note: ${note}`] : []),
    ...(after ? ['', after] : []),
    '',
    SIGNATURE,
  ].join('\n')

  const html = [
    BODY_OPEN,
    `<p>${escapeHtml(intro)}</p>`,
    `<p>${escapeHtml(listTitle)}</p>`,
    changes.length ? `<ul>${changes.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>` : `<p>${escapeHtml(empty)}</p>`,
    note ? `<p>Note: ${escapeHtml(note)}</p>` : '',
    after ? `<p>${escapeHtml(after)}</p>` : '',
    `<p style="color:#666666">${escapeHtml(SIGNATURE)}</p>`,
    '</body></html>',
  ].join('')

  return { subject, text, html }
}

/** Head office first, then the labs; case-insensitive dedupe, invalid addresses dropped. */
function recipientList(addresses: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of addresses) {
    for (const part of (raw ?? '').split(/[,;\s]+/)) {
      const email = part.trim()
      if (!isValidEmail(email) || seen.has(email.toLowerCase())) continue
      seen.add(email.toLowerCase())
      out.push(email)
    }
  }
  return out
}

/** contact_email of every lab holding a live sample of this quality created in the last year. */
async function labEmails(admin: SupabaseClient<any>, qualityId: string): Promise<string[]> {
  const { data: labs, error } = await admin.from('laboratories').select('id, contact_email')
  if (error) throw new Error(error.message ?? 'Could not read laboratories')
  const since = new Date(Date.now() - LAB_LOOKBACK_DAYS * 86_400_000).toISOString()
  const withEmail = ((labs ?? []) as Array<{ id: string; contact_email: string | null }>).filter((l) => l.contact_email?.trim())
  const used = await Promise.all(
    withEmail.map(async (lab) => {
      const { data, error: sErr } = await admin
        .from('samples')
        .select('id')
        .eq('quality_spec_id', qualityId)
        .eq('laboratory_id', lab.id)
        .is('deleted_at', null)
        .gte('created_at', since)
        .limit(1)
      if (sErr) throw new Error(sErr.message ?? 'Could not read samples')
      return (data ?? []).length > 0
    }),
  )
  return withEmail.filter((_, i) => used[i]).map((l) => l.contact_email as string)
}

async function personName(admin: SupabaseClient<any>, userId: string | null): Promise<string> {
  if (!userId) return 'A portal user'
  const { data } = await admin.from('user_profiles').select('full_name, email').eq('id', userId).maybeSingle()
  return (data as any)?.full_name?.trim() || (data as any)?.email?.trim() || 'A portal user'
}

/**
 * Email a client version (or its cancellation, when the version is
 * cancelled). Sets notified_at after a change email goes out; a cancellation
 * leaves it alone. Never throws: false when nothing was sent.
 */
export async function sendSpecChangeEmail(
  versionId: string,
  admin: SupabaseClient<any> = portalServiceClient(),
): Promise<boolean> {
  try {
    const { data: row, error } = await admin.from('client_quality_versions').select('*').eq('id', versionId).maybeSingle()
    if (error) throw new Error(error.message ?? 'Could not read the version')
    const version = row as VersionRow | null
    if (!version) {
      console.error('[spec-change-email] version not found', versionId)
      return false
    }
    if (version.source !== 'client') return false
    const cancelled = !!version.cancelled_at
    if (!cancelled && version.notified_at) return true

    const { data: quality, error: qErr } = await admin
      .from('client_qualities')
      .select('id, client_id, custom_name, template:quality_templates!client_qualities_template_id_fkey(name, name_en)')
      .eq('id', version.client_quality_id)
      .maybeSingle()
    if (qErr) throw new Error(qErr.message ?? 'Could not read the quality')
    if (!quality) {
      console.error('[spec-change-email] quality not found for version', versionId)
      return false
    }

    const [companyRead, earlierRead, changedBy, labs] = await Promise.all([
      admin.from('companies').select('id, name, fantasy_name').eq('id', (quality as any).client_id).maybeSingle(),
      admin
        .from('client_quality_versions')
        .select('id, version_no, spec, cancelled_at')
        .eq('client_quality_id', version.client_quality_id)
        .lt('version_no', version.version_no)
        .is('cancelled_at', null),
      personName(admin, cancelled ? version.cancelled_by : version.created_by),
      labEmails(admin, version.client_quality_id),
    ])
    if (earlierRead.error) throw new Error(earlierRead.error.message ?? 'Could not read earlier versions')

    const previous = ((earlierRead.data ?? []) as VersionRow[])
      .filter((v) => !v.cancelled_at && v.version_no < version.version_no)
      .reduce<VersionRow | null>((best, v) => (!best || v.version_no > best.version_no ? v : best), null)
    const changes = diffSpecParameters(previous?.spec?.template?.parameters ?? {}, version.spec?.template?.parameters ?? {})

    const mail = buildSpecChangeEmail({
      clientName: companyDisplayName(companyRead.data as any) || 'the client',
      qualityName: qualityName(quality),
      versionNo: version.version_no,
      effectiveFrom: version.effective_from,
      changedBy,
      note: version.note,
      changes,
      cancelled,
      cancelledByWolthers: cancelled && version.cancel_note === WOLTHERS_CANCEL_NOTE,
    })
    const target = sandboxedRecipients(recipientList([HOUSE_CC, ...labs]), mail.subject)
    await sendMail({
      mailbox: QC_MAILBOX,
      to: target.to,
      subject: target.subject,
      bodyText: mail.text,
      bodyHtml: mail.html,
      saveToSentItems: true,
    })

    if (!cancelled) {
      const { error: uErr } = await admin
        .from('client_quality_versions')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', versionId)
        .is('notified_at', null)
      // The email went out; a failed stamp only means the cron may send it once more.
      if (uErr) console.error('[spec-change-email] notified_at not set', versionId, uErr.message)
    }
    return true
  } catch (error) {
    console.error('[spec-change-email] send failed', versionId, error instanceof Error ? error.message : error)
    return false
  }
}
