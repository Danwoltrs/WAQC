// src/lib/portal/invite-email.ts
import { sendMail } from '@/lib/graph/send'
import { HOUSE_CC } from '@/lib/approval-notification/resolve-panels'
import { QC_KEY_LABELS, type QcKeySet } from './qc-keys'

/**
 * QC portal emails (spec §6.3). Sent from the QC mailbox through Graph;
 * MICROSOFT_GRAPH_TEST_RECIPIENT redirects every send, as on every QC email.
 *
 * The invitee's email goes to the invitee alone: its link sets the account's
 * password, so a copy would be a credential leak. Head office (house rule)
 * gets a separate, link-free copy instead (sendPortalHouseCopy).
 */

const QC_MAILBOX = process.env.MICROSOFT_GRAPH_MAILBOX || 'qualitycontrol@wolthers.com'

export function portalBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://qc.wolthers.com').replace(/\/+$/, '')
}

export function portalInviteLink(token: string): string {
  return `${portalBaseUrl()}/auth/portal-invite?token=${encodeURIComponent(token)}`
}

export function portalSignInLink(companyId: string): string {
  return `${portalBaseUrl()}/portal?company=${encodeURIComponent(companyId)}`
}

export interface InviteEmailInput {
  kind: 'invitation' | 'access_added'
  firstName: string
  companyName: string
  inviterName: string
  keys: QcKeySet
  isCompanyAdmin: boolean
  link: string
  expiresAt: string | null
}

export interface BuiltEmail {
  subject: string
  text: string
  html: string
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })
}

const SIGNATURE = 'Wolthers & Associates, Quality Control'
const BODY_OPEN =
  '<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#ffffff;font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.5;color:#111111">'

export function accessLines(keys: QcKeySet, isCompanyAdmin: boolean): string[] {
  const lines = [...keys.views, ...keys.capabilities].map((k) => QC_KEY_LABELS[k])
  if (isCompanyAdmin) lines.push("Manage your company's team")
  return lines
}

export function buildPortalInviteEmail(input: InviteEmailInput): BuiltEmail {
  const name = input.firstName.trim()
  const greeting = name ? `Hello ${name},` : 'Hello,'
  const invitation = input.kind === 'invitation'
  const intro = invitation
    ? `${input.inviterName} has invited you to the Wolthers QC portal for ${input.companyName}.`
    : `${input.inviterName} has opened the Wolthers QC portal to you for ${input.companyName}. Sign in with your existing account.`
  const action = invitation ? 'Accept the invitation' : 'Open the portal'
  const subject = invitation
    ? `Invitation to the Wolthers QC portal for ${input.companyName}`
    : `The Wolthers QC portal is open to you for ${input.companyName}`
  const lines = accessLines(input.keys, input.isCompanyAdmin)
  const expiry = invitation && input.expiresAt ? `This invitation expires on ${formatDate(input.expiresAt)}.` : null

  const text = [
    greeting,
    '',
    intro,
    '',
    'You will be able to use:',
    ...lines.map((l) => `- ${l}`),
    '',
    `${action}: ${input.link}`,
    ...(expiry ? ['', expiry] : []),
    '',
    SIGNATURE,
  ].join('\n')

  const html = [
    BODY_OPEN,
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>${escapeHtml(intro)}</p>`,
    '<p>You will be able to use:</p>',
    `<ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`,
    `<p><a href="${escapeHtml(input.link)}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#556b2f;color:#ffffff;text-decoration:none">${escapeHtml(action)}</a></p>`,
    expiry ? `<p style="color:#666666">${escapeHtml(expiry)}</p>` : '',
    `<p style="color:#666666">${escapeHtml(SIGNATURE)}</p>`,
    '</body></html>',
  ].join('')

  return { subject, text, html }
}

function sandboxed(to: string, subject: string): { to: string[]; subject: string } {
  const testTo = process.env.MICROSOFT_GRAPH_TEST_RECIPIENT
  return testTo ? { to: [testTo], subject: `[TEST] ${subject}` } : { to: [to], subject }
}

/** The invitee's email: to them alone, never copied (its link is a credential). */
export async function sendPortalInviteEmail(to: string, email: BuiltEmail): Promise<void> {
  const target = sandboxed(to, email.subject)
  await sendMail({
    mailbox: QC_MAILBOX,
    to: target.to,
    subject: target.subject,
    bodyText: email.text,
    bodyHtml: email.html,
    saveToSentItems: true,
  })
}

export interface HouseCopyInput {
  kind: 'invitation' | 'resend' | 'access_added'
  inviterName: string
  email: string
  companyName: string
  keys: QcKeySet
  isCompanyAdmin: boolean
}

/** What head office sees: who invited whom, to which company, with what access. No link. */
export function buildPortalHouseCopy(input: HouseCopyInput): BuiltEmail {
  const company = `${input.companyName}'s QC portal`
  const headline =
    input.kind === 'invitation'
      ? `${input.inviterName} invited ${input.email} to ${company}`
      : input.kind === 'resend'
        ? `${input.inviterName} sent ${input.email} a new invitation link for ${company}`
        : `${input.inviterName} opened ${company} to ${input.email}`
  const lines = accessLines(input.keys, input.isCompanyAdmin)
  const note = 'The link in their email sets their password, so it is not copied here.'

  const text = [`${headline}.`, '', 'Access:', ...lines.map((l) => `- ${l}`), '', note, '', SIGNATURE].join('\n')
  const html = [
    BODY_OPEN,
    `<p>${escapeHtml(`${headline}.`)}</p>`,
    '<p>Access:</p>',
    `<ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`,
    `<p style="color:#666666">${escapeHtml(note)}</p>`,
    `<p style="color:#666666">${escapeHtml(SIGNATURE)}</p>`,
    '</body></html>',
  ].join('')
  return { subject: headline, text, html }
}

/** Head office's link-free copy (house rule). Never throws; false when the send failed. */
export async function sendPortalHouseCopy(input: HouseCopyInput): Promise<boolean> {
  const mail = buildPortalHouseCopy(input)
  const target = sandboxed(HOUSE_CC, mail.subject)
  try {
    await sendMail({
      mailbox: QC_MAILBOX,
      to: target.to,
      subject: target.subject,
      bodyText: mail.text,
      bodyHtml: mail.html,
      saveToSentItems: true,
    })
    return true
  } catch (error) {
    console.error('[portal] head-office copy failed:', error)
    return false
  }
}
