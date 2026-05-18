/**
 * Helpers for composing the HTML body that gets sent via Microsoft
 * Graph when an outgoing email needs the user's HTML signature glued on.
 *
 * The default cover note for report sends ends with "Best regards, /
 * <name> / Wolthers & Associates". The user's HTML signature also starts
 * with its own "Best regards," so when we glue them together we strip
 * the trailing plain-text closing first to avoid the recipient seeing
 * two of them.
 */

import { escapeHtml } from '@/lib/signatures/render'

/**
 * Drop the trailing "Best regards, ..." closing block from a plain-text
 * body. Walks backwards from the last non-empty line until it hits the
 * "Best regards," line, then truncates everything from that line
 * onwards.
 *
 * Conservative on purpose — only strips when the closing line is one of
 * the recognised variants ("Best regards," / "Kind regards," /
 * "Regards,"). A custom closing the user typed by hand survives
 * untouched, and the signature simply renders below it.
 */
export function stripTrailingClosing(body: string): string {
  const lines = body.replace(/\s+$/, '').split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim().toLowerCase()
    if (line === '') continue
    if (
      line === 'best regards,' ||
      line === 'kind regards,' ||
      line === 'regards,'
    ) {
      return lines.slice(0, i).join('\n').replace(/\s+$/, '')
    }
    if (
      line === 'wolthers & associates' ||
      line === 'wolthers and associates'
    ) {
      continue
    }
    // Heuristic: a line of just letters/spaces/periods (likely the
    // sender's name) — keep walking. Anything else means we've left
    // the closing block.
    if (/^[a-z][a-z\s.'-]{0,60}$/.test(line)) continue
    return lines.join('\n').replace(/\s+$/, '')
  }
  return ''
}

/**
 * Convert a plain-text body to an HTML fragment, escaping every
 * character and turning newlines into <br>. Wrapped in a div with the
 * same Helvetica baseline the signature uses so body + signature read
 * as one continuous email.
 */
function plainTextToHtml(body: string): string {
  const escaped = escapeHtml(body)
  const withBreaks = escaped.replace(/\n/g, '<br/>')
  return `<div style="font-family: Helvetica, Arial, sans-serif; font-size: 10pt; color: #1a1a1a; white-space: normal;">${withBreaks}</div>`
}

/**
 * Glue a plain-text body and an HTML signature into a single HTML email
 * body. When `signatureHtml` is null/empty returns an HTML rendering of
 * the body alone, so callers can use this unconditionally.
 */
export function composeBodyHtml(
  plainBody: string,
  signatureHtml: string | null,
): string {
  const trimmed = signatureHtml ? stripTrailingClosing(plainBody) : plainBody
  const bodyHtml = plainTextToHtml(trimmed)
  if (!signatureHtml) return bodyHtml
  return `${bodyHtml}<br/>${signatureHtml}`
}
