import type { ContractContext } from './contract-resolver'

/** The counterparty columns a `samples` row carries on its own. */
export interface SampleCounterparties {
  client_id: string | null
  importer_id: string | null
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
    buyerReference: filled(contract?.buyerReference) ?? filled(sample.buyer_contract_nr),
    sellerReference: filled(contract?.sellerReference) ?? filled(sample.seller_contract_nr),
    contractNumber: filled(contract?.contractNumber) ?? filled(sample.wolthers_contract_nr),
  }
}
