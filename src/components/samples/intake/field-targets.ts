/**
 * Where each "Still needed" item lives on screen, so the list (and a Continue
 * pressed too early) can take the user straight to the field. The keys are
 * the phrases wizard.ts and quantity-model.ts produce; the values are the
 * `data-field` markers the step components put on each field's box. Layout
 * only: which fields are needed stays with wizard.ts.
 */
import { CONTAINER_SIZES } from '@/lib/container-quantity'
import { overBoxMessage } from './quantity-model'

const ISSUE_FIELD: Record<string, string> = {
  Seller: 'seller',
  Shipper: 'shipper',
  'Sample type': 'sample_type',
  Laboratory: 'laboratory',
  Origin: 'origin',
  'Importer or QC client': 'importer',
  'Quality specification': 'quality_spec',
  Packaging: 'bag_type',
  Boxes: 'container_count',
  'Bag weight': 'bag_weight',
  ...Object.fromEntries(CONTAINER_SIZES.map((size) => [overBoxMessage(size), 'mt_per_box'])),
  'Arrival date': 'arrival_date',
}

/** The `data-field` an issue points at: a field, or a sub-contract row ("Contract #3: …" is row 1). */
export function issueField(issue: string): string | null {
  if (ISSUE_FIELD[issue]) return ISSUE_FIELD[issue]
  const row = /^Contract #(\d+): /.exec(issue)
  return row ? `contract-${Number(row[1]) - 2}` : null
}

const FOCUSABLE =
  'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Scroll a field's box into view and focus its first control. False when it is not on screen. */
export function focusField(root: ParentNode | null | undefined, field: string): boolean {
  const box = root?.querySelector<HTMLElement>(`[data-field="${field}"]`)
  if (!box) return false
  box.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  const control = box.matches(FOCUSABLE) ? box : box.querySelector<HTMLElement>(FOCUSABLE)
  control?.focus({ preventScroll: true })
  return true
}

/** Focus the first control of a step or section: its `[data-autofocus]` control, else its first field. */
export function focusFirstField(root: ParentNode | null | undefined): void {
  const target =
    root?.querySelector<HTMLElement>('[data-autofocus]') ??
    root?.querySelector<HTMLElement>('input:not([disabled]):not([type="hidden"]):not([type="file"]), textarea:not([disabled])')
  target?.focus({ preventScroll: true })
}
