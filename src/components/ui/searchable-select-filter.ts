// Substring search filter for cmdk's <Command filter>. cmdk's default filter is
// fuzzy (subsequence scoring), which over-matches when an option carries many
// keywords — typing a contract number that has no match still surfaces unrelated
// rows. This mirrors the plain `.includes()` matching used by the /samples/qc
// tracking list: an option is shown only when the typed text is a contiguous
// substring of its label or any of its keywords. Returns 1 (show) or 0 (hide).
export function substringFilter(value: string, search: string, keywords?: string[]): number {
  const needle = search.trim().toLowerCase()
  if (!needle) return 1
  const haystack = [value, ...(keywords ?? [])].join(' ').toLowerCase()
  return haystack.includes(needle) ? 1 : 0
}
