import { describe, it, expect } from 'vitest'
import { focusField, issueField } from './field-targets'
import { BULK_OVER_CAP_MESSAGE } from './quantity-model'

describe('issueField', () => {
  it('points every details-step and review-step issue at its field', () => {
    expect(issueField('Seller')).toBe('seller')
    expect(issueField('Shipper')).toBe('shipper')
    expect(issueField('Importer or QC client')).toBe('importer')
    expect(issueField('Quality specification')).toBe('quality_spec')
    expect(issueField('Quantity of bags')).toBe('bag_count')
    expect(issueField(BULK_OVER_CAP_MESSAGE)).toBe('bag_count')
    expect(issueField('Arrival date')).toBe('arrival_date')
  })

  it('points a sub-contract issue at its row (the sample itself is #1)', () => {
    expect(issueField('Contract #2: Bag weight')).toBe('contract-0')
    expect(issueField('Contract #4: Bag type')).toBe('contract-2')
  })

  it('has no target for an unknown phrase', () => {
    expect(issueField('Something else')).toBeNull()
  })
})

describe('focusField', () => {
  it('focuses the first control inside the field box', () => {
    document.body.innerHTML = '<div id="root"><div data-field="seller"><label>Seller</label><button type="button">Pick</button></div></div>'
    expect(focusField(document.getElementById('root'), 'seller')).toBe(true)
    expect(document.activeElement?.textContent).toBe('Pick')
  })

  it('reports a field that is not on screen', () => {
    document.body.innerHTML = '<div id="root"></div>'
    expect(focusField(document.getElementById('root'), 'seller')).toBe(false)
  })
})
