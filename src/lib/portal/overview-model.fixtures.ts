import type { PathRow } from './overview-model'

// Seller, importer, roaster, PSS total, PSS approved, SS total, SS approved.
// Brazil/Santos paths from docs/superpowers/specs/prototypes/client-portal/overview-v5.js,
// split into PSS (163, 114 approved) and SS (401, 345 approved).
const BRAZIL: [string, string, string, number, number, number, number][] = [
  ['COCATREL', 'Coffee America', 'Not recorded', 28, 6, 74, 70],
  ['OFI', 'OFI', 'Mother Parkers', 25, 25, 60, 57],
  ['Cooxupé', 'Coffee America', 'Not recorded', 20, 8, 50, 46],
  ['OFI', 'OFI', 'Qusac', 17, 13, 42, 38],
  ['Cooxupé', 'Hamburg Coffee', 'Not recorded', 9, 9, 21, 17],
  ['Brascof', 'Hamburg Coffee', 'Not recorded', 7, 4, 17, 13],
  ['OFI', 'OFI', 'National DCP', 7, 7, 16, 13],
  ['OFI', 'OFI', 'Not recorded', 7, 7, 16, 15],
  ['Sucden Brasil', 'Coffee America', 'Not recorded', 6, 3, 16, 10],
  ['Cooxupé', 'Sucafina', 'Reily foods', 7, 3, 17, 11],
  ['OFI', 'OFI', 'MZB', 5, 5, 14, 13],
  ['OFI', 'OFI', 'Reily foods', 5, 4, 11, 8],
  ['OFI', 'OFI', 'S & D / Westrock', 3, 3, 8, 7],
  ['CDN', 'Hamburg Coffee', 'Not recorded', 3, 3, 8, 3],
  ['Timbro', 'Coffee America', 'Not recorded', 3, 3, 6, 4],
  ['COCATREL', 'Hamburg Coffee', 'Not recorded', 2, 2, 6, 6],
  ['OFI', 'OFI', 'Segafredo', 1, 1, 4, 3],
  ['Cooxupé', 'OLH', 'Not recorded', 2, 2, 4, 4],
  ['Cooxupé', 'Rothfos Corp.', 'Not recorded', 1, 1, 2, 1],
  ['Cafebras', 'Coffee America', 'Not recorded', 1, 1, 2, 2],
  ['OFI', 'OFI', 'Coffein', 1, 1, 2, 1],
  ['Grano', 'Volcafe NA', 'Mother Parkers', 1, 1, 2, 2],
  ['Cooxupé', 'Ecom', 'Mother Parkers', 1, 1, 1, 1],
  ['StoneX', 'Rothfos Corp.', 'Mother Parkers', 1, 1, 1, 0],
  ['COCAPEC', 'Rothfos Corp.', 'Not recorded', 0, 0, 1, 0],
]

/** Each SS certificate weighs 10 MT in these fixtures. */
export const MT_PER_SS = 10

export const DUNKIN: PathRow[] = BRAZIL.flatMap(([seller, importer, roaster, pn, pk, sn, sk]) => {
  const base = { origin: 'Brazil', lab: 'Santos lab', seller, importer, roaster, quality: 'Dunkin' }
  const out: PathRow[] = []
  if (pn > 0) out.push({ ...base, type: 'pss', certificates: pn, approved: pk, mt: 0 })
  if (sn > 0) out.push({ ...base, type: 'ss', certificates: sn, approved: sk, mt: sn * MT_PER_SS })
  return out
})

// Seven sellers into importer Ahold, roaster Not recorded (certificates, approved).
const AHOLD_SELLERS: [string, number, number][] = [
  ['Comexim EU', 51, 51], ['LDC Suisse', 20, 18], ['Ecom', 64, 52], ['Volcafe CH', 57, 46],
  ['Rothfos GmbH', 87, 68], ['Douqué', 4, 4], ['Olam Singapore', 2, 2],
]
export const AHOLD: PathRow[] = AHOLD_SELLERS.map(([seller, certificates, approved]) => ({
  origin: 'Brazil', lab: 'Santos lab', seller, importer: 'Ahold', roaster: 'Not recorded',
  quality: 'Ahold', type: 'ss', certificates, approved, mt: certificates * MT_PER_SS,
}))

export const COLOMBIA: PathRow = {
  origin: 'Colombia', lab: 'Buenaventura lab', seller: 'Andes Export', importer: 'Coffee America',
  roaster: 'Not recorded', quality: 'Dunkin', type: 'ss', certificates: 70, approved: 62, mt: 700,
}
export const MULTI: PathRow[] = [...DUNKIN, COLOMBIA]
