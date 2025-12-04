import { Database } from '@/lib/supabase'

export type SampleInsert = Database['public']['Tables']['samples']['Insert']
export type Client = Database['public']['Tables']['clients']['Row']
export type Laboratory = Database['public']['Tables']['laboratories']['Row']

export interface FormData {
  // Basic Info
  client_id: string
  laboratory_id: string
  exporter_sample_number: string // Exporter's sample identification number
  seller: string // The trading company that sold the coffee (e.g., Louis Dreyfus)
  shipper: string // The actual exporter that shipped the coffee (e.g., COOXUPE)
  same_seller_shipper: boolean // If true, seller is same as shipper
  buyer: string
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
  exporter_contract_nr: string
  buyer_contract_nr: string
  roaster_contract_nr: string
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
  error?: string | null
}
