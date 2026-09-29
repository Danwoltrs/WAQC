// src/lib/contract-crop.ts
//
// A sys contract's crop as the intake's crop-year option ("26/27"). Sys
// writes "26/27" today; older contracts carry "current", "new" or a year
// ("2026"), and some none at all. Pure.

/** "26/27" for the crop that started in September of `startYear`. */
const cropLabel = (startYear: number) => `${String(startYear).slice(-2)}/${String(startYear + 1).slice(-2)}`

/** Year and month (1..12) of a "YYYY-MM..." date, or null. */
function yearMonth(date: string | null | undefined): { y: number; m: number } | null {
  const match = /^(\d{4})-(\d{2})/.exec(date ?? '')
  return match ? { y: Number(match[1]), m: Number(match[2]) } : null
}

/**
 * The crop a shipment month belongs to, by the sys rule: September to May
 * ship the crop that started that September; June to August straddle the
 * changeover and are the seller's choice, so they name no single crop.
 */
export function cropForShipmentMonth(date: string | null | undefined): string | null {
  const ym = yearMonth(date)
  if (!ym) return null
  if (ym.m >= 9) return cropLabel(ym.y)
  if (ym.m <= 5) return cropLabel(ym.y - 1)
  return null
}

/**
 * The crop year to prefill from a contract. The contract's own value wins:
 * "26/27" as is, "2026/27" or "2026" as "26/27", and "current" / "new" as
 * the crop running at the contract date and the one after it. Other text
 * (a seller's choice, a blend) is kept as written; the crop dropdown lists
 * a held value it does not know. Without a crop, the shipment month's crop.
 */
export function contractCropYear(
  crop: string | null | undefined,
  { shipmentMonth, contractDate }: { shipmentMonth?: string | null; contractDate?: string | null } = {},
): string | null {
  const raw = crop?.trim()
  if (!raw) return cropForShipmentMonth(shipmentMonth)

  const short = /^(\d{2})\s*[/-]\s*(\d{2})$/.exec(raw)
  if (short) return `${short[1]}/${short[2]}`
  const long = /^(\d{4})\s*[/-]\s*(\d{2}|\d{4})$/.exec(raw)
  if (long) return cropLabel(Number(long[1]))
  const year = /^(\d{4})$/.exec(raw)
  if (year) return cropLabel(Number(year[1]))

  const word = raw.toLowerCase()
  if (word === 'current' || word === 'new') {
    const ym = yearMonth(contractDate) ?? yearMonth(shipmentMonth)
    if (!ym) return null
    // The crop still being shipped: from September the one that started
    // then, before it the one that started the September before.
    const current = ym.m >= 9 ? ym.y : ym.y - 1
    return cropLabel(word === 'current' ? current : current + 1)
  }
  return raw
}
