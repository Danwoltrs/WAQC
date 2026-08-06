# Tin Sleeve Label Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the tin sleeve label around the flowing-lines mockup, remove every trace of the internal `SAN-` reference, and switch the QR code from a text blob to a bare URL so scanning actually opens the certificate page.

**Architecture:** All field derivation moves out of the two print routes into one pure module (`src/lib/sleeve-label-data.ts`) that is unit-tested without a database or a PDF renderer. The PDF component becomes a dumb renderer of already-resolved strings. Both print routes gain a certification gate, because the certificate number the label prints is only minted at certification.

**Tech Stack:** Next.js 14 App Router, TypeScript, `@react-pdf/renderer`, Supabase, vitest (jsdom, globals, colocated `*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-08-05-sleeve-label-and-mobile-certificate-design.md`
**Visual reference:** `docs/prompts/sleeve_qr/waqc-sleeve-lines.html`

## Global Constraints

- `SAN-XXXXX/YY` (`samples.tracking_number`) must not appear on the label, in the QR payload, or in any string derived from either.
- Label geometry: `165mm × 40mm`, columns `30mm` wordmark / `27mm` QR / rest body, gap `4mm`, padding `3mm 4mm 3mm 3mm`.
- Sheet: A4 landscape, **5 labels per page**, no page margin.
- 2.5cm variant is kept and compressed: QR `18mm`, body font `~5.5pt`, `Seller:`/`Client:` merged onto the `Cert.:` line.
- Certificate number renders with the certified month inserted before the year: `BR-036991/26` → `BR-036991/JUL/26`.
- A field with no value is **omitted entirely**, never printed as an empty label. This applies to `Seller:`, `Client:`, `Cert.:` and `Roaster:`.
- Quality prints the client's `custom_name` when set, otherwise the template name — **never both** (this is the `Dunkin - Dunkin` bug).
- One label per mother sample. Sub-contracts get no label of their own; their certificate numbers are comma-joined into the `Cert.:` field.
- Printing is gated on `workflow_stage` in `('certified', 'rejected')`.
- Do not touch `print-bag-sleeves`, `[id]/print-bag-sleeve`, or `print-labels`. They keep using `buildCertificateQRText`.
- Run tests with `npx vitest run <path>`. The repo's `npm test` starts vitest in watch mode.

---

### Task 1: Pure label field resolvers

Everything the label prints, derived from plain data. No Supabase, no react-pdf, no dates from `Date.now()`.

**Files:**
- Create: `src/lib/sleeve-label-data.ts`
- Test: `src/lib/sleeve-label-data.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type SleeveSampleType = 'PSS' | 'SS' | 'Type Sample' | 'Stocklot'`
  - `interface SleeveLabelSource` (input shape, below)
  - `interface SleeveLabelFields` (output shape, below)
  - `withCertifiedMonth(certNumber: string, certifiedAt: string | null | undefined): string`
  - `formatLabelDate(iso: string | null | undefined): string | null`
  - `formatSleeveQuantity(src: SleeveLabelSource): string | null`
  - `toSleeveSampleType(raw: string | null | undefined): SleeveSampleType`
  - `resolveQualityName(qualitySpec: QualitySpecLike | null | undefined, fallback?: string | null): string | null`
  - `interface QualitySpecLike { custom_name?: string | null; template?: { name_en?: string | null; name_pt?: string | null; name_es?: string | null } | null }`
  - `buildSleeveLabelFields(src: SleeveLabelSource): SleeveLabelFields`

Tasks 3, 4 and 5 all depend on `SleeveLabelFields` field names exactly as written here.

- [ ] **Step 1: Write the failing test**

Create `src/lib/sleeve-label-data.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  withCertifiedMonth,
  formatLabelDate,
  formatSleeveQuantity,
  toSleeveSampleType,
  resolveQualityName,
  buildSleeveLabelFields,
  type SleeveLabelSource,
} from './sleeve-label-data'

const base: SleeveLabelSource = {
  sampleType: 'SS',
  containerNr: 'HASU 155.201-6',
  exporterSampleNumber: null,
  certificateNumbers: ['BR-036991/26'],
  certifiedAt: '2026-07-29T12:00:00.000Z',
  sellerName: 'OFI',
  sellerRef: null,
  clientName: 'OFI',
  clientRef: 'P-8037',
  roasterName: "Mother Parker's",
  quality: 'DDQ',
  bagCount: 333,
  bagWeightKg: 60,
  bagType: 'jute_bag',
  quantityMt: 20,
  equivalent60kgBags: 333,
}

describe('withCertifiedMonth', () => {
  it('inserts the month before the year segment', () => {
    expect(withCertifiedMonth('BR-036991/26', '2026-07-29T12:00:00.000Z')).toBe('BR-036991/JUL/26')
  })

  it('appends the month when the number has no year segment', () => {
    expect(withCertifiedMonth('37112', '2026-07-29T12:00:00.000Z')).toBe('37112/JUL')
  })

  it('returns the number untouched when there is no certified date', () => {
    expect(withCertifiedMonth('BR-036991/26', null)).toBe('BR-036991/26')
  })

  it('returns the number untouched when the date is unparseable', () => {
    expect(withCertifiedMonth('BR-036991/26', 'not-a-date')).toBe('BR-036991/26')
  })
})

describe('formatLabelDate', () => {
  it('formats as DD/Mon/YYYY', () => {
    expect(formatLabelDate('2026-07-29T12:00:00.000Z')).toBe('29/Jul/2026')
  })

  it('returns null for missing or invalid input', () => {
    expect(formatLabelDate(null)).toBeNull()
    expect(formatLabelDate('nope')).toBeNull()
  })
})

describe('formatSleeveQuantity', () => {
  it('formats standard bags', () => {
    expect(formatSleeveQuantity(base)).toBe('333 bags in 60 kg jute bags | 20.0 MT')
  })

  it('formats bulk against the 60kg equivalent', () => {
    expect(formatSleeveQuantity({ ...base, bagType: 'bulk', quantityMt: 21.6, equivalent60kgBags: 360 }))
      .toBe('equiv. 360 bags in 60 kg | 21.6 MT')
  })

  it('derives MT when it is not stored', () => {
    expect(formatSleeveQuantity({ ...base, quantityMt: null }))
      .toBe('333 bags in 60 kg jute bags | 20.0 MT')
  })

  it('returns null when there is nothing to say', () => {
    expect(formatSleeveQuantity({ ...base, bagCount: null, bagWeightKg: null, equivalent60kgBags: null }))
      .toBeNull()
  })
})

describe('toSleeveSampleType', () => {
  it('maps the stored codes case-insensitively', () => {
    expect(toSleeveSampleType('pss')).toBe('PSS')
    expect(toSleeveSampleType('SS')).toBe('SS')
    expect(toSleeveSampleType('type')).toBe('Type Sample')
    expect(toSleeveSampleType('stocklot')).toBe('Stocklot')
  })

  it('defaults to PSS for unknown or missing values', () => {
    expect(toSleeveSampleType(null)).toBe('PSS')
    expect(toSleeveSampleType('mystery')).toBe('PSS')
  })
})

describe('resolveQualityName', () => {
  it('prefers the client custom name', () => {
    expect(resolveQualityName({ custom_name: 'DDQ', template: { name_en: 'Dunkin' } })).toBe('DDQ')
  })

  it('never concatenates the custom name and the template name', () => {
    // This is the "Dunkin - Dunkin" bug the old label printed.
    expect(resolveQualityName({ custom_name: 'Dunkin', template: { name_en: 'Dunkin' } })).toBe('Dunkin')
  })

  it('falls through the template locales', () => {
    expect(resolveQualityName({ custom_name: null, template: { name_en: null, name_pt: 'Duro' } })).toBe('Duro')
  })

  it('uses the fallback when there is no spec at all', () => {
    expect(resolveQualityName(null, 'Type A')).toBe('Type A')
  })

  it('returns null when nothing resolves', () => {
    expect(resolveQualityName(null, null)).toBeNull()
  })
})

describe('buildSleeveLabelFields', () => {
  it('leads with the container number for a shipment sample', () => {
    const f = buildSleeveLabelFields(base)
    expect(f.headline).toBe('HASU 155.201-6')
    expect(f.cert).toBe('BR-036991/JUL/26')
  })

  it('leads with the exporter sample number for a pre-shipment sample', () => {
    const f = buildSleeveLabelFields({
      ...base,
      sampleType: 'PSS',
      containerNr: null,
      exporterSampleNumber: 'CCT-2214/26',
    })
    expect(f.headline).toBe('CCT-2214/26')
  })

  it('appends the reference in parentheses only when present', () => {
    const f = buildSleeveLabelFields({ ...base, sellerName: 'Cocatrel', sellerRef: '34680' })
    expect(f.seller).toBe('Cocatrel (34680)')
    expect(f.client).toBe('OFI (P-8037)')
  })

  it('omits a party entirely when it has no name', () => {
    const f = buildSleeveLabelFields({ ...base, roasterName: null, clientName: '  ' })
    expect(f.roaster).toBeNull()
    expect(f.client).toBeNull()
  })

  it('comma-joins every certificate number, each with its month', () => {
    const f = buildSleeveLabelFields({
      ...base,
      certificateNumbers: ['BR-036991/26', 'BR-036992/26', 'BR-036993/26'],
    })
    expect(f.cert).toBe('BR-036991/JUL/26, BR-036992/JUL/26, BR-036993/JUL/26')
  })

  it('falls back to the certificate number as the headline and drops it from the cert field', () => {
    const f = buildSleeveLabelFields({ ...base, containerNr: null, exporterSampleNumber: null })
    expect(f.headline).toBe('BR-036991/JUL/26')
    expect(f.cert).toBeNull()
  })

  it('keeps the remaining certificate numbers when the first became the headline', () => {
    const f = buildSleeveLabelFields({
      ...base,
      containerNr: null,
      exporterSampleNumber: null,
      certificateNumbers: ['BR-036991/26', 'BR-036992/26'],
    })
    expect(f.headline).toBe('BR-036991/JUL/26')
    expect(f.cert).toBe('BR-036992/JUL/26')
  })

  it('renders Reference pending when nothing at all resolves', () => {
    const f = buildSleeveLabelFields({
      ...base,
      containerNr: null,
      exporterSampleNumber: null,
      certificateNumbers: [],
    })
    expect(f.headline).toBe('Reference pending')
    expect(f.cert).toBeNull()
  })

  it('never leaks the internal reference', () => {
    const f = buildSleeveLabelFields(base)
    expect(JSON.stringify(f)).not.toContain('SAN-')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/sleeve-label-data.test.ts`
Expected: FAIL — `Failed to resolve import "./sleeve-label-data"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/sleeve-label-data.ts`:

```ts
/**
 * Field derivation for the tin sleeve label.
 *
 * The label never shows samples.tracking_number (the internal SAN- lab number).
 * It leads with the counterparty's own identifier — the container number for a
 * shipment sample, the exporter's sample number for a pre-shipment sample — and
 * carries the OFFICIAL certificate number in its own field.
 *
 * Pure: no Supabase, no react-pdf, no ambient clock.
 */

export type SleeveSampleType = 'PSS' | 'SS' | 'Type Sample' | 'Stocklot'

export interface SleeveLabelSource {
  sampleType: SleeveSampleType
  containerNr?: string | null
  exporterSampleNumber?: string | null
  /** Mother certificate first, then each sub-contract's. Raw, without the month. */
  certificateNumbers: string[]
  /** ISO timestamp the certificate was issued (certificates.created_at). */
  certifiedAt?: string | null
  sellerName?: string | null
  sellerRef?: string | null
  clientName?: string | null
  clientRef?: string | null
  roasterName?: string | null
  quality?: string | null
  bagCount?: number | null
  bagWeightKg?: number | null
  bagType?: string | null
  quantityMt?: number | null
  equivalent60kgBags?: number | null
}

export interface SleeveLabelFields {
  headline: string
  seller: string | null
  client: string | null
  cert: string | null
  roaster: string | null
  quality: string | null
  quantity: string | null
  date: string | null
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** "BR-036991/26" + July -> "BR-036991/JUL/26". No year segment -> "37112/JUL". */
export function withCertifiedMonth(certNumber: string, certifiedAt: string | null | undefined): string {
  if (!certNumber) return ''
  if (!certifiedAt) return certNumber
  const d = new Date(certifiedAt)
  if (Number.isNaN(d.getTime())) return certNumber
  const month = MONTHS[d.getMonth()]
  const lastSlash = certNumber.lastIndexOf('/')
  if (lastSlash === -1) return `${certNumber}/${month}`
  return `${certNumber.slice(0, lastSlash)}/${month}${certNumber.slice(lastSlash)}`
}

/** "2026-07-29T12:00:00Z" -> "29/Jul/2026". */
export function formatLabelDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const day = String(d.getDate()).padStart(2, '0')
  const month = d.toLocaleDateString('en-US', { month: 'short' })
  return `${day}/${month}/${d.getFullYear()}`
}

/** "333 bags in 60 kg jute bags | 20.0 MT", or the bulk equivalent form. */
export function formatSleeveQuantity(src: SleeveLabelSource): string | null {
  const { bagCount, bagWeightKg, bagType, quantityMt, equivalent60kgBags } = src

  if (bagType === 'bulk' && equivalent60kgBags) {
    const mt = quantityMt ?? (equivalent60kgBags * 60) / 1000
    return `equiv. ${Math.round(equivalent60kgBags)} bags in 60 kg | ${mt.toFixed(1)} MT`
  }

  if (bagCount != null && bagWeightKg != null) {
    const bagTypeName =
      bagType === 'jute_bag' ? 'jute bags' : bagType === 'pp_bag' ? 'PP bags' : 'bags'
    const mt = quantityMt ?? (bagCount * bagWeightKg) / 1000
    return `${bagCount} bags in ${bagWeightKg} kg ${bagTypeName} | ${mt.toFixed(1)} MT`
  }

  return null
}

const SAMPLE_TYPES: Record<string, SleeveSampleType> = {
  pss: 'PSS',
  ss: 'SS',
  type: 'Type Sample',
  stocklot: 'Stocklot',
}

/** samples.sample_type ("pss", "ss", …) -> the label's display type. */
export function toSleeveSampleType(raw: string | null | undefined): SleeveSampleType {
  return SAMPLE_TYPES[String(raw || '').toLowerCase()] || 'PSS'
}

export interface QualitySpecLike {
  custom_name?: string | null
  template?: {
    name_en?: string | null
    name_pt?: string | null
    name_es?: string | null
  } | null
}

/**
 * The client's custom name OR the template name — never both.
 *
 * The old label printed "{custom_name} - {template_name}", which rendered as
 * "Dunkin - Dunkin" whenever the two matched.
 */
export function resolveQualityName(
  qualitySpec: QualitySpecLike | null | undefined,
  fallback?: string | null,
): string | null {
  const candidates = [
    qualitySpec?.custom_name,
    qualitySpec?.template?.name_en,
    qualitySpec?.template?.name_pt,
    qualitySpec?.template?.name_es,
    fallback,
  ]
  for (const c of candidates) {
    const v = (c || '').trim()
    if (v) return v
  }
  return null
}

/** "Cocatrel (34680)", "OFI", or null when there is no name to print. */
function party(name?: string | null, ref?: string | null): string | null {
  const n = (name || '').trim()
  if (!n) return null
  const r = (ref || '').trim()
  return r ? `${n} (${r})` : n
}

export function buildSleeveLabelFields(src: SleeveLabelSource): SleeveLabelFields {
  const certs = (src.certificateNumbers || [])
    .filter(Boolean)
    .map(c => withCertifiedMonth(c, src.certifiedAt))

  const container = (src.containerNr || '').trim()
  const exporterSample = (src.exporterSampleNumber || '').trim()

  let headline: string
  let certUsedAsHeadline = false

  if (src.sampleType === 'SS' && container) {
    headline = container
  } else if (src.sampleType === 'PSS' && exporterSample) {
    headline = exporterSample
  } else if (container) {
    headline = container
  } else if (exporterSample) {
    headline = exporterSample
  } else if (certs.length > 0) {
    headline = certs[0]
    certUsedAsHeadline = true
  } else {
    headline = 'Reference pending'
  }

  // When the certificate number became the headline, the Cert. field shows only
  // what is left, so no number is printed twice and none is lost.
  const remaining = certUsedAsHeadline ? certs.slice(1) : certs

  return {
    headline,
    seller: party(src.sellerName, src.sellerRef),
    client: party(src.clientName, src.clientRef),
    cert: remaining.length > 0 ? remaining.join(', ') : null,
    roaster: (src.roasterName || '').trim() || null,
    quality: (src.quality || '').trim() || null,
    quantity: formatSleeveQuantity(src),
    date: formatLabelDate(src.certifiedAt),
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/sleeve-label-data.test.ts`
Expected: PASS, 25 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sleeve-label-data.ts src/lib/sleeve-label-data.test.ts
git commit -m "feat(labels): pure field resolvers for the tin sleeve label

Derives the headline from the container number (SS) or exporter sample
number (PSS), never from the internal SAN- reference. Certificate numbers
carry the certified month and comma-join across sub-contracts."
```

---

### Task 2: QR payload becomes a bare URL

The QR currently encodes a multi-line text blob, so phones show text instead of navigating. It becomes a plain URL keyed on the certificate number.

**Files:**
- Modify: `src/lib/qr-code.ts:96-104`
- Test: `src/lib/qr-code.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `getCertificatePageUrl(reference: string): string` — unchanged signature, generalised to accept a certificate number as well as a legacy tracking number. Tasks 4 and 5 call it with a certificate number.

**Deviation from the spec, deliberate:** the spec proposed a new `buildCertificatePageUrl`. Its body would be character-for-character identical to the existing `getCertificatePageUrl`, so this task widens the existing function's contract instead of duplicating it. `buildCertificateQRText` is left untouched — four other routes still call it.

- [ ] **Step 1: Write the failing test**

Create `src/lib/qr-code.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getCertificatePageUrl } from './qr-code'

describe('getCertificatePageUrl', () => {
  it('slugifies a certificate number into the public path', () => {
    expect(getCertificatePageUrl('BR-036991/26')).toMatch(/\/certificate\/BR-036991_26$/)
  })

  it('produces an absolute http(s) url', () => {
    expect(getCertificatePageUrl('BR-036991/26')).toMatch(/^https?:\/\//)
  })

  it('encodes nothing beyond the url', () => {
    expect(getCertificatePageUrl('BR-036991/26')).not.toContain('\n')
  })
})
```

- [ ] **Step 2: Run the test to verify it passes already**

Run: `npx vitest run src/lib/qr-code.test.ts`
Expected: PASS. The function already behaves correctly — this test pins the contract before Task 4 starts depending on it. If it fails, `NEXT_PUBLIC_APP_URL` is set to something without a scheme; fix the env, not the test.

- [ ] **Step 3: Widen the doc comment**

In `src/lib/qr-code.ts`, replace the JSDoc block above `getCertificatePageUrl` (lines 96-100) with:

```ts
/**
 * Public certificate page URL for QR codes on labels/sleeves.
 *
 * Tin sleeves pass the OFFICIAL certificate number (e.g. "BR-036991/26"); the
 * internal SAN- lab number must never reach a printed label or a QR payload.
 * Legacy callers may still pass a tracking number — the public route resolves
 * both.
 *
 * @param reference - certificate number, or a legacy tracking number
 */
```

Then rename the parameter from `trackingNumber` to `reference` in the signature and body.

- [ ] **Step 4: Run the test again**

Run: `npx vitest run src/lib/qr-code.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/qr-code.ts src/lib/qr-code.test.ts
git commit -m "refactor(qr): generalise certificate page url to take a certificate number

Pins the contract with a test before the tin sleeve routes switch their QR
payload from a text blob to this url."
```

---

### Task 3: Rebuild the PDF component

The component becomes a dumb renderer: it receives resolved strings and lays them out. All conditional field logic already happened in Task 1.

**Files:**
- Modify: `src/components/pdf/tin-sleeve-label.tsx` (full rewrite)

**Interfaces:**
- Consumes: `SleeveLabelFields` from Task 1.
- Produces: `TinSleeveLabelData` (= `SleeveLabelFields` plus `qr_code`, `logo_url`, `size`) and `TinSleeveLabelDocument`. Tasks 4 and 5 build arrays of `TinSleeveLabelData`.

**Note on react-pdf:** it has no CSS grid and no `text-overflow`. Columns are fixed-width flex children and truncation uses the `maxLines` prop on `<Text>`. Output will not be pixel-identical to the browser mockup; the mockup is a hierarchy reference.

- [ ] **Step 1: Replace the file wholesale**

Overwrite `src/components/pdf/tin-sleeve-label.tsx`:

```tsx
import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import type { SleeveLabelFields } from '@/lib/sleeve-label-data'

/** 1mm in PDF points. */
const MM = 2.8346

export interface TinSleeveLabelData extends SleeveLabelFields {
  qr_code?: string
  logo_url: string
  size?: '4cm' | '2.5cm'
}

const createStyles = (size: '4cm' | '2.5cm' = '4cm') => {
  const compact = size === '2.5cm'
  const labelHeight = (compact ? 25 : 40) * MM
  const qrSize = (compact ? 18 : 27) * MM
  const logoWidth = (compact ? 22 : 30) * MM
  const headSize = compact ? 9 : 11
  const bodySize = compact ? 5.5 : 6.5

  return StyleSheet.create({
    page: {
      flexDirection: 'column',
      alignItems: 'center',
      backgroundColor: '#FFFFFF',
      padding: 0,
    },
    labelContainer: {
      width: 165 * MM,
      height: labelHeight,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottom: '0.3pt dashed #BBBBBB',
      paddingTop: 3 * MM,
      paddingBottom: 3 * MM,
      paddingLeft: 3 * MM,
      paddingRight: 4 * MM,
    },
    logo: {
      width: logoWidth,
      height: 'auto',
      objectFit: 'contain',
    },
    qrCode: {
      width: qrSize,
      height: qrSize,
      marginLeft: 4 * MM,
    },
    body: {
      flex: 1,
      minWidth: 0,
      marginLeft: 4 * MM,
      flexDirection: 'column',
      justifyContent: 'center',
    },
    headline: {
      fontSize: headSize,
      fontWeight: 'bold',
      color: '#000000',
      marginBottom: 0.8 * MM,
    },
    line: {
      fontSize: bodySize,
      color: '#000000',
      marginBottom: 0.8 * MM,
    },
    key: {
      fontWeight: 'bold',
      color: '#000000',
    },
    muted: {
      color: '#3A3A3A',
    },
    sep: {
      color: '#BDBDBD',
    },
    foot: {
      marginTop: 1.4 * MM,
      paddingTop: 1.2 * MM,
      borderTop: '0.3pt solid #BDBDBD',
      fontSize: bodySize,
      color: '#3A3A3A',
    },
    qual: {
      fontWeight: 'bold',
      color: '#000000',
    },
  })
}

const SEP = '  |  '

interface TinSleeveLabelDocumentProps {
  labels: TinSleeveLabelData[]
}

/**
 * Tin sleeve labels: 165mm x 40mm (or 25mm), 5 per A4 landscape page.
 *
 * Layout follows docs/prompts/sleeve_qr/waqc-sleeve-lines.html — flowing lines
 * rather than cells, so a long exporter name pushes its line along instead of
 * breaking a grid. Fields with no value are omitted entirely.
 *
 * At 2.5cm the Seller/Client pair merges onto the Cert. line to buy vertical
 * room; every other field behaves the same.
 */
export const TinSleeveLabelDocument: React.FC<TinSleeveLabelDocumentProps> = ({ labels }) => {
  const size = labels[0]?.size || '4cm'
  const styles = createStyles(size)
  const compact = size === '2.5cm'

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {labels.map((label, index) => {
          // At 2.5cm everything after the headline shares one line.
          const partyParts = compact
            ? []
            : ([
                label.seller ? { key: 'Seller: ', value: label.seller } : null,
                label.client ? { key: 'Client: ', value: label.client } : null,
              ].filter(Boolean) as Array<{ key: string; value: string }>)

          const certParts = ([
            label.cert ? { key: 'Cert.: ', value: label.cert } : null,
            label.roaster ? { key: 'Roaster: ', value: label.roaster } : null,
            ...(compact
              ? [
                  label.seller ? { key: 'Seller: ', value: label.seller } : null,
                  label.client ? { key: 'Client: ', value: label.client } : null,
                ]
              : []),
          ].filter(Boolean) as Array<{ key: string; value: string }>)

          const footParts = [label.quality, label.quantity, label.date].filter(Boolean) as string[]

          return (
            <View key={index} style={styles.labelContainer}>
              <Image src={label.logo_url} style={styles.logo} />
              {label.qr_code && <Image src={label.qr_code} style={styles.qrCode} />}

              <View style={styles.body}>
                <Text style={styles.headline} maxLines={1}>
                  {label.headline}
                </Text>

                {partyParts.length > 0 && (
                  <Text style={styles.line} maxLines={1}>
                    {partyParts.map((p, i) => (
                      <Text key={p.key}>
                        {i > 0 ? <Text style={styles.sep}>{SEP}</Text> : null}
                        <Text style={styles.key}>{p.key}</Text>
                        <Text>{p.value}</Text>
                      </Text>
                    ))}
                  </Text>
                )}

                {certParts.length > 0 && (
                  <Text style={styles.line} maxLines={2}>
                    {certParts.map((p, i) => (
                      <Text key={p.key}>
                        {i > 0 ? <Text style={styles.sep}>{SEP}</Text> : null}
                        <Text style={styles.key}>{p.key}</Text>
                        <Text>{p.value}</Text>
                      </Text>
                    ))}
                  </Text>
                )}

                {footParts.length > 0 && (
                  <Text style={styles.foot} maxLines={1}>
                    {footParts.map((part, i) => (
                      <Text key={part}>
                        {i > 0 ? <Text style={styles.sep}>{SEP}</Text> : null}
                        <Text style={i === 0 && label.quality ? styles.qual : styles.muted}>
                          {part}
                        </Text>
                      </Text>
                    ))}
                  </Text>
                )}
              </View>
            </View>
          )
        })}
      </Page>
    </Document>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep tin-sleeve-label`
Expected: no output. The two print routes still reference the old `TinSleeveLabelData` shape and will report errors from their own paths — those are fixed in Tasks 4 and 5. Only `tin-sleeve-label.tsx` itself must be clean here.

- [ ] **Step 3: Commit**

```bash
git add src/components/pdf/tin-sleeve-label.tsx
git commit -m "feat(labels): rebuild tin sleeve label as flowing lines

165mm x 40mm, 5 per A4 landscape, wordmark/QR/body columns. Renders
resolved strings only; empty fields disappear rather than printing a
bare label. 2.5cm merges Seller/Client onto the Cert. line."
```

---

### Task 4: Rewire the bulk print route

**Files:**
- Modify: `src/app/api/samples/bulk/print-tin-sleeves/route.tsx` (rewrite the body of `POST`, keep the auth and PDF-streaming top and tail)

**Interfaces:**
- Consumes: `buildSleeveLabelFields`, `toSleeveSampleType`, `resolveQualityName` (Task 1); `getCertificatePageUrl` (Task 2); `TinSleeveLabelData`, `TinSleeveLabelDocument` (Task 3).
- Produces: response header `X-Skipped-Samples` carrying the count of selected-but-uncertified samples. Task 6 reads it.

- [ ] **Step 1: Replace the imports**

At the top of the file, replace the `@/lib/qr-code` import line with:

```tsx
import { generateQRCode, getCertificatePageUrl } from '@/lib/qr-code'
import {
  buildSleeveLabelFields,
  toSleeveSampleType,
  resolveQualityName,
} from '@/lib/sleeve-label-data'
```

`fetchCertificateQRData` and `buildCertificateQRText` are no longer used here.

- [ ] **Step 2: Replace the sample query**

Replace the `.select(...)` block (currently lines 40-62) with:

```tsx
      .select(`
        id,
        sample_type,
        workflow_stage,
        container_nr,
        exporter_sample_number,
        buyer_contract_nr,
        exporter_contract_nr,
        bag_type,
        bag_count,
        bag_weight_kg,
        bags_quantity_mt,
        equivalent_60kg_bags,
        quality_name,
        exporter:companies!samples_exporter_id_fkey(name),
        seller:companies!samples_seller_id_fkey(name),
        client:companies!samples_client_id_fkey(name),
        roaster:companies!samples_roaster_id_fkey(name),
        quality_spec:client_qualities(
          custom_name,
          template:quality_templates(name_en, name_pt, name_es)
        )
      `)
```

`tracking_number` is deliberately absent — nothing on this label may derive from it.

- [ ] **Step 3: Gate on certification, immediately after the "No samples found" guard**

```tsx
    // The label prints the OFFICIAL certificate number, which is only minted at
    // certification. Anything earlier has no number to print.
    const PRINTABLE_STAGES = ['certified', 'rejected']
    const printable = (samples as any[]).filter(s => PRINTABLE_STAGES.includes(s.workflow_stage))
    const skipped = samples.length - printable.length

    if (printable.length === 0) {
      return NextResponse.json({
        error: 'No certified samples selected. Tin labels carry the certificate number, which is issued at certification.',
      }, { status: 400 })
    }
```

- [ ] **Step 4: Fetch certificates, replacing the sub-contract block**

Replace the existing `sample_contracts` fetch and its grouping (currently lines 90-106) with:

```tsx
    const printableIds = printable.map(s => s.id)

    // One label per mother sample; every certificate belonging to it (mother
    // first, then each sub-contract's) is comma-joined into the Cert. field.
    const { data: certRows } = await supabase
      .from('certificates')
      .select('sample_id, sample_contract_id, certificate_number, created_at')
      .in('sample_id', printableIds)
      .not('certificate_number', 'is', null)
      .order('created_at', { ascending: true })

    const certsBySample: Record<string, { numbers: string[]; certifiedAt: string | null }> = {}
    for (const row of (certRows || []) as Array<{
      sample_id: string
      sample_contract_id: string | null
      certificate_number: string
      created_at: string
    }>) {
      const entry = certsBySample[row.sample_id] || { numbers: [], certifiedAt: null }
      // Mother certificate leads and sets the certified date.
      if (row.sample_contract_id === null) {
        entry.numbers.unshift(row.certificate_number)
        entry.certifiedAt = row.created_at
      } else {
        entry.numbers.push(row.certificate_number)
        if (!entry.certifiedAt) entry.certifiedAt = row.created_at
      }
      certsBySample[row.sample_id] = entry
    }
```

- [ ] **Step 5: Replace the per-sample mapping**

Replace everything from `const labelsWithQR: TinSleeveLabelData[] = await Promise.all(` down to the closing `)` of that `Promise.all` (currently lines 117-218) with:

Also delete the `bagTypeMap` declaration above it (currently lines 109-114) and the
`packaging` variable it fed. Packaging is now part of the quantity string that
`formatSleeveQuantity` builds, so nothing reads either one.

```tsx
    const labelsWithQR: TinSleeveLabelData[] = await Promise.all(
      printable.map(async (sample: any) => {
        const certs = certsBySample[sample.id] || { numbers: [], certifiedAt: null }

        const fields = buildSleeveLabelFields({
          sampleType: toSleeveSampleType(sample.sample_type),
          containerNr: sample.container_nr,
          exporterSampleNumber: sample.exporter_sample_number,
          certificateNumbers: certs.numbers,
          certifiedAt: certs.certifiedAt,
          sellerName: sample.seller?.name || sample.exporter?.name || null,
          sellerRef: sample.exporter_contract_nr,
          clientName: sample.client?.name || null,
          clientRef: sample.buyer_contract_nr,
          roasterName: sample.roaster?.name || null,
          quality: resolveQualityName(sample.quality_spec, sample.quality_name),
          bagCount: sample.bag_count,
          bagWeightKg: sample.bag_weight_kg,
          bagType: sample.bag_type,
          quantityMt: sample.bags_quantity_mt,
          equivalent60kgBags: sample.equivalent_60kg_bags,
        })

        // URL only. The old multi-line text payload made phones show text
        // instead of opening the page, and pushed QR density past what a 27mm
        // print scans reliably.
        const qrCode = certs.numbers[0]
          ? await generateQRCode(getCertificatePageUrl(certs.numbers[0]), { width: 400, margin: 1 })
          : undefined

        return { ...fields, qr_code: qrCode, logo_url: logoBase64, size: size as '4cm' | '2.5cm' }
      })
    )
```

Delete the now-unused `bagTypeMap` declaration and the `bagTypeMapRemoved` line above (it is only there to mark the spot).

- [ ] **Step 6: Report skipped samples on the response**

In the `return new NextResponse(buffer, {...})` headers object, add:

```tsx
        'X-Skipped-Samples': String(skipped),
```

- [ ] **Step 7: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "bulk/print-tin-sleeves"`
Expected: no output.

- [ ] **Step 8: Verify by hand**

Start the dev server (`npm run dev`), open `/samples/qc`, select two certified samples plus one uncertified, and use Tin Label → 4cm. Confirm the PDF contains two labels, that neither shows a `SAN-` string, and that scanning a QR with a phone opens the certificate page rather than showing text.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/samples/bulk/print-tin-sleeves/route.tsx
git commit -m "feat(labels): bulk tin sleeves print from certificate data

Gates on certified/rejected since the label carries the certificate
number. Comma-joins sub-contract certificates onto one mother label and
switches the QR payload to a bare certificate-page url."
```

---

### Task 5: Rewire the single-sample print route

Same transformation, one sample, no skip counting.

**Files:**
- Modify: `src/app/api/samples/[id]/print-tin-sleeve/route.tsx`

**Interfaces:**
- Consumes: same as Task 4.
- Produces: nothing new.

- [ ] **Step 1: Replace the imports**

```tsx
import { generateQRCode, getCertificatePageUrl } from '@/lib/qr-code'
import {
  buildSleeveLabelFields,
  toSleeveSampleType,
  resolveQualityName,
} from '@/lib/sleeve-label-data'
```

- [ ] **Step 2: Replace the sample query select block**

Use the identical `.select(...)` string from Task 4 Step 2. Keep `.eq('id', id).single()`.

- [ ] **Step 3: Gate, right after the "Sample not found" guard**

```tsx
    const PRINTABLE_STAGES = ['certified', 'rejected']
    if (!PRINTABLE_STAGES.includes((sample as any).workflow_stage)) {
      return NextResponse.json({
        error: 'This sample is not certified yet. Tin labels carry the certificate number, which is issued at certification.',
      }, { status: 400 })
    }
```

- [ ] **Step 4: Fetch this sample's certificates**

```tsx
    const { data: certRows } = await supabase
      .from('certificates')
      .select('sample_contract_id, certificate_number, created_at')
      .eq('sample_id', (sample as any).id)
      .not('certificate_number', 'is', null)
      .order('created_at', { ascending: true })

    const rows = (certRows || []) as Array<{
      sample_contract_id: string | null
      certificate_number: string
      created_at: string
    }>
    const mother = rows.find(r => r.sample_contract_id === null)
    const certNumbers = [
      ...(mother ? [mother.certificate_number] : []),
      ...rows.filter(r => r.sample_contract_id !== null).map(r => r.certificate_number),
    ]
    const certifiedAt = mother?.created_at || rows[0]?.created_at || null
```

- [ ] **Step 5: Replace the field derivation and QR generation**

Delete the existing quality/packaging/bagsDisplay/contracts blocks and the `fetchCertificateQRData` + `buildCertificateQRText` pair, replacing all of it with:

```tsx
    const s = sample as any

    const fields = buildSleeveLabelFields({
      sampleType: toSleeveSampleType(s.sample_type),
      containerNr: s.container_nr,
      exporterSampleNumber: s.exporter_sample_number,
      certificateNumbers: certNumbers,
      certifiedAt,
      sellerName: s.seller?.name || s.exporter?.name || null,
      sellerRef: s.exporter_contract_nr,
      clientName: s.client?.name || null,
      clientRef: s.buyer_contract_nr,
      roasterName: s.roaster?.name || null,
      quality: resolveQualityName(s.quality_spec, s.quality_name),
      bagCount: s.bag_count,
      bagWeightKg: s.bag_weight_kg,
      bagType: s.bag_type,
      quantityMt: s.bags_quantity_mt,
      equivalent60kgBags: s.equivalent_60kg_bags,
    })

    const qrCode = certNumbers[0]
      ? await generateQRCode(getCertificatePageUrl(certNumbers[0]), { width: 400, margin: 1 })
      : undefined
```

Then build the single-element array the document expects:

```tsx
    const labels: TinSleeveLabelData[] = [
      { ...fields, qr_code: qrCode, logo_url: logoBase64 },
    ]
```

This route has no size parameter — it never had one. Omitting `size` makes the
component fall back to `'4cm'`, which is what this route already produced. Keep
the PDF-streaming code below this point untouched.

- [ ] **Step 5b: Drop the hide_exporter special case**

This route previously replaced the exporter name with `'-'` when `hide_exporter_on_label` was set. The new label omits absent fields entirely, so pass `null` instead of `'-'`: wrap the seller name as

```tsx
      sellerName: s.hide_exporter_on_label ? null : (s.seller?.name || s.exporter?.name || null),
```

and add `hide_exporter_on_label` back into the `.select(...)` list for this route only.

- [ ] **Step 6: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "print-tin-sleeve"`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add "src/app/api/samples/[id]/print-tin-sleeve/route.tsx"
git commit -m "feat(labels): single tin sleeve route matches the bulk route

Same certification gate, same certificate-derived fields, same url-only
QR payload. hide_exporter_on_label now omits the seller field rather than
printing a dash."
```

---

### Task 6: Gate the Tin Label action in the UI

Three menu entries call `handleBulkPrintTinSleeves`. All three get disabled when the selection holds nothing certified, and the dialog reports anything skipped.

**Files:**
- Modify: `src/app/samples/qc/page.tsx:1164`, `:1735`, `:2037`
- Modify: `src/components/samples/tin-label-size-dialog.tsx:36-70`

**Interfaces:**
- Consumes: `hasCertifiedSelected` (already defined at `src/app/samples/qc/page.tsx:1098`), `X-Skipped-Samples` (Task 4).
- Produces: nothing.

- [ ] **Step 1: Disable the three menu entries**

For the `DropdownMenuItem` at line ~1164 and the two `ContextMenuItem`s at ~1735 and ~2037, add `disabled` and a title. The dropdown one becomes:

```tsx
                  <DropdownMenuItem
                    onClick={handleBulkPrintTinSleeves}
                    disabled={!hasCertifiedSelected}
                    title={hasCertifiedSelected ? undefined : 'Tin labels carry the certificate number, issued at certification'}
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Tin Label
                  </DropdownMenuItem>
```

Apply the same two props to each `ContextMenuItem`, keeping their existing `ContextMenuItem` tag names.

- [ ] **Step 2: Report skipped samples in the dialog**

In `src/components/samples/tin-label-size-dialog.tsx`, immediately after `const blob = await response.blob()`, insert:

```tsx
      const skipped = Number(response.headers.get('X-Skipped-Samples') || '0')
      if (skipped > 0) {
        toast.warning(
          `${skipped} sample${skipped === 1 ? '' : 's'} skipped — not certified yet, so there is no certificate number to print.`
        )
      }
```

`toast` is already imported in this file.

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "qc/page|tin-label-size-dialog"`
Expected: no output.

- [ ] **Step 4: Verify by hand**

With the dev server running, open `/samples/qc`. Select only uncertified samples — all three Tin Label entries must be disabled. Select a mix — the action runs and a warning toast names the skipped count.

- [ ] **Step 5: Run the whole suite**

Run: `npx vitest run`
Expected: PASS. No existing test touches the tin sleeve path, so nothing should have moved.

- [ ] **Step 6: Commit**

```bash
git add src/app/samples/qc/page.tsx src/components/samples/tin-label-size-dialog.tsx
git commit -m "feat(labels): gate the Tin Label action on certification

All three menu entries disable when nothing certified is selected, and the
size dialog reports how many samples a bulk run skipped."
```

---

## Manual verification before shipping

Automated tests cover field derivation; the printed artefact needs eyes.

- [ ] Print a 4cm sheet of 5 and confirm 5 labels land on one A4 landscape page with none clipped at the foot.
- [ ] Cut one and wrap it on a real tin — confirm the QR sits on the visible face.
- [ ] Scan with an iPhone camera: it must offer the certificate page as a link, not show a wall of text.
- [ ] Print a 2.5cm sheet and confirm the merged Seller/Client/Cert. line is still legible. If it is not, the fallback agreed in the spec is to drop the 2.5cm option entirely.
- [ ] Print a sample with sub-contracts and confirm every certificate number appears, wrapping to a second line rather than truncating.
- [ ] Print a PSS (no roaster, no container) and confirm the `Roaster:` field is absent rather than blank, and the headline is the exporter sample number.
- [ ] Grep the generated PDF text for `SAN-` and confirm zero hits.

## Follow-on

Part 2 of the spec — the mobile certificate page and the structured compliance refactor — is a separate plan. It depends on nothing in this one except the QR now pointing at a URL, so it can start as soon as Task 4 lands.
