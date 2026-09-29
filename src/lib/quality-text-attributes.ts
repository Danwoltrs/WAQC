// src/lib/quality-text-attributes.ts
//
// What a sys contract's quality text says about the coffee beyond its grade:
// the region (micro-origin), how it was processed, and its certifications.
// Sys keeps none of these as columns; they live in the free text the trader
// typed ("NY 2/3 17/18 FINE CUP CERRADO NATURAL RA") and in the name of the
// sys quality the contract points to. Pure, so the intake mapping and its
// tests share it.

import { MICRO_ORIGINS, MICRO_ORIGIN_BLEND } from '@/components/samples/intake/constants'

export interface QualityTextAttributes {
  /** Region names exactly as the intake lists them (MICRO_ORIGINS), plus "Blend". */
  micro_origins: string[]
  /** One of PROCESSING_METHODS; null when the text names none, or more than one. */
  processing_method: string | null
  /** WAQC's certification names (see normalizeCertifications). */
  certifications: string[]
}

/** Lower case, no accents, punctuation as spaces: "Sul-de-Minas." → "sul de minas". */
function normalize(text: string): string {
  return ` ${text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Every listed region name, plus the short forms traders write. Longest
 * first, and each match is blanked out of the text before the next is tried,
 * so "Alta Mogiana" is never also read as "Mogiana".
 */
const REGION_PATTERNS: Array<{ pattern: RegExp; region: string }> = (() => {
  const names = [...new Set(Object.values(MICRO_ORIGINS).flat())]
  const entries = names.map((region) => ({ phrase: normalize(region).trim(), region }))
  const aliases: Array<{ phrase: string; region: string }> = [
    { phrase: 'cerrado', region: 'Cerrado Mineiro' },
    { phrase: 'sul minas', region: 'Sul de Minas' },
    { phrase: 'south minas', region: 'Sul de Minas' },
    { phrase: 'south of minas', region: 'Sul de Minas' },
    { phrase: 'blend', region: MICRO_ORIGIN_BLEND },
    { phrase: 'blended', region: MICRO_ORIGIN_BLEND },
  ]
  return [...entries, ...aliases]
    .sort((a, b) => b.phrase.length - a.phrase.length)
    .map(({ phrase, region }) => ({ pattern: new RegExp(` ${escape(phrase).replace(/ /g, ' +')} `, 'g'), region }))
})()

/**
 * Processing words, most specific first: "pulped natural" and "semi-washed"
 * are claimed before "natural" and "washed" can read them.
 */
const PROCESSING_PATTERNS: Array<{ pattern: RegExp; method: string }> = [
  { pattern: / carbonic( maceration)? /g, method: 'Carbonic Maceration' },
  { pattern: / anaerobic[a-z]* /g, method: 'Anaerobic' },
  { pattern: / (wet hulled|giling basah) /g, method: 'Wet Hulled' },
  { pattern: / honey /g, method: 'Honey' },
  { pattern: / (semi ?washed|semi lavado|pulped naturals?|cereja descascad[ao]|descascad[ao]) /g, method: 'Semi-Washed' },
  { pattern: / (fully washed|washed|lavado) /g, method: 'Washed' },
  { pattern: / (naturals?|dry processed|unwashed) /g, method: 'Natural' },
]

const CERTIFICATION_PATTERNS: Array<{ pattern: RegExp; certification: string }> = [
  { pattern: / (rainforest( alliance)?|ra|rfa) /, certification: 'Rainforest Alliance' },
  { pattern: / flo /, certification: 'FLO Fair Trade' },
  { pattern: / fair ?trade /, certification: 'Fair Trade' },
  { pattern: / organic[a-z]* /, certification: 'Organic' },
  { pattern: / eudr /, certification: 'EUDR' },
]

/** Blank each match out (keeping the spaces around it) so later patterns cannot read it again. */
function claim(text: string, pattern: RegExp): { text: string; found: boolean } {
  let found = false
  // Matches overlap on their shared spaces ("cerrado natural"), so run twice.
  let next = text
  for (let i = 0; i < 2; i++) {
    next = next.replace(pattern, () => {
      found = true
      return '  '
    })
  }
  return { text: next, found }
}

/**
 * Read region, processing and certifications from one or more texts (the
 * contract's quality description, the sys quality's name). A processing
 * method is only returned when the texts name exactly one, so a blend of
 * naturals and washed coffees is left for the user.
 */
export function readQualityTextAttributes(texts: Array<string | null | undefined>): QualityTextAttributes {
  const joined = normalize(texts.filter(Boolean).join(' | '))

  let text = joined
  const micro_origins: string[] = []
  for (const { pattern, region } of REGION_PATTERNS) {
    const result = claim(text, pattern)
    text = result.text
    if (result.found && !micro_origins.includes(region)) micro_origins.push(region)
  }

  text = joined
  const methods: string[] = []
  for (const { pattern, method } of PROCESSING_PATTERNS) {
    const result = claim(text, pattern)
    text = result.text
    if (result.found && !methods.includes(method)) methods.push(method)
  }

  const found = CERTIFICATION_PATTERNS
    .filter(({ pattern }) => pattern.test(joined))
    .map(({ certification }) => certification)
  // "FLO Fairtrade" names one certification, not two.
  const certifications = found.includes('FLO Fair Trade') ? found.filter((c) => c !== 'Fair Trade') : found

  return {
    micro_origins,
    processing_method: methods.length === 1 ? methods[0] : null,
    certifications,
  }
}
