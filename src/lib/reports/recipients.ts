/**
 * Per-(client, report_type) recipient persistence helpers.
 *
 * Kept in lib/ rather than co-located with the route because Next.js
 * route files may only export HTTP verbs — exporting helpers from
 * route.ts fails the build with "X is not a valid Route export field".
 *
 * Both the GET/POST /api/reports/recipients route and the report-send
 * endpoint import from here.
 */

export const VALID_REPORT_TYPES = new Set(['weekly_ss', 'biweekly', 'monthly', 'annual'])

/**
 * Upsert the recipient set for (client_id, report_type), replacing
 * whatever was stored. Semantics are "last sent", not a history log.
 *
 * Non-fatal: failures are logged but not thrown — the caller's primary
 * action (sending an email) has already succeeded by the time this runs.
 */
export async function saveRecipients(
  supabase: any,
  params: {
    clientId: string
    reportType: string
    userId: string
    to: string[]
    cc: string[]
    bcc: string[]
  },
): Promise<void> {
  const dedupAndClean = (arr: string[]): string[] => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const raw of arr) {
      if (typeof raw !== 'string') continue
      const trimmed = raw.trim().toLowerCase()
      if (!trimmed) continue
      if (seen.has(trimmed)) continue
      seen.add(trimmed)
      out.push(raw.trim())
    }
    return out
  }

  const { error } = await supabase
    .from('report_recipients')
    .upsert(
      {
        client_id: params.clientId,
        report_type: params.reportType,
        to_emails: dedupAndClean(params.to),
        cc_emails: dedupAndClean(params.cc),
        bcc_emails: dedupAndClean(params.bcc),
        last_sent_at: new Date().toISOString(),
        last_sent_by: params.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id,report_type' },
    )
  if (error) {
    console.error('[reports.recipients] upsert failed:', error)
  }
}
