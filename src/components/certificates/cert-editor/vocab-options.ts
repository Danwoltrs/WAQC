const pad = (n: number) => String(((n % 100) + 100) % 100).padStart(2, '0')

/**
 * Crop-year options, newest first: the latest crop plus the previous three.
 * The latest rolls to the new crop every May (month index 4), e.g. from May 2026
 * the latest is "26/27" (the crop physically starting July). The sample's own
 * stored value is appended if it falls outside the window. Pure.
 */
export function cropYearOptions(now: Date, currentValue?: string | null): string[] {
  const year = now.getFullYear()
  const latestStart = now.getMonth() >= 4 ? year : year - 1
  const opts: string[] = []
  for (let s = latestStart; s >= latestStart - 3; s--) opts.push(`${pad(s)}/${pad(s + 1)}`)
  const cur = (currentValue || '').trim()
  if (cur && !opts.includes(cur)) opts.push(cur)
  return opts
}

/**
 * Processing options: canonical base first, then values seen in data (distinct)
 * that aren't canonical, sorted; then the sample's current value if still missing.
 * Deduped. Pure.
 */
export function mergeProcessingOptions(
  base: readonly string[],
  distinct: readonly string[],
  currentValue?: string | null,
): string[] {
  const out: string[] = [...base]
  const extras = distinct
    .map((d) => (d || '').trim())
    .filter((d) => d && !out.includes(d))
    .sort((a, b) => a.localeCompare(b))
  for (const e of extras) if (!out.includes(e)) out.push(e)
  const cur = (currentValue || '').trim()
  if (cur && !out.includes(cur)) out.push(cur)
  return out
}
