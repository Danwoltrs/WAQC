/**
 * Cupping-card reprint eligibility.
 *
 * Reprinting a cupping card is inert — it produces another paper copy and changes
 * no decision — so it must stay available for the whole life of a sample once cards
 * have been printed. The QC tracker previously gated the "Reprint Cupping Cards"
 * action purely on `workflow_stage` (hidden while 'received', disabled once
 * 'certified'/'rejected'), which made printed samples un-reprintable in two common
 * cases: specialty/CVA samples that never leave 'received', and samples that have
 * already been cupped and certified.
 *
 * The authoritative signal is `cards_printed_at` (stamped whenever cupping cards are
 * printed). We also treat any sample that has advanced past intake ('received') as
 * reprintable, since reaching a later stage implies cuppers were assigned / cards
 * were produced — this covers historical samples printed before the stamp was
 * recorded reliably.
 */
export interface ReprintableSample {
  workflow_stage?: string | null
  cards_printed_at?: string | null
}

export function canReprintCuppingCards(sample: ReprintableSample): boolean {
  if (sample.cards_printed_at) return true
  const stage = sample.workflow_stage
  return !!stage && stage !== 'received'
}
