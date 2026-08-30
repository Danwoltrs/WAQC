import type { ThermalCuppingCardData } from './thermal-cupping-card'

/**
 * The identifier a cupping card leads with, shared by both faces.
 *
 * It lives in its own leaf module because the commodity card and the SCA
 * Affective face import each other: `thermal-cupping-card.tsx` renders
 * `CvaAffectiveCardFace`, and the face needs this rule. Importing the
 * function back out of the card would close a runtime cycle. The only import
 * here is a TYPE, which is erased at compile time, so nothing circular
 * survives into the bundle.
 */
export function cardSampleIdentifier(card: ThermalCuppingCardData): string {
  if (card.sample_type === 'ss') {
    return [card.ico_number || card.sample_number || card.tracking_number, card.container_nr]
      .filter(Boolean)
      .join('  |  ')
  }
  return card.exporter_sample_number || card.sample_number || card.tracking_number || 'Unknown'
}
