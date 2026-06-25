// Pure helpers for building safe PostgREST `.or()` ILIKE filters.
// PostgREST treats ',', '(', ')' as `.or()` delimiters and '%','_' as ILIKE
// wildcards; strip them so a pasted value can't corrupt the filter string.
export function sanitizeOrTerm(q: string): string {
  return q.trim().replace(/[%_(),]/g, '')
}

export function buildOrIlike(fields: string[], term: string): string {
  return fields.map((f) => `${f}.ilike.%${term}%`).join(',')
}
