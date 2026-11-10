// Short read-outs of a client's QC settings: the rail on the client page and
// the group headers of the QC settings panel both print these, so the two
// always say the same thing.

import { generateCertificatePreview, type CertificatePattern } from '@/types/certificate-pattern'

export interface QcSettingsLike {
  pricingModel?: string | null
  pricePerSample?: number | null
  pricePerPoundCents?: number | null
  currency?: string | null
  billingBasis?: string | null
  paymentTerms?: string | null
  feePayer?: string | null
  qcFeeCoBrokerCompanyId?: string | null
  certificatePattern?: CertificatePattern | null
  certificateValidityMonths?: number | null
  toleranceAutoApprove?: boolean | null
  certificatesToAllParties?: boolean | null
}

const money = (n: number) => n.toFixed(2)

export function pricingSummary(s: QcSettingsLike): string {
  const cur = s.currency || 'USD'
  switch (s.pricingModel) {
    case 'complimentary': return 'Complimentary'
    case 'per_pound':
      return s.pricePerPoundCents != null ? `${s.pricePerPoundCents} c/lb` : 'Per pound, no price set'
    case 'flat_fee':
      return s.pricePerSample != null ? `Flat fee · ${cur} ${money(s.pricePerSample)}` : 'Flat fee'
    case 'per_sample':
      return s.pricePerSample != null ? `Per sample · ${cur} ${money(s.pricePerSample)}` : 'Per sample, no price set'
    default:
      return 'Not set'
  }
}

export function billingSummary(s: QcSettingsLike): string {
  const basis = s.billingBasis === 'approved_only' ? 'Approved only' : s.billingBasis ? 'All samples' : null
  const who = s.qcFeeCoBrokerCompanyId ? 'Deducted from co-broker' : null
  return [basis, s.paymentTerms?.trim() || null, who].filter(Boolean).join(' · ') || 'Not set'
}

/** The next certificate number as the pattern prints it, with example codes. */
export function certificateNumberPreview(pattern: CertificatePattern | null | undefined): string | null {
  if (!pattern) return null
  return generateCertificatePreview(
    pattern,
    pattern.has_quality_code ? 'AD' : undefined,
    pattern.has_origin_code ? 'BR' : undefined,
  )
}

export function rulesSummary(s: QcSettingsLike): string {
  return [
    `5% rule ${s.toleranceAutoApprove ? 'on' : 'off'}`,
    `sharing ${s.certificatesToAllParties ? 'on' : 'off'}`,
  ].join(' · ')
}

export function validitySummary(s: QcSettingsLike): string {
  return s.certificateValidityMonths ? `${s.certificateValidityMonths} months` : 'Off'
}
