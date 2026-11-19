// src/lib/approval-notification/types.ts
export type ApprovalDecision = 'approved' | 'rejected'
export type ApprovalSide = 'seller' | 'buyer'

/** The parties a certificate can be sent to. 'buyer' is the QC client and stays
 *  the stored side name, so existing send history keeps reading correctly.
 *  'shipper' is the sample's exporter where that is not the seller; it is never
 *  owed a certificate, only sent one when chosen. */
export type CertificateParty = 'buyer' | 'importer' | 'roaster' | 'seller' | 'shipper'
export const ALL_PARTIES: CertificateParty[] = ['buyer', 'importer', 'roaster', 'seller', 'shipper']
/** The parties a certificate can be owed to, and the ones a send starts with. */
export const OWED_PARTIES: CertificateParty[] = ['buyer', 'importer', 'roaster', 'seller']

export interface RecipientChip {
  email: string
  name: string | null
  nickname: string | null
  isGroupMailbox: boolean
}

export interface PanelPrefill {
  greeting: string
  to: RecipientChip[]
  cc: RecipientChip[]
}

export interface ApprovalSampleFields {
  /** What names the sample to a person: its certificate number, else its own
   *  identifier (container / ICO / exporter sample number). Never the internal
   *  SAN- lab number; null when the sample carries none of them. */
  sampleReference: string | null
  sampleType: string
  status: ApprovalDecision
  contractNumber: string | null
  sampleCode: string | null
  awb: string | null
  courier: string | null
  sellerReference: string | null
  buyerReference: string | null
  comments: string | null
  /** Rejected PSS rows on the contract incl. this one (0749 mirror); null when N/A. */
  rejectionOrdinal: number | null
}

export interface ApprovalPrefill {
  sample: ApprovalSampleFields
  panels: { seller: PanelPrefill; buyer: PanelPrefill }
  certificateAvailable: boolean
  sellerId: string | null
  buyerId: string | null
}
