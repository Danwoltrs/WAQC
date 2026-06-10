// src/lib/quality-matching.ts
//
// Pure matcher that bridges a sys contract's free-text `quality_description`
// (e.g. "NY 2/3 17/18 FC") to one of a WAQC client's structured quality specs
// (client_qualities rows). No I/O — the caller passes the contract text and the
// candidate list; this returns a match result.
//
// Conservative by design: auto-select (`confidence: 'high'`) ONLY when exactly
// one non-disqualified spec is the unique top scorer AND it clears the
// high-confidence bar (screen-size match + >=1 cup token, or exact normalized
// equality). Mismatched screen sizes DISQUALIFY a spec. Anything ambiguous or
// weak returns 'low'/'none' and leaves the dropdown for the lab to pick.
// "Under-match beats mis-match."

export interface QualitySpecCandidate {
  id: string
  custom_name: string | null
  quality_code: string | null
  template_name: string | null
}

export interface QualityMatch {
  matched: boolean              // true only when confidence === 'high'
  spec_id: string | null        // client_qualities.id of the matched spec (high only)
  spec_label: string | null     // custom_name || quality_code of the match (high only)
  source_text: string           // the contract.quality_description we matched from
  confidence: 'high' | 'low' | 'none'
}

// Cup/prep abbreviations -> canonical phrase. Kept deliberately small; extend as
// real contract data demands. Single-letter abbreviations are intentionally
// excluded (too noisy after tokenization).
const ABBREVIATIONS: Record<string, string> = {
  fc: 'fine cup',
  gc: 'good cup',
  ss: 'strictly soft',
  sd: 'strictly drinkable',
  sdm: 'strictly drinkable mild',
  fw: 'fully washed',
  nw: 'natural',
  rio: 'rio',
}

// Structural / modifier words that carry no discriminating signal between specs
// (they appear in most quality names). Removed from the cup-token set so e.g.
// "fine cup" vs "good cup" differ only on {fine} vs {good}.
const STOPWORDS = new Set([
  'cup', 'bean', 'beans', 'coffee', 'grade', 'quality', 'prep', 'preparation',
  'screen', 'scr', 'strictly', 'and', 'type', 'lot',
])

// Commercial-only qualifiers that appear on contracts but not on QC specs — drop
// so they neither help nor penalise. NY defect grades, "up", bare single digits,
// and single-digit slash pairs ("2/3") are all stripped before cup tokenization.
function isCommercialQualifier(token: string): boolean {
  if (/^ny\d?$/.test(token)) return true          // ny, ny2, ny3
  if (token === 'up') return true
  if (/^\d$/.test(token)) return true             // bare single digit (NY grade remnant)
  if (/^\d\/\d$/.test(token)) return true         // single-digit slash pair, e.g. 2/3
  return false
}

interface QualityProfile {
  screen: string | null         // e.g. "17/18" or "16+"
  cup: Set<string>              // discriminating cup/prep tokens
  signature: string            // canonical signature for exact-equality checks
}

function profileOf(raw: string): QualityProfile {
  // Normalize: lowercase, strip punctuation except "/" and "+", collapse whitespace.
  const norm = raw
    .toLowerCase()
    .replace(/[^a-z0-9/+\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Screen size: two-digit slash form (13/14 .. 19/20) first, else two-digit plus
  // form (16+, 18+). Two-digit requirement keeps NY grades like "2/3" out.
  const slash = norm.match(/\b(\d{2}\/\d{2})\b/)
  const plus = norm.match(/\b(\d{2}\+)/)
  const screen = slash ? slash[1] : plus ? plus[1] : null

  const cup = new Set<string>()
  for (const token of norm.split(' ')) {
    if (!token) continue
    if (token === screen) continue
    if (isCommercialQualifier(token)) continue
    const expanded = ABBREVIATIONS[token]
    const words = expanded ? expanded.split(' ') : [token]
    for (const w of words) {
      if (STOPWORDS.has(w)) continue
      if (isCommercialQualifier(w)) continue
      cup.add(w)
    }
  }

  const signature = `${screen ?? ''}|${[...cup].sort().join(',')}`
  return { screen, cup, signature }
}

function specText(s: QualitySpecCandidate): string {
  return [s.custom_name, s.quality_code, s.template_name].filter(Boolean).join(' ')
}

function none(source_text: string): QualityMatch {
  return { matched: false, spec_id: null, spec_label: null, source_text, confidence: 'none' }
}

export function matchQuality(
  contractText: string | null | undefined,
  specs: QualitySpecCandidate[],
): QualityMatch {
  const source_text = contractText ?? ''
  if (!source_text.trim()) return none(source_text)

  const cp = profileOf(source_text)
  if (!cp.screen && cp.cup.size === 0) return none(source_text) // nothing to match on
  if (specs.length === 0) return none(source_text)

  const evals = specs.map(s => {
    const sp = profileOf(specText(s))
    const screenBoth = !!cp.screen && !!sp.screen
    const screenMatch = screenBoth && cp.screen === sp.screen
    const disqualified = screenBoth && cp.screen !== sp.screen
    const sharedCup = [...cp.cup].filter(t => sp.cup.has(t)).length
    const exactEqual = cp.signature === sp.signature
    const high = !disqualified && ((screenMatch && sharedCup >= 1) || exactEqual)
    const score = disqualified ? -1 : (screenMatch ? 3 : 0) + sharedCup
    return { s, disqualified, high, score }
  })

  const live = evals.filter(e => !e.disqualified && e.score > 0)
  if (live.length === 0) return none(source_text)

  const top = Math.max(...live.map(e => e.score))
  const tops = live.filter(e => e.score === top)
  const highs = live.filter(e => e.high)

  if (highs.length === 1 && tops.length === 1 && highs[0].s.id === tops[0].s.id) {
    const m = highs[0].s
    return {
      matched: true,
      spec_id: m.id,
      spec_label: m.custom_name || m.quality_code || null,
      source_text,
      confidence: 'high',
    }
  }

  // Something overlapped but it wasn't a unique, confident win — leave it manual.
  return { matched: false, spec_id: null, spec_label: null, source_text, confidence: 'low' }
}
