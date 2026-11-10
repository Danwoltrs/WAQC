import type { ContractContext } from './contract-resolver'
import type { RequiredParties } from './batch-send'
import { ALL_PARTIES, type CertificateParty } from './types'

/** The counterparty columns a `samples` row carries on its own. */
export interface SampleCounterparties {
  client_id: string | null
  importer_id: string | null
  roaster_id: string | null
  seller_id: string | null
  exporter_id: string | null
  wolthers_contract_nr: string | null
  buyer_contract_nr: string | null
  seller_contract_nr: string | null
}

/** Who a certificate's emails go to, and the sys contract they file against. */
export interface CertificateParties {
  /** Null when the sample links no sys contract: the email still goes out, but
   *  nothing is annexed to a contract or written back to sys. */
  contractId: string | null
  buyerId: string | null
  sellerId: string | null
  importerId: string | null
  roasterId: string | null
  buyerReference: string | null
  sellerReference: string | null
  contractNumber: string | null
}

const filled = (value: string | null | undefined): string | null =>
  value && value.trim() ? value : null

/**
 * The buyer and seller of a certificate.
 *
 * A resolved sys contract decides, field by field. Where it is silent — or there
 * is no contract at all — the sample's own row answers: the QC client is the
 * buyer (the certificate is issued for them) and the seller is the seller.
 *
 * Prod 2026-09-14: 355 of 874 recent certificates — every Dunkin lot, and SS
 * lots registered without a Wolthers contract — resolved no contract, so no send
 * surface knew who to email and none of them could be sent. On the certificates
 * that do resolve one, the contract buyer is the sample's QC client (519/519)
 * and the contract seller its seller (512/519), so the fallback agrees with the
 * contract wherever both exist.
 */
export function resolveCertificateParties(
  sample: SampleCounterparties,
  contract: ContractContext | null,
): CertificateParties {
  return {
    contractId: contract?.contractId ?? null,
    buyerId: contract?.buyerId ?? sample.client_id ?? sample.importer_id ?? null,
    sellerId: contract?.sellerId ?? sample.seller_id ?? sample.exporter_id ?? null,
    importerId: sample.importer_id ?? null,
    roasterId: sample.roaster_id ?? null,
    buyerReference: filled(contract?.buyerReference) ?? filled(sample.buyer_contract_nr),
    sellerReference: filled(contract?.sellerReference) ?? filled(sample.seller_contract_nr),
    contractNumber: filled(contract?.contractNumber) ?? filled(sample.wolthers_contract_nr),
  }
}

/** Importers and roasters are owed a certificate only for certificates issued on
 *  or after this date (UTC date of `issued_at`); earlier ones were never sent to them. */
export const PARTY_SEND_GO_LIVE = '2026-11-10'

/** True when the certificate predates the importer/roaster sends. Null counts as before.
 *  Supabase returns timestamps in UTC (`+00:00`), so the first ten characters are the UTC date. */
export function isBeforePartyGoLive(issuedAt: string | null): boolean {
  if (!issuedAt) return true
  return issuedAt.slice(0, 10) < PARTY_SEND_GO_LIVE
}

/**
 * The companies a certificate goes to, one entry per distinct company among the
 * buyer-side roles (client, then importer, then roaster: the first role wins).
 * The seller is never deduped: a company that is both client and seller gets both.
 */
export function certificatePartyCompanies(
  p: CertificateParties,
): Array<{ party: CertificateParty; companyId: string }> {
  const out: Array<{ party: CertificateParty; companyId: string }> = []
  const seen = new Set<string>()
  const buyerSide: Array<[CertificateParty, string | null]> = [
    ['buyer', p.buyerId],
    ['importer', p.importerId],
    ['roaster', p.roasterId],
  ]
  for (const [party, companyId] of buyerSide) {
    if (!companyId || seen.has(companyId)) continue
    seen.add(companyId)
    out.push({ party, companyId })
  }
  if (p.sellerId) out.push({ party: 'seller', companyId: p.sellerId })
  return out
}

/** Which parties are owed this certificate. Importer and roaster only from go-live. */
export function requiredParties(p: CertificateParties, issuedAt: string | null): RequiredParties {
  const roles = new Set(certificatePartyCompanies(p).map((c) => c.party))
  const live = !isBeforePartyGoLive(issuedAt)
  return {
    buyer: roles.has('buyer'),
    seller: roles.has('seller'),
    importer: live && roles.has('importer'),
    roaster: live && roles.has('roaster'),
  }
}

/** Only the seller reads the seller version of the certificate. */
export function audienceOf(party: CertificateParty): 'buyer' | 'seller' {
  return party === 'seller' ? 'seller' : 'buyer'
}

/** Parses a `parties` query param. Null means all (undefined); the client is always included. */
export function parseChosenParties(param: string | null): Set<CertificateParty> | undefined {
  if (param === null) return undefined
  const chosen = new Set<CertificateParty>(['buyer'])
  for (const name of param.split(',')) {
    const n = name.trim() as CertificateParty
    if (ALL_PARTIES.includes(n)) chosen.add(n)
  }
  return chosen
}

/** One party in the Send dropdown: who it is and the companies holding that role on the chosen certificates. */
export interface PartyOption {
  party: CertificateParty
  companies: Array<{ id: string; name: string }>
}

/** Supply-chain order for display: seller, importer, roaster, client. */
export const PARTY_CHAIN_ORDER: CertificateParty[] = ['seller', 'importer', 'roaster', 'buyer']

/**
 * The parties present on a set of certificates, in supply-chain order, each with
 * its distinct companies sorted by name. Parties nobody holds are left out.
 */
export function summarizeParties(
  certs: CertificateParties[],
  nameOf: (companyId: string) => string,
): PartyOption[] {
  const byParty = new Map<CertificateParty, Set<string>>()
  for (const cert of certs) {
    for (const { party, companyId } of certificatePartyCompanies(cert)) {
      const ids = byParty.get(party) ?? new Set<string>()
      ids.add(companyId)
      byParty.set(party, ids)
    }
  }
  const out: PartyOption[] = []
  for (const party of PARTY_CHAIN_ORDER) {
    const ids = byParty.get(party)
    if (!ids || ids.size === 0) continue
    const companies = [...ids].map((id) => ({ id, name: nameOf(id) })).sort((a, b) => a.name.localeCompare(b.name))
    out.push({ party, companies })
  }
  return out
}
