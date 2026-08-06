import type { ChecklistRow } from '@/lib/certificate-checklist'

/** One attribute's rail: where the band sits and where the score landed. */
export interface AttributeRail {
  attribute: string
  score: number
  min: number | null
  max: number | null
  scaleMin: number
  scaleMax: number
}

/** One screen's bar. */
export interface ScreenBar {
  label: string
  percent: number
  /**
   * Render this bar dim olive rather than full olive. True for Pan (a
   * deliberate visual choice, independent of any spec) and for a screen
   * failing a MINIMUM constraint — never for one merely exceeding a maximum,
   * which would visually read as "too low" for the opposite problem.
   */
  dim: boolean
}

/**
 * Everything the page renders, resolved server-side.
 *
 * Every identifier here is one the counterparty holds themselves — the
 * certificate number printed on the tin, their contract number, the container.
 * The internal SAN- lab number never reaches this object.
 */
export interface CertificateView {
  /**
   * The official certificate number: what the QR encodes, what is printed on
   * the tin, and what a warehouse reads back to us. Null only on the legacy
   * path where a certificate row carries no number.
   */
  certificateNumber: string | null
  /** The buyer's own contract number, or ours labelled as ours. */
  contract: { label: string; value: string } | null
  /** The physical lot: 'Container HASU 155.201-6' or an exporter sample number. */
  lotReference: { label: string; value: string } | null
  /**
   * Headline fallback for a certificate with no number — the counterparty's own
   * identifier, resolved by `resolvePublicReference`.
   */
  reference: string
  eyebrow: string
  status: 'APPROVED' | 'REJECTED'
  qualityName: string | null
  exporter: string | null
  origin: string | null
  quantity: string | null
  certifiedDate: string | null
  bagType: string | null
  rows: ChecklistRow[]
  screens: ScreenBar[]
  screenSpecNote: string | null
  attributes: AttributeRail[]
  /** null when the lot was never cupped — render a dash, not a false "0". */
  taints: number | null
  faults: number | null
  cleanCup: boolean | null
  uniformCup: boolean | null
  pdfUrl: string
  /**
   * The sentences recorded on `certificates.compliance_violations` at
   * certification (or preserved through a staff override). Raw and
   * unvalidated — it is a Postgres `Json` column — parsed defensively by
   * `resolveVerdictReasons`.
   */
  complianceViolations: unknown
  /** A staff override's required comment, when this certificate's status was
   * hand-flipped via `/api/certificates/[id]/override`. */
  overrideComment: string | null
}
