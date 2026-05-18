/**
 * Build and persist HTML signatures from a user's profile row.
 *
 * Simpler than the sys.wolthers.com equivalent: WAQC has no departments
 * table (Groups is fixed to qualitycontrol@wolthers.com) and no
 * signature_logos table (we always use the default Wolthers green logo).
 * Only the per-user fields on profiles drive the render.
 *
 * Storage pattern matches sys: editable fields + cached rendered HTML
 * coexist on the profile row. Save flow → render → store, so the report
 * send endpoint can just read `email_signature_html` with zero rendering
 * cost on the hot path.
 */

import {
  renderFullSignature,
  renderCompactSignature,
  getDefaultFullLogoUrl,
  getDefaultCompactLogoUrl,
  type SignatureRenderContext,
} from './render'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any

/**
 * Build the signature render context for a user. Returns null when the
 * profile doesn't exist — callers should treat that as a no-op.
 */
export async function buildSignatureContext(
  supabase: AnyClient,
  userId: string,
): Promise<SignatureRenderContext | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'full_name, email, title, phone, whatsapp, teams_email, is_q_grader',
    )
    .eq('id', userId)
    .maybeSingle()

  if (!profile) return null

  const p = profile as {
    full_name: string | null
    email: string | null
    title: string | null
    phone: string | null
    whatsapp: string | null
    teams_email: string | null
    is_q_grader: boolean | null
  }

  return {
    fullName: p.full_name ?? '',
    email: p.email ?? '',
    title: p.title,
    phone: p.phone,
    whatsapp: p.whatsapp,
    teamsEmail: p.teams_email,
    isQGrader: !!p.is_q_grader,
    logoUrl: getDefaultFullLogoUrl(),
  }
}

/**
 * Render both signature variants and persist them to the profile row.
 *
 * Returns the rendered HTML or null when the profile is missing. Callers
 * should generally run this as fire-and-forget so a render failure
 * doesn't block the parent operation (e.g. a profile PATCH).
 */
export async function renderAndStoreSignatures(
  supabase: AnyClient,
  userId: string,
): Promise<{ full: string; compact: string } | null> {
  const ctx = await buildSignatureContext(supabase, userId)
  if (!ctx) return null

  const full = renderFullSignature(ctx)
  // Compact variant uses a smaller logo asset — override the URL on a
  // copy of the context so a future seasonal compact logo can be wired
  // here without touching the renderer signature.
  const compact = renderCompactSignature({
    ...ctx,
    logoUrl: getDefaultCompactLogoUrl(),
  })

  await supabase
    .from('profiles')
    .update({
      email_signature_html: full,
      email_signature_compact_html: compact,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  return { full, compact }
}
