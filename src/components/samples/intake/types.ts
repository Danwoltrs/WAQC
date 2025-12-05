import { Database } from '@/lib/supabase'

export type SampleInsert = Database['public']['Tables']['samples']['Insert']
export type Client = Database['public']['Tables']['clients']['Row']
export type Laboratory = Database['public']['Tables']['laboratories']['Row']
export type Exporter = Database['public']['Tables']['exporters']['Row']
export type Importer = Database['public']['Tables']['importers']['Row']

export interface FormData {
  // Basic Info
  client_id: string
  laboratory_id: string
  exporter_sample_number: string // Exporter's sample identification number
  seller: string // The trading company that sold the coffee (e.g., Louis Dreyfus)
  shipper: string // The actual exporter that shipped the coffee (e.g., COOXUPE)
  same_seller_shipper: boolean // If true, seller is same as shipper
  importer: string // Renamed from buyer - the importing company
  importer_is_qc_client: boolean // If true, importer is also the QC client
  qc_client: string // Separate QC client name (when importer_is_qc_client is false)
  roaster: string
  origin: string
  micro_origin: string
  supplier: string
  processing_method: string
  sample_type: 'pss' | 'ss' | 'type' | ''
  linked_pss_sample_id: string
  quality_spec_id: string
  quality_name: string
  hide_exporter_on_label: boolean

  // Tracking Numbers
  wolthers_contract_nr: string
  seller_contract_nr: string // Contract from seller
  shipper_contract_nr: string // Contract from shipper (when different from seller)
  exporter_contract_nr: string
  importer_contract_nr: string // Renamed from buyer_contract_nr
  roaster_contract_nr: string
  qc_client_contract_nr: string // Contract from QC client (when separate from importer)
  ico_number: string
  container_nr: string

  // Quantity
  bag_count: string
  bag_weight_kg: string
  bag_type: 'jute_bag' | 'pp_bag' | 'big_bag' | 'bulk' | ''
  bags_quantity_mt: string // Auto-calculated
  equivalent_60kg_bags: string // Auto-calculated
  bulk_container_count: string // Auto-calculated for bulk type
  shipment_month: string // YYYY-MM format

  // Sample Details
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
  qcClients?: Client[] // Clients where is_qc_client = true
  error?: string | null
}
