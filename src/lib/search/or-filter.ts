// Pure helpers for building safe PostgREST `.or()` ILIKE filters.
// PostgREST treats ',', '(', ')' as `.or()` delimiters and '%','_' as ILIKE
// wildcards; strip them so a pasted value can't corrupt the filter string.
export function sanitizeOrTerm(q: string): string {
  return q.trim().replace(/[%_(),]/g, '')
}

export function buildOrIlike(fields: string[], term: string): string {
  return fields.map((f) => `${f}.ilike.%${term}%`).join(',')
}

// An exact-match `.or()` term keeps its value verbatim rather than stripping
// characters, so it has to be quoted instead: PostgREST treats ',', '(' and ')'
// as delimiters unless the value is wrapped in double quotes. A container
// number ("HASU 155.201-6") and an ICO ("002/1649/0185") both need this.
export function quoteOrValue(value: string): string {
  return `"${value.replace(/["\\]/g, (c) => '\\' + c)}"`
}

export function buildOrEq(fields: string[], value: string): string {
  const quoted = quoteOrValue(value)
  return fields.map((f) => `${f}.eq.${quoted}`).join(',')
}
