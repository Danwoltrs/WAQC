import { Database } from '@/lib/supabase'
import type { QualityMatch } from '@/lib/quality-matching'

export type SampleInsert = Database['public']['Tables']['samples']['Insert']
export type Laboratory = Database['public']['Tables']['laboratories']['Row']

// Post-consolidation: the clients/exporters/importers/roasters tables were
// dropped in favour of the canonical companies table. The intake form's
// counterparty pickers consume API-shaped objects (mapped via the legacy
// "clients"-shape contract in src/lib/qc-client-mapper.ts and the
// /api/exporters|importers|roasters wrappers), so we keep these as loose
// record shapes here rather than dragging the form through a schema rewrite.
export type Client = Record<string, any>
export type Exporter = Record<string, any>
export type Importer = Record<string, any>
export type Roaster = Record<string, any>

export type SampleCategory = 'qc' | 'other'
export type OtherSampleSubType = 'pss' | 'ss' | 'type' | 'stocklot'

export interface OtherSampleRecipient {
  client_id: string
  client_name: string
  contact_emails: string[]
}

export interface SelectedContract {
  id: string
  contract_number: string
  seller_name: string | null
  buyer_name: string | null
  shipper_name: string | null
  end_buyer_name: string | null
  crop: string | null
  volume_bags: number | null
  bag_type: string | null
  shipment_period_start: string | null
  quality_description: string | null
}

export interface FormData {
  // Category discriminator — 'qc' = Wolthers approves (existing flow);
  // 'other' = forwarded to recipient clients for their approval.
  sample_category: SampleCategory

  // Other Samples fields (only meaningful when sample_category === 'other')
  awb_number: string
  courier_name: string
  is_quick_look: boolean
  recipients: OtherSampleRecipient[]

  // Step 1: Supply Chain (Buyer/Seller)
  seller: string // The trading company that sold the coffee (e.g., Louis Dreyfus)
  seller_contract_nr: string // Seller's contract reference number
  exporter_sample_number: string // Seller/exporter's sample identification number (shown in Step 1)
  same_seller_shipper: boolean // If true, seller is same as shipper (checkbox)
  shipper: string // The actual exporter that shipped the coffee (e.g., COOXUPE)
  shipper_contract_nr: string // Shipper's contract reference number
  importer: string // The importing company
  importer_contract_nr: string // Importer's contract reference number
  importer_is_qc_client: boolean // If true, importer is also the QC client (checkbox)
  qc_client: string // Separate QC client name (when importer_is_qc_client is false)
  qc_client_contract_nr: string // QC Client's contract reference number
  supplier: string // Optional supplier name (farm/cooperative)
  supplier_contract_nr: string // Supplier's contract reference number
  roaster: string // Optional roaster
  roaster_contract_nr: string // Roaster's contract reference number
  end_client: string // Optional end client (final buyer, e.g., Dunkin')
  end_client_contract_nr: string // End Client's contract reference number

  // Step 2: Quality
  client_id: string // The QC client (resolved from importer or qc_client)
  laboratory_id: string
  origin: string
  micro_origin: string
  processing_method: string
  sample_type: 'pss' | 'ss' | 'type' | 'stocklot' | ''
  linked_pss_sample_id: string
  linked_pss_sample_contract_id: string
  quality_spec_id: string
  quality_name: string
  hide_exporter_on_label: boolean
  certifications: string[] // Multiple certifications (Rainforest Alliance, Fair Trade, etc.)
  crop_year: string // e.g. "25/26"

  // Legacy/Other contract numbers (kept for backwards compatibility)
  wolthers_contract_nr: string
  exporter_contract_nr: string
  ico_number: string
  container_nr: string

  // Step 3: Quantity (Weight)
  bag_count: string
  bag_weight_kg: string
  bag_type: 'jute_bag' | 'pp_bag' | 'big_bag' | 'bulk' | ''
  bags_quantity_mt: string // Auto-calculated
  equivalent_60kg_bags: string // Auto-calculated
  bulk_container_count: string // Auto-calculated for bulk type
  shipment_month: string // YYYY-MM format

  // Step 4: Sample Details (Review)
  arrival_date: string
  notes: string
  photo_file: File | null

  // Sub-contracts
  contracts: SubContractFormData[]

  // Contract Search (Step 1)
  selected_contract: SelectedContract | null
  contract_prefilled_fields: (keyof FormData)[]  // keys prefilled from contract; cleared per-key on user edit
  contract_resolution: {
    seller_match_count: number
    shipper_match_count: number
    multiple_seller_matches: boolean
    multiple_shipper_matches: boolean
    importer_resolved: boolean   // true if a WAQC client OR importer was matched for the buyer
    quality_match: QualityMatch | null  // server-side contract->spec match, for the auto-select hint
  } | null
}

export interface SubContractFormData {
  // Entity overrides (NULL = inherit from mother)
  importer: string
  importer_is_qc_client: boolean
  roaster: string
  end_client: string
  qc_client: string
  // Contract references
  wolthers_contract_nr: string
  buyer_contract_nr: string
  roaster_contract_nr: string
  qc_client_contract_nr: string
  end_client_contract_nr: string
  supplier_contract_nr: string
  ico_number: string
  container_nr: string
  // Quantity fields (per sub-contract)
  bag_count: string
  bag_weight_kg: string
  bag_type: 'jute_bag' | 'pp_bag' | 'big_bag' | 'bulk' | ''
  bags_quantity_mt: string
  equivalent_60kg_bags: string
  shipment_month: string
  exporter_sample_number: string
}

export interface Step {
  id: number
  name: string
  description: string
}

export interface StepComponentProps {
  formData: FormData
  updateFormData: (field: keyof FormData, value: any) => void
  clients: Client[]
  laboratories: Laboratory[]
  filteredClients: Client[]
  approvedPSSSamples: any[]
  exporters?: Exporter[]
  importers?: Importer[]
  roasters?: Roaster[] // Roasters from the roasters table
  qcClients?: Client[] // Clients where is_qc_client = true
  error?: string | null
  isGlobalUser?: boolean // True if user is global_admin or global_cupper_admin
  onEntityCreated?: (type: 'exporter' | 'importer' | 'roaster' | 'end_client' | 'qc_client') => void // Callback to refresh entity lists after creation
}
