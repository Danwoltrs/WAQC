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
import { renderDraftMarkup } from './draft-markup'

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

/**
 * Ported from sys's closing classifier: the index of the line where the
 * trailing closing block starts ("Best regards," plus the name, company and
 * bare-email lines under it), or -1 when the body has no closing to strip.
 * Used by renderMarkupBodyHtml only; stripTrailingClosing above keeps its
 * own, simpler rule.
 */
const COMPANY_LINE = /^wolthers (?:&|and) associates$/;
const NOT_A_NAME = /^(?:thanks?|thank you|obrigad[oa]|cheers|ok|okay)$/;

/**
 * The lines under the closing are only a closing block: at most two name lines (no sentence punctuation, not a thanks,
 * not "P.S."), the company line and a final bare address. Anything else is text a person typed under the closing, and a
 * doubled closing is better than lost text.
 */
function closingOnly(lines: string[], at: number, lastNonEmpty: number): boolean {
  let names = 0;
  for (let j = at + 1; j <= lastNonEmpty; j++) {
    const line = lines[j].trim().toLowerCase();
    if (line === "" || COMPANY_LINE.test(line)) continue;
    if (j === lastNonEmpty && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(line)) continue;
    // A trailing period is a name only after an abbreviation ("Jr.", "A."); any other is a sentence.
    const endsSentence = /[!?:]$/.test(line) || (line.endsWith(".") && !/(?:^|\s)\p{L}{1,3}\.$/u.test(line));
    if (endsSentence || line.startsWith("p.s") || NOT_A_NAME.test(line)) return false;
    if (++names > 2) return false;
  }
  return true;
}

function findClosingStart(lines: string[]): number {
  // Index of the body's final non-empty line — the bare-email rule below is
  // scoped to it, so the rule can only ever fire on a body that genuinely
  // ENDS with an address.
  let lastNonEmpty = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() !== "") {
      lastNonEmpty = i;
      break;
    }
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim().toLowerCase();
    if (line === "") continue;
    if (
      line === "best regards," ||
      line === "kind regards," ||
      line === "regards," ||
      line === "atenciosamente," ||
      line === "att.," ||
      line === "abraços,"
    ) {
      return closingOnly(lines, i, lastNonEmpty) ? i : -1;
    }
    // First non-empty line walking backwards isn't a recognised
    // closing — leave the body alone. Subsequent identifying lines
    // (the trader's name, "Wolthers & Associates") are below the
    // closing in the default templates, so by the time we encounter
    // them the search continues; only a *non-empty, non-closing,
    // non-name* line aborts the strip.
    if (
      line === "wolthers & associates" ||
      line === "wolthers and associates"
    ) {
      continue;
    }
    // A bare email address belongs to the closing block too ("Best regards, /
    // Daniel Wolthers / Wolthers & Associates / wolthers@wolthers.com").
    // The name heuristic below rejects it — "@" is not in its character class
    // — which aborted the walk and left the recipient with two closings: the
    // template's and the HTML signature's.
    //
    // Scoped to the LAST non-empty line on purpose. Unscoped, it turns the
    // address from a wall into a stepping stone: a trader who types a
    // postscript BELOW the closing would have it silently deleted, because
    // the loose name heuristic below happily walks over prose like
    // "P.S. the vessel changed." on its way up to "Best regards,". A visible
    // duplicate closing is a far better failure than vanishing content.
    if (i === lastNonEmpty && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(line)) continue;
    // Heuristic: a line of just letters/spaces/periods (likely the
    // sender's name) — keep walking. Anything else (e.g. a sentence
    // ending in punctuation other than a period) means we've left
    // the closing block.
    //
    // \p{L} rather than a-z. The original ASCII class silently failed on
    // every accented name — José, Débora, Natália — so the walk aborted at
    // the name line, the closing was never stripped, and the recipient got
    // BOTH the template's "Best regards / José Silva" and the HTML
    // signature below it. In a Brazilian company that is most of the team.
    if (/^\p{L}[\p{L}\s.'-]{0,60}$/u.test(line)) continue;
    return -1;
  }
  // Ran off the top without ever finding a closing line. The body is entirely
  // name-shaped lines (short prose can qualify: "Attached", "Daniel"), so
  // there is nothing to strip — cutting here would delete the whole
  // message and leave the recipient a signature with no email above it.
  return -1;
}

/**
 * Rich cover notes: the body is the shared draft markup (`**bold**`,
 * `{i}italic{/i}`, colours...) rendered by renderDraftMarkup, in WAQC's
 * Helvetica wrapper, with the HTML signature glued below. Ported from sys
 * renderRequestHtml.
 */
export function renderMarkupBodyHtml(
  markup: string,
  signatureHtml: string | null,
): string {
  let body = markup
  if (signatureHtml) {
    const trimmedBody = markup.replace(/\s+$/, '')
    const lines = trimmedBody.split('\n')
    const cut = findClosingStart(lines)
    body = cut < 0 ? trimmedBody : lines.slice(0, cut).join('\n').replace(/\s+$/, '')
  }
  const bodyHtml = `<div style="font-family: Helvetica, Arial, sans-serif; font-size: 10pt; color: #1a1a1a;">${renderDraftMarkup(body)}</div>`
  return signatureHtml ? `${bodyHtml}<br/>${signatureHtml}` : bodyHtml
}
