import type { ThermalCuppingCardData } from '@/components/pdf/thermal-cupping-card'
import type { GuestCupper } from './roster'

export interface CardRoster {
  cuppers: { id: string; full_name: string }[]
  guests: GuestCupper[]
}

export interface ExpandedCard {
  card: ThermalCuppingCardData
  /** QR content to encode for this card; null when the card keeps (or lacks) a QR of its own. */
  qr_payload: string | null
}

export const CVA_QR_PREFIX = 'WAQC-CVA'
export const ANON_CUPPER_KEY = 'anon'

export const guestKey = (guestId: string) => `g:${guestId}`

/**
 * Payload of a specialty card's QR. The prefix is deliberately NOT `WAQC:`:
 * the commodity OCR scanner (`ocr/process-card`) parses only that prefix and
 * would take the trailing cupper uuid for a template id, mangle the tracking
 * number and write a COMMODITY score against a specialty lot. Nothing reads
 * this prefix yet; it is here so a scanned card attributes itself to sample
 * + cupper when something does.
 */
export function cvaQrPayload(
  card: Pick<ThermalCuppingCardData, 'sample_id' | 'tracking_number' | 'template_id'>,
  cupperKey: string,
): string {
  return `${CVA_QR_PREFIX}:${card.sample_id}:${card.tracking_number}:${card.template_id ?? ''}:${cupperKey}`
}

interface Recipient {
  key: string
  name?: string
}

function recipients(roster: CardRoster, blankCopies: number): Recipient[] {
  const staff = roster.cuppers.map((c) => ({ key: c.id, name: c.full_name }))
  const guests = roster.guests.map((g) => ({ key: guestKey(g.id), name: g.name }))
  const named = [...staff, ...guests]
  if (named.length > 0) return named
  return Array.from({ length: Math.max(1, blankCopies) }, () => ({ key: ANON_CUPPER_KEY }))
}

/**
 * Commodity cards pass through first, in input order (one per sample, all
 * cuppers on it). Specialty cards are expanded one per (cupper, sample) — the
 * Affective form is single-cupper by construction — with each cupper's stack
 * contiguous, staff in roster order then guests, so a printed pile can be
 * handed over per person. With nobody on the roster, `blankCopies` unnamed
 * sets print. `qr_code` is left empty here; the caller encodes `qr_payload`.
 */
export function expandCvaCards(
  cards: ThermalCuppingCardData[],
  roster: CardRoster,
  opts: { qr: boolean; blankCopies: number },
): ExpandedCard[] {
  const commodity: ExpandedCard[] = cards.filter((c) => !c.is_cva).map((card) => ({ card, qr_payload: null }))
  const specialty = cards.filter((c) => c.is_cva)
  if (specialty.length === 0) return commodity

  const expanded: ExpandedCard[] = []
  for (const who of recipients(roster, opts.blankCopies)) {
    for (const base of specialty) {
      const card: ThermalCuppingCardData = { ...base, cupper_key: who.key, cupper_name: who.name, qr_code: '' }
      expanded.push({ card, qr_payload: opts.qr ? cvaQrPayload(base, who.key) : null })
    }
  }
  return [...commodity, ...expanded]
}

/** The stage advance and the printed stamp are per sample; several cards now share one. */
export function uniqueSampleIds(cards: Pick<ThermalCuppingCardData, 'sample_id'>[]): string[] {
  return [...new Set(cards.map((c) => c.sample_id).filter(Boolean))]
}
