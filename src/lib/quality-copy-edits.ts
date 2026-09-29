// src/lib/quality-copy-edits.ts
//
// What a copy of a client's quality specification should change to match the
// sys contract it is made for (the intake's "New quality specification"
// dialog, Daniel 2026-09-29). The dialog applies these on open, shows each in
// amber until the lab confirms it (green), and can undo it.
//
// - Description: the full description of the contract's sys quality
//   (quality_master.quality_description, "Brazil Arabica Unwashed Coffee -
//   NY 2/3, Screen 15/16, Strictly Soft, Fine Cup, Crop 2026/2027."), else
//   the contract's own quality words ("15/16 FC"). Both are read for the
//   screens and the NY grade, the words first.
// - Screens: when the contract names another range than the source ("17/18"
//   against "14/16"), the one screen carrying a requirement (minimum or range)
//   hands it to the contract's HIGHEST screen (Daniel 2026-09-29: 17/18 puts
//   it on 18, not 17), replacing that screen's row. "Any" rows below the
//   contract's range go, and the contract's lowest screen is listed as "any"
//   when missing so it is graded. Screens in between are implied (see
//   implied-screens.ts), so none are added for them.
// - Defects: the total maximum moves 12 per whole NY grade between the
//   source and the contract (2/3 → 3/4 = +12, 2 → 2/3 = +6); the same grade,
//   or no grade on either side, keeps it.
//
// Pure, so the dialog and its tests share it.

import { screenRangeOf } from './quality-matching'
import { screenNumberOf } from './implied-screens'

export type CopyEditId = 'description' | 'screen' | 'defects'

export interface CopyEdit {
  id: CopyEditId
  /** The editor section it belongs to. */
  section: 'basic' | 'screen' | 'defects'
  /** What changed: "Description", "Screen sizes", "Total defects". */
  label: string
  /** Why, in one line. */
  summary: string
  /** Before and after, for the lab to compare; absent when nothing changed. */
  was?: string
  now?: string
  /** False when the copy needs a look but nothing was changed. */
  changed: boolean
  /** Screens: the row that now carries the requirement. */
  screen?: string
  /** Screens: the rows that were removed, comma-separated. */
  removed?: string
}

export interface CopyPlan {
  /** The copy's parameters with the edits applied (the input is not mutated). */
  parameters: any
  /** The copy's new description, or null to keep the source's. */
  description: string | null
  edits: CopyEdit[]
}

/** Defects per whole NY grade (Daniel 2026-09-29). */
const DEFECTS_PER_GRADE = 12

/** "NY 2/3" → 2.5, "NY 3" → 3, none → null. */
export function nyGradeOf(text: string | null | undefined): number | null {
  const m = (text ?? '').match(/\bny\s*(\d)(?:\s*\/\s*(\d))?/i)
  if (!m) return null
  const first = Number(m[1])
  return m[2] && Number(m[2]) === first + 1 ? first + 0.5 : first
}

const gradeLabel = (g: number) => (Number.isInteger(g) ? `NY ${g}` : `NY ${Math.floor(g)}/${Math.floor(g) + 1}`)

function anyLabel(c: any): string {
  if (c.constraint_type === 'any') return 'any'
  if (c.constraint_type === 'maximum') return `≤ ${c.max_value ?? 0}%`
  return requirementLabel(c)
}

function requirementLabel(c: any): string {
  if (c.constraint_type === 'range') return `${c.min_value ?? 0}–${c.max_value ?? 0}%`
  return `≥ ${c.min_value ?? 0}%`
}

export function planCopyEdits(input: {
  /** The sys contract's quality words ("15/16 FC"). */
  contractText: string | null | undefined
  /** The full description of the contract's sys quality, when known. */
  contractDescription?: string | null
  /** The source specification's name(s). */
  sourceText: string
  sourceDescription: string | null | undefined
  parameters: any
}): CopyPlan {
  const words = (input.contractText ?? '').trim()
  const full = (input.contractDescription ?? '').trim()
  const parameters = { ...(input.parameters || {}) }
  const edits: CopyEdit[] = []
  let description: string | null = null
  if (!words && !full) return { parameters, description, edits }
  const contractSays = (read: (t: string) => any) => (words ? read(words) : null) ?? (full ? read(full) : null)

  const sourceName = input.sourceText.trim() || 'the source'
  // The name first, the description only where the name says nothing.
  const sourceSays = (read: (t: string) => any) => read(input.sourceText) ?? read(input.sourceDescription ?? '')

  // Description
  const text = full || words
  const before = (input.sourceDescription ?? '').trim()
  if (text !== before) {
    description = text
    edits.push({
      id: 'description', section: 'basic', changed: true, label: 'Description',
      summary: full ? 'Copied from the quality description on the contract.' : 'Copied from the contract.',
      was: before || '(empty)', now: text,
    })
  }

  // Screens
  const contractRange = contractSays(screenRangeOf)
  const sourceRange = sourceSays(screenRangeOf)
  if (contractRange && sourceRange && contractRange !== sourceRange) {
    const bounds = (contractRange.match(/\d{2}/g) ?? []).map(Number)
    const highest = Math.max(...bounds)
    const lowest = Math.min(...bounds)
    const constraints: any[] = parameters.screen_size_requirements?.constraints ?? []
    const required = constraints.filter((c) =>
      (c.constraint_type === 'minimum' || c.constraint_type === 'range') && screenNumberOf(c.screen_size) != null)

    if (required.length !== 1) {
      edits.push({
        id: 'screen', section: 'screen', changed: false, label: 'Screen sizes',
        summary: `Contract says ${contractRange}; ${sourceName} is ${sourceRange}. More than one screen carries a requirement, so check them.`,
      })
    } else {
      const req = required[0]
      const spell = (n: number) => String(req.screen_size).replace(/\d{2}/, String(n))
      const moves = screenNumberOf(req.screen_size) !== highest
      const replaced = moves
        ? constraints.find((c) => c !== req && screenNumberOf(c.screen_size) === highest)
        : undefined
      const target = moves ? (replaced?.screen_size ?? spell(highest)) : req.screen_size
      // "Any" screens below the contract's range leave with the old range.
      const dropped = constraints.filter((c) => c !== req && c !== replaced && c.constraint_type === 'any'
        && (screenNumberOf(c.screen_size) ?? Infinity) < lowest)
      const next = [
        ...constraints.filter((c) => c !== req && c !== replaced && !dropped.includes(c)),
        { ...req, screen_size: target },
      ]
      // The contract's lowest screen stays listed, so it is graded.
      const added = lowest < highest && !next.some((c) => screenNumberOf(c.screen_size) === lowest)
        ? { screen_size: spell(lowest), constraint_type: 'any', display_order: constraints.length }
        : null
      if (added) next.push(added)

      if (moves || dropped.length || added) {
        parameters.screen_size_requirements = { ...parameters.screen_size_requirements, constraints: next }
        const removed = [moves && req.screen_size, ...dropped.map((c) => c.screen_size)].filter(Boolean) as string[]
        edits.push({
          id: 'screen', section: 'screen', changed: true, screen: target,
          removed: removed.join(', ') || undefined,
          label: 'Screen sizes',
          summary: moves
            ? `Contract says ${contractRange}, ${sourceName} is ${sourceRange}: the requirement moves to screen ${highest}.`
            : `Contract says ${contractRange}, ${sourceName} is ${sourceRange}: screen ${highest} keeps the requirement.`,
          was: [
            moves && `${req.screen_size} ${requirementLabel(req)}`,
            replaced && `${replaced.screen_size} ${anyLabel(replaced)}`,
            ...dropped.map((c) => `${c.screen_size} any`),
          ].filter(Boolean).join(', ') || '(not listed)',
          now: [
            moves && `${target} ${requirementLabel(req)}`,
            added && `${added.screen_size} any`,
            removed.length && `${removed.join(', ')} removed`,
          ].filter(Boolean).join('; '),
        })
      }
    }
  }

  // Defects
  const contractGrade = contractSays(nyGradeOf)
  const sourceGrade = sourceSays(nyGradeOf)
  const thresholds = parameters.defect_configuration?.thresholds
  if (contractGrade != null && sourceGrade != null && contractGrade !== sourceGrade && typeof thresholds?.max_total === 'number') {
    const was = thresholds.max_total
    const after = Math.max(0, Math.round(was + DEFECTS_PER_GRADE * (contractGrade - sourceGrade)))
    parameters.defect_configuration = {
      ...parameters.defect_configuration,
      thresholds: { ...thresholds, max_total: after },
    }
    edits.push({
      id: 'defects', section: 'defects', changed: true, label: 'Total defects',
      summary: `Contract says ${gradeLabel(contractGrade)}, ${sourceName} is ${gradeLabel(sourceGrade)}: ${DEFECTS_PER_GRADE} per grade.`,
      was: `≤ ${was}`, now: `≤ ${after}`,
    })
  }

  return { parameters, description, edits }
}
