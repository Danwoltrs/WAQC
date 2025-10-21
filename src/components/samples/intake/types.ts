import { Database } from '@/lib/supabase'

export type SampleInsert = Database['public']['Tables']['samples']['Insert']
export type Client = Database['public']['Tables']['clients']['Row']
export type Laboratory = Database['public']['Tables']['laboratories']['Row']

export interface FormData {
  // Basic Info
  client_id: string
  laboratory_id: string
  exporter: string
  buyer: string
  roaster: string
  origin: string
  supplier: string
  processing_method: string
  sample_type: 'pss' | 'ss' | 'type' | ''
  linked_pss_sample_id: string

  // Tracking Numbers
  wolthers_contract_nr: string
  exporter_contract_nr: string
  buyer_contract_nr: string
  roaster_contract_nr: string
  ico_number: string
  container_nr: string

  // Quantity
  bags_quantity_mt: string
  bag_count: string

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
