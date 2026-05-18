/**
 * HTML email signature renderer.
 *
 * Ported from sys.wolthers.com with two WAQC-specific differences:
 *   1. The "Groups" line is fixed to qualitycontrol@wolthers.com — WAQC
 *      doesn't have a multi-department model, so we don't need a join
 *      against a departments table.
 *   2. A "Q Grader" badge is appended to the title line for users with
 *      profiles.is_q_grader = true. Sits between the title and any other
 *      content with the olive brand color to make the cert visible at a
 *      glance without becoming visually noisy.
 *
 * Two variants:
 *   * renderFullSignature   — For new emails. Full logo (90px), name +
 *                             title + Q Grader badge, email, groups,
 *                             WhatsApp, Teams, Santos address.
 *   * renderCompactSignature — For replies. Small "O" logo (32px),
 *                              name, title, Q Grader badge, email,
 *                              phone on one line.
 *
 * Both return only the inner body HTML — the caller wraps it in a full
 * HTML document or glues it onto an existing body.
 */

const QC_GROUP = { name: 'Quality Control', email: 'qualitycontrol@wolthers.com' }
const Q_GRADER_BADGE_COLOR = '#556b2f' // Olive — matches the project's primary chart color

export interface SignatureRenderContext {
  fullName: string
  email: string
  title: string | null
  phone: string | null
  whatsapp: string | null
  teamsEmail: string | null
  isQGrader: boolean
  /** Absolute URL. Used as-is in <img src>. */
  logoUrl: string
}

/**
 * Escape a string for safe interpolation into HTML attributes and text
 * content. Handles the five XML/HTML entities — &, <, >, ", '.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Strip everything except digits from a phone number so it can be used
 * as the path portion of a wa.me link.
 */
function waDigits(phone: string): string {
  return phone.replace(/\D/g, '')
}

/**
 * Build the "Groups: Quality Control" fragment. WAQC always uses the
 * single QC mailbox — no per-user toggle — so this is a constant.
 */
function renderQCGroup(): string {
  const link =
    `<a href="mailto:${escapeHtml(QC_GROUP.email)}" style="color: #989A99 !important; text-decoration: none;"><span>${escapeHtml(QC_GROUP.name)}</span></a>`
  return `<span style="color: #989A99; font-weight: bold;"> | </span>Groups: ${link}`
}

/**
 * "Q Grader" badge fragment — small olive-tinted text after the title.
 * Email clients vary in CSS support; we use inline styles only and
 * avoid background-color (Gmail strips it inconsistently).
 */
function renderQGraderBadge(): string {
  return ` <span style="color: ${Q_GRADER_BADGE_COLOR}; font-weight: bold; font-size: 9pt;">| Q Grader</span>`
}

export function renderFullSignature(ctx: SignatureRenderContext): string {
  const name = escapeHtml(ctx.fullName || '')
  const email = escapeHtml(ctx.email || '')
  const title = ctx.title ? escapeHtml(ctx.title) : null
  const logo = escapeHtml(ctx.logoUrl)

  const titleFragment = title
    ? `<span style="font-weight: bold; color: #989A99; font-size: 9pt;"> | ${title}</span>`
    : ''

  const qGraderFragment = ctx.isQGrader ? renderQGraderBadge() : ''

  const groupsFragment = renderQCGroup()

  const whatsappFragment = ctx.whatsapp
    ? `<span style="color: #989A99; font-weight: bold;"> | </span>` +
      `<a href="https://wa.me/${waDigits(ctx.whatsapp)}" style="text-decoration: none;" target="_blank">` +
      `<img alt="WhatsApp" src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" style="display: inline-block; vertical-align: middle; margin-right: 4px; filter: grayscale(100%) brightness(1.4);" width="11"/>` +
      `<span style="color: #989A99 !important; text-decoration: none;">${escapeHtml(ctx.whatsapp)}</span>` +
      `</a>`
    : ''

  const teamsTarget = ctx.teamsEmail || ctx.email
  const teamsFragment = teamsTarget
    ? `<span style="color: #989A99; font-weight: bold;"> | </span>` +
      `<a href="https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(teamsTarget)}" style="text-decoration: none;">` +
      `<span style="color: #989A99 !important;">💬 Teams Chat</span>` +
      `</a>`
    : ''

  return (
    `<div style="font-family: Helvetica, sans-serif; font-size: 8pt; color: #989A99;">` +
    `<div style="font-size: 10pt; color: #000000; padding-bottom: 8px;">Best regards,</div>` +
    `<br/>` +
    `<table cellpadding="0" cellspacing="0">` +
    `<tr>` +
    `<td style="vertical-align: middle; padding-right: 24px; text-align: left;">` +
    `<a href="https://www.wolthers.com" target="_blank">` +
    `<img alt="Wolthers Logo" src="${logo}" style="display: block;" width="80"/>` +
    `</a>` +
    `</td>` +
    `<td style="vertical-align: middle; font-size: 8pt;">` +
    `<div style="color: #577E3E; font-size: 10pt; font-weight: bold;">${name}${titleFragment}${qGraderFragment}</div>` +
    `<div style="padding-top: 2px;">` +
    `<a href="mailto:${email}" style="color: #989A99 !important; text-decoration: none;"><span>${email}</span></a>` +
    `${groupsFragment}${whatsappFragment}${teamsFragment}` +
    `</div>` +
    `<div style="color: #989A99;">Rua XV de Novembro 96, 2º andar, 11010-150 - Santos/SP | Brazil</div>` +
    `</td>` +
    `</tr>` +
    `</table>` +
    `</div>`
  )
}

export function renderCompactSignature(ctx: SignatureRenderContext): string {
  const name = escapeHtml(ctx.fullName || '')
  const email = escapeHtml(ctx.email || '')
  const title = ctx.title ? escapeHtml(ctx.title) : null
  const logo = escapeHtml(ctx.logoUrl)
  const phone = ctx.phone ? escapeHtml(ctx.phone) : null

  const titleFragment = title
    ? `<span style="font-weight: bold; color: #989A99; font-size: 8pt;"> | ${title}</span>`
    : ''

  const qGraderFragment = ctx.isQGrader
    ? ` <span style="color: ${Q_GRADER_BADGE_COLOR}; font-weight: bold; font-size: 8pt;">| Q Grader</span>`
    : ''

  const emailFragment = `<a href="mailto:${email}" style="color: #989A99 !important; text-decoration: none;">${email}</a>`

  const phoneFragment = phone
    ? `<span style="color: #989A99; font-weight: bold;"> | </span>${phone}`
    : ''

  const whatsappFragment = ctx.whatsapp
    ? `<span style="color: #989A99; font-weight: bold;"> | </span>` +
      `<a href="https://wa.me/${waDigits(ctx.whatsapp)}" style="text-decoration: none;" target="_blank">` +
      `<span style="color: #577E3E; font-weight: bold;">WhatsApp</span> ` +
      `<span style="color: #989A99 !important; text-decoration: none;">${escapeHtml(ctx.whatsapp)}</span>` +
      `</a>`
    : ''

  const teamsTarget = ctx.teamsEmail || ctx.email
  const teamsFragment = teamsTarget
    ? `<span style="color: #989A99; font-weight: bold;"> | </span>` +
      `<a href="https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(teamsTarget)}" style="text-decoration: none;">` +
      `<span style="color: #989A99 !important;">💬 Teams</span>` +
      `</a>`
    : ''

  return (
    `<div style="font-family: Helvetica, sans-serif; font-size: 8pt; color: #989A99;">` +
    `<table cellpadding="0" cellspacing="0"><tr>` +
    `<td style="vertical-align: middle; padding-right: 10px;">` +
    `<img src="${logo}" width="28" style="display: block;" alt="W" />` +
    `</td>` +
    `<td style="vertical-align: middle;">` +
    `<div style="color: #577E3E; font-size: 9pt; font-weight: bold;">${name}${titleFragment}${qGraderFragment}</div>` +
    `<div style="padding-top: 2px;">` +
    `${emailFragment}${phoneFragment}${whatsappFragment}${teamsFragment}` +
    `</div>` +
    `</td>` +
    `</tr></table>` +
    `</div>`
  )
}

/**
 * Absolute site URL used for building default logo URLs. Falls back to
 * production host if NEXT_PUBLIC_SITE_URL isn't set.
 */
export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://qc.wolthers.com'
}

/**
 * Default full logo URL — served from /public/images/logos.
 */
export function getDefaultFullLogoUrl(): string {
  return `${getSiteUrl()}/images/logos/wolthers-logo-green.png`
}

/**
 * Default compact logo URL. WAQC doesn't ship a separate "O" mark yet —
 * reuse the full green logo at the smaller render size. Swap to a
 * dedicated compact asset later by changing only this function.
 */
export function getDefaultCompactLogoUrl(): string {
  return `${getSiteUrl()}/images/logos/wolthers-logo-green.png`
}
