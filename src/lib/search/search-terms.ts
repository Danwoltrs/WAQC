export const MAX_SEARCH_TERMS = 50

export interface SearchTerms {
  terms: string[]
  capped: boolean
}

/**
 * Splits a pasted list of numbers into search terms. Separators are commas,
 * semicolons, tabs (a row copied sideways from Excel) and line breaks. A
 * piece with spaces is split further only when every word contains a digit
 * ("S-1548 S-1547"); otherwise it stays whole ("Comexim EU", "TEMU 565.799-2").
 * Duplicates (case-insensitive) are dropped and at most MAX_SEARCH_TERMS are
 * kept.
 */
export function splitSearchTerms(input: string): SearchTerms {
  const seen = new Set<string>()
  const all: string[] = []
  for (const raw of input.split(/[,;\t\r\n]+/)) {
    const piece = raw.trim()
    if (!piece) continue
    const words = piece.split(/\s+/)
    const parts = words.length > 1 && words.every((w) => /\d/.test(w)) ? words : [piece]
    for (const part of parts) {
      const key = part.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      all.push(part)
    }
  }
  return { terms: all.slice(0, MAX_SEARCH_TERMS), capped: all.length > MAX_SEARCH_TERMS }
}
