/**
 * The defect types a lot is graded against, read off its quality spec in the
 * same order of precedence the grading page uses (template
 * defect_configuration → template defect_requirements → template defects →
 * the client's custom defect_requirements → custom defects). Editors list
 * every one of them so a grader types counts, not names.
 */

export interface DefectCatalogEntry {
  name: string
  category: 'primary' | 'secondary'
}

function listFrom(params: any): any[] | null {
  if (!params || typeof params !== 'object') return null
  const candidates = [
    params.defect_configuration?.defects,
    params.defect_requirements?.defects,
    params.defects,
  ]
  for (const c of candidates) if (Array.isArray(c) && c.length > 0) return c
  return null
}

function toCatalog(raw: any[]): DefectCatalogEntry[] {
  const ordered = raw
    .map((d, index) => ({ d, order: typeof d?.display_order === 'number' ? d.display_order : index }))
    .sort((a, b) => a.order - b.order)
  const seen = new Set<string>()
  const out: DefectCatalogEntry[] = []
  for (const { d } of ordered) {
    const name = String(d?.name ?? d?.name_en ?? '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name, category: d?.category === 'secondary' ? 'secondary' : 'primary' })
  }
  return out
}

/** Defect types from a spec's template parameters, else its custom parameters; [] when neither has any. */
export function defectCatalogFromSpec(templateParams: unknown, customParams: unknown): DefectCatalogEntry[] {
  const raw = listFrom(templateParams) ?? listFrom(customParams)
  return raw ? toCatalog(raw) : []
}

/** Defect definitions (GET /api/defect-definitions rows) as a catalog: the fallback when the spec lists none. */
export function defectCatalogFromDefinitions(definitions: unknown): DefectCatalogEntry[] {
  if (!Array.isArray(definitions)) return []
  return toCatalog(definitions.map((def: any) => ({ name: def?.name_en, category: def?.category })))
}
