// Match-or-link on add (spec 2026-11-24 decision 3 and "Calls made -> Matching
// on save"). Pure: the caller fetches the candidates (fetchMatchCandidates in
// register-company.ts) and acts on the decision.
import { digitsOf } from './docs'

export interface MatchCandidate {
  id: string
  name: string
  fantasy_name: string | null
  document_cnpj: string | null
  vat_number: string | null
}

export type MatchDecision = { kind: 'link'; companyId: string } | { kind: 'create' }

/** A tax id with fewer digits than this does not identify a company (a typo, a stub). */
export const TAX_ID_MIN_DIGITS = 6

/** Legal-form words dropped from the end of a name: "Ltda", "S/A", "S.A.", "B.V.", ... */
const LEGAL_SUFFIXES = new Set(['ltda', 'sa', 'inc', 'llc', 'bv', 'gmbh', 'ltd'])

function nameTokens(raw: string | null | undefined): string[] {
  const base = (raw ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    // Dots and slashes join letters, so B.V., S/A and S.A. become bv / sa.
    .replace(/[./]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
  const tokens = base ? base.split(' ') : []
  // Trailing legal forms only (a suffix word inside the name stays); a name
  // that is nothing but a legal form keeps it.
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop()
  return tokens
}

/** Lowercase, unaccented, punctuation stripped, spaces collapsed, trailing legal suffixes dropped. */
export function normalizeCompanyName(raw: string | null | undefined): string {
  return nameTokens(raw).join(' ')
}

/** The longest token of the normalized name (the first on a tie), for a broad ilike. Letters and digits only. */
export function longestNameToken(raw: string | null | undefined): string | null {
  const tokens = nameTokens(raw)
  if (tokens.length === 0) return null
  return tokens.reduce((best, t) => (t.length > best.length ? t : best))
}

/** `%tok1%tok2%...%`, every token in order, for a selective ilike. Letters and digits only. */
export function nameTokensPattern(raw: string | null | undefined): string | null {
  const tokens = nameTokens(raw)
  return tokens.length === 0 ? null : `%${tokens.join('%')}%`
}

const taxDigits = (v: string | null | undefined): string => {
  const d = digitsOf(v)
  return d.length >= TAX_ID_MIN_DIGITS ? d : ''
}

/**
 * Link or create. Equal tax-id digits (CNPJ / CPF / VAT, formatted or bare,
 * in document_cnpj or vat_number) link. Otherwise exactly one candidate whose
 * normalized name or fantasy name equals the input's links, unless both sides
 * carry a tax id and they differ. Several candidates, or a conflicting tax id,
 * create a new company: it shows in sys for a merge.
 */
export function decideCompanyMatch(
  input: { name: string; taxId: string | null },
  candidates: MatchCandidate[],
): MatchDecision {
  const unique = [...new Map(candidates.map((c) => [c.id, c])).values()]
  const name = normalizeCompanyName(input.name)
  const sameName = (c: MatchCandidate) =>
    name !== '' && (normalizeCompanyName(c.name) === name || normalizeCompanyName(c.fantasy_name) === name)
  const taxesOf = (c: MatchCandidate) => [c.document_cnpj, c.vat_number].map(taxDigits).filter((d) => d !== '')

  const tax = taxDigits(input.taxId)
  if (tax) {
    const byTax = unique.filter((c) => taxesOf(c).includes(tax))
    if (byTax.length === 1) return { kind: 'link', companyId: byTax[0].id }
    if (byTax.length > 1) {
      // Several records carry this tax id (duplicates awaiting a merge): the name decides.
      const named = byTax.filter(sameName)
      return named.length === 1 ? { kind: 'link', companyId: named[0].id } : { kind: 'create' }
    }
  }

  const byName = unique.filter(sameName)
  if (byName.length !== 1) return { kind: 'create' }
  const theirs = taxesOf(byName[0])
  if (tax && theirs.length > 0 && !theirs.includes(tax)) return { kind: 'create' }
  return { kind: 'link', companyId: byName[0].id }
}
