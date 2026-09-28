import { describe, it, expect } from 'vitest'
import { lastSegmentRange } from './ico-number'

describe('lastSegmentRange', () => {
  it('selects the lot of a slashed ICO mark, keeping country and exporter', () => {
    expect(lastSegmentRange('002/1234/0567')).toEqual({ start: 9, end: 13 })
  })

  it('treats dashes, dots and spaces as separators too', () => {
    expect(lastSegmentRange('2-0001-001-23-001')).toEqual({ start: 14, end: 17 })
    expect(lastSegmentRange('002.1234.0567')).toEqual({ start: 9, end: 13 })
    expect(lastSegmentRange('002 1234 0567')).toEqual({ start: 9, end: 13 })
  })

  it('selects the whole value when there is no separator', () => {
    expect(lastSegmentRange('00212340567')).toEqual({ start: 0, end: 11 })
  })

  it('puts the caret at the end of a value ending in a separator', () => {
    expect(lastSegmentRange('002/1234/')).toEqual({ start: 9, end: 9 })
  })

  it('handles an empty value', () => {
    expect(lastSegmentRange('')).toEqual({ start: 0, end: 0 })
  })
})
