/**
 * How the intake form takes a prefill from a linked source (a sys contract, an
 * approved PSS) and remembers what it filled.
 *
 * `contract_prefilled_fields` is the memory: an Unlink clears exactly those
 * keys, and a user edit removes its key so the value becomes theirs
 * (updateFormData in sample-intake-form.tsx). Replacing a source RESETS what
 * the old one filled and the new one does not, so a stale value cannot linger.
 * Layering a second source on top — the PSS's own sys contract link, applied
 * after the PSS's fields — must NOT reset: it would wipe the ICO, sample number
 * and quantity the PSS just filled. That is `keepOthers`.
 */
export interface PrefillOptions {
  /** Keep every earlier prefilled key and track the union, instead of resetting the ones absent now. */
  keepOthers?: boolean
}

export function mergePrefill<F extends { contract_prefilled_fields: (keyof F)[] }>(
  prev: F,
  patch: Partial<F>,
  prefilled: (keyof F)[],
  initial: F,
  opts: PrefillOptions = {},
): F {
  const next: F = { ...prev, ...patch }
  // A draft saved by an older build may track a key the form no longer has.
  const kept = prev.contract_prefilled_fields.filter((key) => key in initial)
  const tracked = opts.keepOthers
    ? Array.from(new Set<keyof F>([...kept, ...prefilled]))
    : Array.from(new Set<keyof F>(prefilled))
  if (!opts.keepOthers) {
    for (const key of kept) {
      if (!tracked.includes(key)) (next as any)[key] = (initial as any)[key]
    }
  }
  next.contract_prefilled_fields = tracked
  return next
}
