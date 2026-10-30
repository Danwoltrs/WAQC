/**
 * A taint/fault list typed in the certificate editor.
 *
 * The editor writes the same record the cupping validation writes,
 * quality_assessments.resolved_defects, because that is the one every reader
 * prints: the certificate PDF, the QR page, the compliance check, the approval
 * email and the reports. Until 2026-10-30 the editor saved to
 * roast_data.taints, which nothing outside the editor read, so a taint added
 * after certification never reached the certificate.
 */

export type EditedDefect = {
  name: string
  /** How many cups in the set carried it. */
  cups_affected: number | null
  intensity: number | null
}

export type EditedDefects = {
  taints: EditedDefect[]
  faults: EditedDefect[]
}

export type ParsedEditedDefects = { ok: true; value: EditedDefects } | { ok: false; error: string }

/** Validates an edited list. Rows without a name are dropped; anything else wrong is refused. */
export function parseEditedDefects(input: unknown): ParsedEditedDefects {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Taints and faults must be sent as a list' }
  }
  const body = input as { taints?: unknown; faults?: unknown }
  const value: EditedDefects = { taints: [], faults: [] }

  for (const key of ['taints', 'faults'] as const) {
    const raw = body[key] ?? []
    if (!Array.isArray(raw)) return { ok: false, error: `${key} must be a list` }
    // Lower-cased name -> the spelling first typed, which the error repeats.
    const seen = new Map<string, string>()
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') return { ok: false, error: `${key} must be a list` }
      const e = entry as { name?: unknown; cups_affected?: unknown; intensity?: unknown }
      const name = typeof e.name === 'string' ? e.name.trim() : ''
      if (!name) continue
      const first = seen.get(name.toLowerCase())
      if (first) return { ok: false, error: `${first} is listed twice under ${key}` }
      seen.set(name.toLowerCase(), name)

      const cups = e.cups_affected ?? null
      if (cups !== null && !(typeof cups === 'number' && Number.isInteger(cups) && cups >= 0)) {
        return { ok: false, error: `${name}: cups must be a whole number` }
      }
      const intensity = e.intensity ?? null
      if (intensity !== null && !(typeof intensity === 'number' && Number.isFinite(intensity))) {
        return { ok: false, error: `${name}: intensity must be a number` }
      }
      if (intensity !== null && intensity < 0) {
        return { ok: false, error: `${name}: intensity cannot be negative` }
      }
      value[key].push({ name, cups_affected: cups, intensity })
    }
  }
  return { ok: true, value }
}
