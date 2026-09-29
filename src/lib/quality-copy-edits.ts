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
// - Screens: when the contract names another range than the source ("15/16"
//   against "14/16"), the one screen carrying a requirement (minimum or range)
//   hands it to the contract's lowest screen, replacing that screen's row,
//   and its own row goes.
// - Defects: the total maximum moves 12 per whole NY grade between the
//   source and the contract (2/3 → 3/4 = +12, 2 → 2/3 = +6); the same grade,
//   or no grade on either side, keeps it.
//
// Pure, so the dialog and its tests share it.

import { screenRangeOf } from './quality-matching'

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
  /** Screens: the row that was removed. */
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

/** The screen number a constraint names ("Screen 16", "16"), or null (Pan). */
function screenNumber(size: unknown): number | null {
  const m = String(size ?? '').match(/\d{2}/)
  return m ? Number(m[0]) : null
}

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
    const lowest = Number(contractRange.slice(0, 2))
    const constraints: any[] = parameters.screen_size_requirements?.constraints ?? []
    const required = constraints.filter((c) =>
      (c.constraint_type === 'minimum' || c.constraint_type === 'range') && screenNumber(c.screen_size) != null)

    if (required.length !== 1) {
      edits.push({
        id: 'screen', section: 'screen', changed: false, label: 'Screen sizes',
        summary: `Contract says ${contractRange}; ${sourceName} is ${sourceRange}. More than one screen carries a requirement, so check them.`,
      })
    } else if (screenNumber(required[0].screen_size) !== lowest) {
      const req = required[0]
      const existing = constraints.find((c) => c !== req && screenNumber(c.screen_size) === lowest)
      const target = existing?.screen_size ?? String(req.screen_size).replace(/\d{2}/, String(lowest))
      parameters.screen_size_requirements = {
        ...parameters.screen_size_requirements,
        constraints: [
          ...constraints.filter((c) => c !== req && c !== existing),
          { ...req, screen_size: target },
        ],
      }
      edits.push({
        id: 'screen', section: 'screen', changed: true, screen: target, removed: req.screen_size,
        label: 'Screen sizes',
        summary: `Contract says ${contractRange}, ${sourceName} is ${sourceRange}: the requirement moves to screen ${lowest}.`,
        was: [`${req.screen_size} ${requirementLabel(req)}`, existing && `${existing.screen_size} ${anyLabel(existing)}`].filter(Boolean).join(', '),
        now: `${target} ${requirementLabel(req)}, ${req.screen_size} removed`,
      })
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
