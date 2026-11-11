import { describe, it, expect } from 'vitest'
import { templatePickerLabel } from './template-picker-label'

const templates = [
  { id: 'base-1', name: 'Brazil NY2 17/18' },
  { id: 'base-2', name: 'Colombia Excelso' },
]

describe('templatePickerLabel', () => {
  it('names a picked template from the picker list', () => {
    expect(templatePickerLabel('base-2', templates, null)).toBe('Colombia Excelso')
  })

  it("names an existing quality's private copy, hidden from the picker, as a copy of its parent", () => {
    const copy = { id: 'copy-9', name: 'Brazil NY2 17/18', name_en: 'Brazil NY2 17/18 EN', template_parent_id: 'base-1' }
    expect(templatePickerLabel('copy-9', templates, copy)).toBe('Brazil NY2 17/18 EN (client copy of Brazil NY2 17/18)')
  })

  it('names the copy alone when its parent is unknown', () => {
    expect(templatePickerLabel('copy-9', templates, { id: 'copy-9', name: 'Old copy', template_parent_id: 'gone' })).toBe('Old copy')
    expect(templatePickerLabel('copy-9', templates, { id: 'copy-9', name: 'Old copy', template_parent_id: null })).toBe('Old copy')
  })

  it('asks for a template when none is picked or nothing names it', () => {
    expect(templatePickerLabel('', templates, null)).toBe('Select a template')
    expect(templatePickerLabel('unknown', templates, null)).toBe('Select a template')
    expect(templatePickerLabel('unknown', templates, { id: 'other', name: 'X' })).toBe('Select a template')
  })
})
