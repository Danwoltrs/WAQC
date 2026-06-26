// src/lib/approval-notification/types.ts
export type ApprovalDecision = 'approved' | 'rejected'
export type ApprovalSide = 'seller' | 'buyer'

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
  trackingNumber: string
  sampleType: string
  status: ApprovalDecision
  contractNumber: string | null
  sampleCode: string | null
  awb: string | null
  courier: string | null
  sellerReference: string | null
  buyerReference: string | null
  comments: string | null
}

export interface ApprovalPrefill {
  sample: ApprovalSampleFields
  panels: { seller: PanelPrefill; buyer: PanelPrefill }
  certificateAvailable: boolean
  sellerId: string | null
  buyerId: string | null
}
