/**
 * HTML-escape a value for safe interpolation into HTML strings, including
 * email bodies. Replaces the five characters that have HTML meaning.
 *
 * Use everywhere user-controlled or DB-sourced strings are interpolated into
 * HTML output. For richer fields (e.g. cupping comments that may contain
 * formatting), prefer rendering as escaped plain text, or sanitize with a
 * strict allowlist library.
 */
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(input: unknown): string {
  if (input == null) return ''
  return String(input).replace(/[&<>"']/g, ch => HTML_ESCAPE_MAP[ch])
}

/**
 * Permissive but strict-enough email format check. Rejects obviously malformed
 * addresses (whitespace, no '@', missing domain) and enforces the RFC 5321
 * 254-char total length cap.
 *
 * The domain part is restricted to letters/digits/hyphens joined by dots.
 * A looser check (anything non-whitespace after '@') let a paste artifact like
 * "adccpurchasing@adcoffeecompany.nl)," through, and Graph then rejected the
 * whole batch with 400 ErrorInvalidRecipients.
 *
 * Not a full RFC 5322 parser — this is the minimum bar before passing to a
 * send API.
 */
export function isValidEmail(email: unknown): email is string {
  if (typeof email !== 'string') return false
  if (email.length === 0 || email.length > 254) return false
  return /^[^\s@]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(email)
}
