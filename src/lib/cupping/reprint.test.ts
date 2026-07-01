import { describe, it, expect } from 'vitest'
import { canReprintCuppingCards } from './reprint'

describe('canReprintCuppingCards', () => {
  it('allows reprint once cards were printed, regardless of stage', () => {
    // Specialty/CVA samples stay at 'received' but still get cupping cards.
    expect(
      canReprintCuppingCards({ workflow_stage: 'received', cards_printed_at: '2026-07-01T10:00:00Z' })
    ).toBe(true)
  })

  it('allows reprint for samples that advanced past intake', () => {
    expect(canReprintCuppingCards({ workflow_stage: 'analysis', cards_printed_at: null })).toBe(true)
    expect(canReprintCuppingCards({ workflow_stage: 'roasting' })).toBe(true)
    expect(canReprintCuppingCards({ workflow_stage: 'review' })).toBe(true)
  })

  it('allows reprint for certified/rejected samples (reprint is inert paper)', () => {
    expect(
      canReprintCuppingCards({ workflow_stage: 'certified', cards_printed_at: '2026-07-01T10:00:00Z' })
    ).toBe(true)
    expect(canReprintCuppingCards({ workflow_stage: 'rejected' })).toBe(true)
  })

  it('does NOT offer reprint for a fresh, unprinted intake sample', () => {
    expect(canReprintCuppingCards({ workflow_stage: 'received', cards_printed_at: null })).toBe(false)
    expect(canReprintCuppingCards({ workflow_stage: 'received' })).toBe(false)
  })

  it('does NOT offer reprint when stage is missing and nothing was printed', () => {
    expect(canReprintCuppingCards({})).toBe(false)
    expect(canReprintCuppingCards({ workflow_stage: null, cards_printed_at: null })).toBe(false)
    expect(canReprintCuppingCards({ workflow_stage: undefined })).toBe(false)
  })
})
