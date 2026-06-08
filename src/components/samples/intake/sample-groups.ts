// src/components/samples/intake/sample-groups.ts
//
// Pure helpers + shared types for sample groups (sub-samples), ported verbatim
// from sys.wolthers.com (wolthers-app/src/components/samples/sample-groups.ts).
// WAQC and sys share the same database, so the leaf payloads sent to the
// `create_sample_group` RPC must match byte-for-byte. No React, no Supabase.

export type SampleGroupKind = 'container_split' | 'choices'

/** Payload for one sub-sample leaf, sent to the create_sample_group RPC. */
export interface LeafPayload {
  bags: number | null
  container_slot: number | null
  container_total: number | null
  choice_label: string | null
  choice_description: string | null
  rerequested_from_id?: string | null
}

/** Divide `total` bags across `count` slots; the remainder lands on slot 1. */
export function splitBagsEvenly(total: number | null, count: number): number[] {
  if (count < 1) return []
  const t = total && total > 0 ? Math.floor(total) : 0
  const base = Math.floor(t / count)
  const remainder = t - base * count
  return Array.from({ length: count }, (_, i) => base + (i === 0 ? remainder : 0))
}

/** N container-split leaves: slots 1..N, bags auto-split, choice fields null. */
export function buildSplitLeaves(totalBags: number | null, count: number): LeafPayload[] {
  const bags = splitBagsEvenly(totalBags, count)
  return bags.map((b, i) => ({
    bags: b,
    container_slot: i + 1,
    container_total: count,
    choice_label: null,
    choice_description: null,
  }))
}

/** M choice leaves labelled A, B, C…; container fields null. */
export function buildChoiceLeaves(
  choices: Array<{ description: string; bags: number | null }>,
): LeafPayload[] {
  return choices.map((c, i) => ({
    bags: c.bags,
    container_slot: null,
    container_total: null,
    choice_label: String.fromCharCode(65 + i), // 65 = 'A'
    choice_description: c.description.trim() || null,
  }))
}
