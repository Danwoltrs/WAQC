// src/lib/contract-quality-text.ts
//
// The full quality text of a sys contract, as sys shows it on the contract
// and prints it on the Sale Confirmation ("Brazil Arabica Unwashed Coffee -
// NY 2/3 , Screen 15/16, Strictly Soft, Fine Cup, Crop 2026/2027.").
//
// contracts.quality_description usually holds only the buyer quality's SHORT
// name ("15/16 FC"), and contracts.quality_id is not populated in practice,
// so sys links to the buyer's catalogue (company_qualities) by TEXT. Mirrors
// sys resolveQualityBandText + formatQualityText (wolthers-app
// src/lib/contracts/quality-band-text.ts, sale-confirmation-data.ts), minus
// the certification labels, which WAQC keeps as their own field.

export interface CatalogueQuality {
  short_name: string | null
  full_description: string | null
}

/** Trim, lower case, drop a trailing period (sys `norm`). */
function norm(s: string | null | undefined): string {
  return (s ?? '').trim().replace(/\.$/, '').toLowerCase()
}

/** The text with ", Crop <crop>" and a closing period (sys formatQualityText). */
function compose(description: string, crop: string | null | undefined): string {
  let text = description.trim()
  const cropValue = crop?.trim()
  if (cropValue) {
    if (text.endsWith('.')) text = text.slice(0, -1).trimEnd()
    text = text.endsWith(',') ? `${text} Crop ${cropValue}` : `${text}, Crop ${cropValue}`
  } else if (text.endsWith(',')) {
    text = text.slice(0, -1).trimEnd()
  }
  return text.endsWith('.') ? text : `${text}.`
}

/**
 * The contract's full quality text, or null when there is nothing fuller than
 * what the contract row already says.
 */
export function contractQualityFullText(input: {
  /** contracts.quality_description (usually the short name). */
  description: string | null | undefined
  /** contracts.quality_sc_text: a legacy contract's own wording, when set. */
  scText?: string | null
  /** The buyer's active company_qualities. */
  qualities: CatalogueQuality[]
  crop: string | null | undefined
}): string | null {
  const description = input.description?.trim()
  if (!description) return null
  const d = norm(description)

  const own = input.scText?.trim()
  if (own && norm(own) !== d) return compose(own, input.crop)

  const match =
    input.qualities.find((q) => norm(q.short_name) === d) ??
    input.qualities.find((q) => norm(q.full_description) === d)
  if (!match) return null
  const full = norm(match.short_name) === d ? (match.full_description?.trim() || description) : description
  if (norm(full) === norm(match.short_name)) return null
  return compose(full, input.crop)
}
