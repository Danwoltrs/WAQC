/**
 * What the client quality dialog's template picker shows as selected. An
 * existing quality points at its own private copy, which the picker list
 * (/api/quality-templates) hides, so the copy is named from the quality's own
 * template embed, as a copy of its parent when the parent is in the list.
 */

export interface PickerTemplate {
  id: string
  name: string
}

export interface CurrentTemplate {
  id: string
  name: string | null
  name_en?: string | null
  template_parent_id?: string | null
}

const NONE = 'Select a template'

export function templatePickerLabel(
  templateId: string | null | undefined,
  templates: PickerTemplate[],
  current: CurrentTemplate | null | undefined,
): string {
  if (!templateId) return NONE
  const listed = templates.find((t) => t.id === templateId)
  if (listed) return listed.name || NONE
  if (!current || current.id !== templateId) return NONE
  const name = current.name_en?.trim() || current.name?.trim()
  if (!name) return NONE
  const parent = current.template_parent_id ? templates.find((t) => t.id === current.template_parent_id) : undefined
  return parent?.name ? `${name} (client copy of ${parent.name})` : name
}
