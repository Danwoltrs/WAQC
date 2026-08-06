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
  /** below the spec floor → dim olive */
  belowFloor: boolean
}

/**
 * Everything the page renders, resolved server-side.
 *
 * `reference` is always the counterparty's own identifier — container number,
 * exporter sample number or contract number. The internal SAN- lab number never
 * reaches this object.
 */
export interface CertificateView {
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
  taints: number
  faults: number
  cleanCup: boolean | null
  uniformCup: boolean | null
  pdfUrl: string
}
