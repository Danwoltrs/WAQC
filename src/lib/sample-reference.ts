/**
 * What a lot is called on screen.
 *
 * Nobody outside the lab quotes the internal SAN- lab number: a pre-shipment
 * sample is the exporter's own sample number, a shipment sample is its
 * container and its ICO. The tin sleeve, the public certificate page and the
 * PSS picker already follow that rule — this is the in-app version, so the
 * cupping surfaces agree with the paper the counterparty is holding.
 *
 * The internal number stays available as a last resort for a lot that carries
 * no identifier of its own, and `isInternal` says when we fell back to it.
 */

export interface SampleReferenceSource {
  sample_type?: string | null
  exporter_sample_number?: string | null
  container_nr?: string | null
  ico_number?: string | null
  tracking_number?: string | null
}

export interface SampleReference {
  /** Leads the label. Empty only when the sample carries no identifier at all. */
  primary: string
  /** The lot's other identifier — a shipment sample carries both container and ICO. */
  secondary: string | null
  /** True when nothing but the internal SAN- lab number was available. */
  isInternal: boolean
}

const str = (v: unknown): string | null => {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}

/**
 * SS leads with its container and carries the ICO alongside; PSS leads with the
 * exporter's sample number. A lot whose declared type has no matching field
 * falls through to whatever identifier it does carry, so an SS entered before
 * its container was known still shows its ICO rather than SAN-.
 */
export function resolveSampleReference(sample: SampleReferenceSource): SampleReference {
  const type = String(sample.sample_type || '').toLowerCase()
  const container = str(sample.container_nr)
  const ico = str(sample.ico_number)
  const exporterSample = str(sample.exporter_sample_number)

  if (type === 'ss') {
    const primary = container || ico
    if (primary) {
      return { primary, secondary: container && ico ? ico : null, isInternal: false }
    }
  }

  if (type === 'pss' && exporterSample) {
    return { primary: exporterSample, secondary: null, isInternal: false }
  }

  const fallback = exporterSample || container || ico
  if (fallback) {
    return {
      primary: fallback,
      secondary: fallback === container && ico ? ico : null,
      isInternal: false,
    }
  }

  return { primary: str(sample.tracking_number) || '', secondary: null, isInternal: true }
}

/** The reference and its companion as one string: "HASU 155.201-6 · 002/1649/0185". */
export function formatSampleReference(sample: SampleReferenceSource): string {
  const ref = resolveSampleReference(sample)
  return [ref.primary, ref.secondary].filter(Boolean).join(' · ')
}
