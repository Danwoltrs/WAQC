import { Database } from '@/lib/supabase'

export type SampleInsert = Database['public']['Tables']['samples']['Insert']
export type Client = Database['public']['Tables']['clients']['Row']
export type Laboratory = Database['public']['Tables']['laboratories']['Row']
export type Exporter = Database['public']['Tables']['exporters']['Row']
export type Importer = Database['public']['Tables']['importers']['Row']
export type Roaster = Database['public']['Tables']['roasters']['Row']

export interface FormData {
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
  sample_type: 'pss' | 'ss' | 'type' | ''
  linked_pss_sample_id: string
  quality_spec_id: string
  quality_name: string
  hide_exporter_on_label: boolean
  certifications: string[] // Multiple certifications (Rainforest Alliance, Fair Trade, etc.)

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
}
