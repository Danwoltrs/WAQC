import { describe, it, expect } from 'vitest'
import { clampSendRange, sendWindowRange } from './send-window'

describe('sendWindowRange', () => {
  it.each([
    ['1d', '2026-09-14', '2026-09-14'],
    ['1w', '2026-09-14', '2026-09-08'],
    ['2w', '2026-09-14', '2026-09-01'],
    ['4w', '2026-09-14', '2026-08-18'],
    ['1w', '2026-01-03', '2025-12-28'],
    ['4w', '2024-03-15', '2024-02-17'],
  ] as const)('%s ending %s starts on %s', (window, today, from) => {
    expect(sendWindowRange(window, today)).toEqual({ from, to: today })
  })
})

describe('clampSendRange', () => {
  const today = '2026-09-14'

  it('keeps a range inside four weeks as it is', () => {
    expect(clampSendRange('2026-09-08', '2026-09-14', today)).toEqual({ from: '2026-09-08', to: '2026-09-14' })
  })

  it('pulls an older start forward to four weeks before the end', () => {
    expect(clampSendRange('2026-01-01', '2026-09-14', today)).toEqual({ from: '2026-08-18', to: '2026-09-14' })
  })

  it('measures the four weeks back from the requested end, not from today', () => {
    expect(clampSendRange('2026-06-01', '2026-06-30', today)).toEqual({ from: '2026-06-03', to: '2026-06-30' })
  })

  // The old queue took the table's date filter, which is empty by default — so
  // an unfiltered "Send unsent" swept every certificate ever issued.
  it('treats a missing or malformed range as the last four weeks', () => {
    expect(clampSendRange(null, null, today)).toEqual({ from: '2026-08-18', to: '2026-09-14' })
    expect(clampSendRange('', 'yesterday', today)).toEqual({ from: '2026-08-18', to: '2026-09-14' })
  })
})
