export type CommandScope = 'samples' | 'certificates' | 'global'

export interface SampleHit {
  id: string
  tracking_number: string | null
  wolthers_contract_nr: string | null
  origin: string | null
  status: string | null
}

export interface CertHit {
  id: string
  certificate_number: string | null
  sample_id: string | null
  origin: string | null
  status: string | null
  sample?: { tracking_number: string | null } | null
}

export interface ContractHit {
  id: string
  contract_number: string | null
  seller_reference: string | null
  buyer_reference: string | null
  sample_count?: number
}

export interface NavTarget {
  label: string
  href: string
  keywords?: string
}
