/**
 * The cup profile word — "Strictly Soft", "Soft", "Softish", "Hard", "Rio" —
 * as it travels through the commodity cupping data.
 *
 * It rides inside cupping_scores.scores under a Flavor_descriptor key, next to
 * the numeric attributes, because that is where the scoring page has always
 * put it. Two consequences every reader has to handle: it is a category and
 * must never be treated as a score (see isFlavorDescriptor), and two writers
 * store two different things under the key — the scoring page writes the word,
 * the handwritten-card path (scores/submit) wrote the number 0 for the card's
 * empty descriptor cell (463 rows in prod on 2026-09-16).
 */
import { isFlavorDescriptor } from '@/lib/quality-resolvers'

const MAX_LENGTH = 40

/** A usable word, trimmed; anything else — a number, blank, absurdly long — is null. */
export function cleanDescriptor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const word = value.trim()
  return word && word.length <= MAX_LENGTH ? word : null
}

/** The cupper's word inside a scores map, or null when they chose none. */
export function descriptorOf(scores: unknown): string | null {
  if (!scores || typeof scores !== 'object' || Array.isArray(scores)) return null
  for (const [key, value] of Object.entries(scores as Record<string, unknown>)) {
    if (isFlavorDescriptor(key)) return cleanDescriptor(value)
  }
  return null
}

/** Two or more different words among the cuppers who chose one. */
export function descriptorMismatch(words: Array<string | null | undefined>): boolean {
  return new Set(words.filter((w): w is string => typeof w === 'string' && w.trim() !== '')).size > 1
}

/** A scores map without a non-word under the descriptor key, so it is never stored. */
export function withoutNumericDescriptor<T extends Record<string, unknown>>(scores: T): T {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(scores)) {
    if (isFlavorDescriptor(key) && cleanDescriptor(value) === null) continue
    out[key] = value
  }
  return out as T
}
