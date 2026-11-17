import { NODES } from '@/lib/cva/flavor-wheel-data'
import { sanitizePicks } from './picks'
import { CUPPER_PICK_CAP, RESOLVED_NOTE_CAP, type PanelSensoryRow } from './types'

const ORDER = new Map(NODES.map((n, i) => [n.path.join('>'), i]))

export function mergePanelSensory(input: {
  rows: PanelSensoryRow[]
  excludedScoreIds: readonly string[]
  sourceScoreId: string | null
  profileId: string | null
}): { notes: string[][]; counts: Record<string, number>; match: boolean | null; contributors: number } {
  const excluded = new Set(input.excludedScoreIds)
  const included = input.rows
    .filter((r) => !excluded.has(r.score_id))
    .map((r) => ({ row: r, picks: r.sensory ? sanitizePicks(r.sensory.picks, CUPPER_PICK_CAP) : [] }))
  const contributing = included.filter((x) => x.picks.length > 0)

  const counts: Record<string, number> = {}
  for (const { picks } of contributing) {
    for (const p of picks) {
      const k = p.join('>')
      counts[k] = (counts[k] ?? 0) + 1
    }
  }

  const matches = (s: PanelSensoryRow['sensory']) =>
    input.profileId !== null && s !== null && s.profile_id === input.profileId && typeof s.profile_match === 'boolean'

  const source = input.sourceScoreId ? included.find((x) => x.row.score_id === input.sourceScoreId) : undefined
  if (source) {
    const s = source.row.sensory
    return {
      notes: sanitizePicks(source.picks, RESOLVED_NOTE_CAP),
      counts,
      match: matches(s) ? (s!.profile_match as boolean) : null,
      contributors: contributing.length,
    }
  }

  const threshold = Math.ceil(contributing.length / 2)
  const notes = Object.keys(counts)
    .filter((k) => counts[k] >= threshold)
    .sort((a, b) => counts[b] - counts[a] || (ORDER.get(a) ?? 0) - (ORDER.get(b) ?? 0))
    .slice(0, RESOLVED_NOTE_CAP)
    .map((k) => k.split('>'))

  let yes = 0
  let no = 0
  for (const { row } of included) {
    if (!matches(row.sensory)) continue
    if (row.sensory!.profile_match) yes++
    else no++
  }
  return { notes, counts, match: yes > no ? true : no > yes ? false : null, contributors: contributing.length }
}
