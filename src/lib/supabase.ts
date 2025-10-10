import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Use SSR-compatible browser client that stores auth in cookies
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

// User roles for the coffee QC system
export type UserRole = 
  | 'lab_personnel'
  | 'lab_finance_manager'
  | 'lab_quality_manager'
  | 'santos_hq_finance'
  | 'global_finance_admin'
  | 'global_quality_admin'
  | 'global_admin'
  | 'client'
  | 'supplier'
  | 'buyer'

export type Laboratory = {
  id: string
  name: string
  location: string
  type: 'hq' | 'regional' | 'third_party'
  address: string
  storage_config?: StorageConfiguration
  created_at: string
  updated_at: string
}

export type StorageConfiguration = {
  shelves: number
  columns_per_shelf: number
  rows_per_shelf: number
  tins_per_position: number
  naming_pattern: string
  total_positions: number
}

export type Database = {
  public: {
    Tables: {
      // Extended profiles table (integrates with existing travel system)
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string
          // QC-specific fields
          qc_role?: UserRole
          laboratory_id?: string
          qc_permissions?: string[]
          qc_enabled?: boolean
          created_at: string
          updated_at: string
          // May have other travel-related fields
          [key: string]: any
        }
        Insert: {
          id: string
          email: string
          full_name: string
          qc_role?: UserRole
          laboratory_id?: string
          qc_permissions?: string[]
          qc_enabled?: boolean
          created_at?: string
          updated_at?: string
          [key: string]: any
        }
        Update: {
          id?: string
          email?: string
          full_name?: string
          qc_role?: UserRole
          laboratory_id?: string
          qc_permissions?: string[]
          qc_enabled?: boolean
          updated_at?: string
          [key: string]: any
        }
      }

      // Access requests for QC system
      access_requests: {
        Row: {
          id: string
          user_id: string
          status: 'pending' | 'approved' | 'rejected'
          requested_role?: UserRole
          requested_laboratory_id?: string
          justification?: string
          approved_role?: UserRole
          approved_laboratory_id?: string
          rejection_reason?: string
          processed_at?: string
          processed_by?: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          status?: 'pending' | 'approved' | 'rejected'
          requested_role?: UserRole
          requested_laboratory_id?: string
          justification?: string
          approved_role?: UserRole
          approved_laboratory_id?: string
          rejection_reason?: string
          processed_at?: string
          processed_by?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          status?: 'pending' | 'approved' | 'rejected'
          requested_role?: UserRole
          requested_laboratory_id?: string
          justification?: string
          approved_role?: UserRole
          approved_laboratory_id?: string
          rejection_reason?: string
          processed_at?: string
          processed_by?: string
          updated_at?: string
        }
      }

      // Laboratories configuration
      laboratories: {
        Row: Laboratory
        Insert: Omit<Laboratory, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Laboratory, 'id' | 'created_at'>>
      }
      
      // Quality templates (master recipes)
      quality_templates: {
        Row: {
          id: string
          name: string
          description: string
          version: number
          parameters: Record<string, any>
          created_by: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description: string
          version?: number
          parameters: Record<string, any>
          created_by: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          description?: string
          version?: number
          parameters?: Record<string, any>
          is_active?: boolean
          updated_at?: string
        }
      }
      
      // Client-specific quality configurations
      client_qualities: {
        Row: {
          id: string
          client_id: string
          template_id: string
          origin?: string
          custom_parameters: Record<string, any>
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          template_id: string
          origin?: string
          custom_parameters?: Record<string, any>
          created_at?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          template_id?: string
          origin?: string
          custom_parameters?: Record<string, any>
          updated_at?: string
        }
      }
      
      // Sample information and tracking
      samples: {
        Row: {
          id: string
          tracking_number: string
          client_id: string
          laboratory_id: string
          quality_spec_id?: string
          origin: string
          supplier: string
          status: 'received' | 'in_progress' | 'under_review' | 'approved' | 'rejected'
          storage_position?: string
          // Phase 2 fields
          wolthers_contract_nr?: string
          exporter_contract_nr?: string
          buyer_contract_nr?: string
          roaster_contract_nr?: string
          ico_number?: string
          container_nr?: string
          sample_type?: 'pss' | 'ss' | 'type'
          bags_quantity_mt?: number
          bag_count?: number
          bag_weight_kg?: number
          processing_method?: string
          workflow_stage?: string
          assigned_to?: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tracking_number: string
          client_id: string
          laboratory_id: string
          quality_spec_id?: string
          origin: string
          supplier: string
          status?: 'received' | 'in_progress' | 'under_review' | 'approved' | 'rejected'
          storage_position?: string
          // Phase 2 fields
          wolthers_contract_nr?: string
          exporter_contract_nr?: string
          buyer_contract_nr?: string
          roaster_contract_nr?: string
          ico_number?: string
          container_nr?: string
          sample_type?: 'pss' | 'ss' | 'type'
          bags_quantity_mt?: number
          bag_count?: number
          bag_weight_kg?: number
          processing_method?: string
          workflow_stage?: string
          assigned_to?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          tracking_number?: string
          client_id?: string
          laboratory_id?: string
          quality_spec_id?: string
          origin?: string
          supplier?: string
          status?: 'received' | 'in_progress' | 'under_review' | 'approved' | 'rejected'
          storage_position?: string
          // Phase 2 fields
          wolthers_contract_nr?: string
          exporter_contract_nr?: string
          buyer_contract_nr?: string
          roaster_contract_nr?: string
          ico_number?: string
          container_nr?: string
          sample_type?: 'pss' | 'ss' | 'type'
          bags_quantity_mt?: number
          bag_count?: number
          bag_weight_kg?: number
          processing_method?: string
          workflow_stage?: string
          assigned_to?: string
          updated_at?: string
        }
      }
      
      // Quality assessments
      quality_assessments: {
        Row: {
          id: string
          sample_id: string
          assessor_id: string
          green_bean_data?: Record<string, any>
          roast_data?: Record<string, any>
          compliance_status: 'pass' | 'fail' | 'pending'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          sample_id: string
          assessor_id: string
          green_bean_data?: Record<string, any>
          roast_data?: Record<string, any>
          compliance_status?: 'pass' | 'fail' | 'pending'
          created_at?: string
          updated_at?: string
        }
        Update: {
          sample_id?: string
          assessor_id?: string
          green_bean_data?: Record<string, any>
          roast_data?: Record<string, any>
          compliance_status?: 'pass' | 'fail' | 'pending'
          updated_at?: string
        }
      }
      
      // Cupping sessions
      cupping_sessions: {
        Row: {
          id: string
          sample_ids: string[]
          participants: string[]
          status: 'setup' | 'active' | 'completed'
          session_type: 'digital' | 'handwritten' | 'q_grading'
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          sample_ids: string[]
          participants: string[]
          status?: 'setup' | 'active' | 'completed'
          session_type: 'digital' | 'handwritten' | 'q_grading'
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          sample_ids?: string[]
          participants?: string[]
          status?: 'setup' | 'active' | 'completed'
          session_type?: 'digital' | 'handwritten' | 'q_grading'
          updated_at?: string
        }
      }
      
      // Cupping scores
      cupping_scores: {
        Row: {
          id: string
          session_id: string
          sample_id: string
          cupper_id: string
          scores: Record<string, any>
          defects: Record<string, any>
          notes?: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          session_id: string
          sample_id: string
          cupper_id: string
          scores: Record<string, any>
          defects?: Record<string, any>
          notes?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          session_id?: string
          sample_id?: string
          cupper_id?: string
          scores?: Record<string, any>
          defects?: Record<string, any>
          notes?: string
          updated_at?: string
        }
      }
      
      // Certificates
      certificates: {
        Row: {
          id: string
          sample_id: string
          certificate_number: string
          pdf_url?: string
          issued_by: string
          issued_to: string
          status: 'draft' | 'issued' | 'revoked'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          sample_id: string
          certificate_number: string
          pdf_url?: string
          issued_by: string
          issued_to: string
          status?: 'draft' | 'issued' | 'revoked'
          created_at?: string
          updated_at?: string
        }
        Update: {
          sample_id?: string
          certificate_number?: string
          pdf_url?: string
          issued_by?: string
          issued_to?: string
          status?: 'draft' | 'issued' | 'revoked'
          updated_at?: string
        }
      }
      
      // Extended clients table (integrates with existing travel system)
      clients: {
        Row: {
          id: string
          name: string
          email: string
          company: string
          address: string
          city?: string
          state?: string
          country?: string
          fantasy_name?: string
          phone?: string
          client_types?: string[]
          // Pricing fields
          pricing_model?: 'per_sample' | 'per_pound'
          price_per_sample?: number
          price_per_pound_cents?: number
          currency?: string
          fee_payer?: 'exporter' | 'importer' | 'roaster' | 'final_buyer' | 'client_pays'
          payment_terms?: string
          billing_notes?: string
          // QC-specific fields
          is_qc_client?: boolean
          default_quality_specs?: string[]
          notification_emails?: string[]
          certificate_delivery_timing?: string
          tracking_number_format?: string
          qc_enabled?: boolean
          // Integration fields
          company_id?: string
          legacy_client_id?: number
          created_at: string
          updated_at: string
          // May have other travel-related fields
          [key: string]: any
        }
        Insert: {
          id?: string
          name: string
          email: string
          company: string
          address: string
          city?: string
          state?: string
          country?: string
          fantasy_name?: string
          phone?: string
          client_types?: string[]
          pricing_model?: 'per_sample' | 'per_pound'
          price_per_sample?: number
          price_per_pound_cents?: number
          currency?: string
          fee_payer?: 'exporter' | 'importer' | 'roaster' | 'final_buyer' | 'client_pays'
          payment_terms?: string
          billing_notes?: string
          is_qc_client?: boolean
          default_quality_specs?: string[]
          notification_emails?: string[]
          certificate_delivery_timing?: string
          tracking_number_format?: string
          qc_enabled?: boolean
          company_id?: string
          legacy_client_id?: number
          created_at?: string
          updated_at?: string
          [key: string]: any
        }
        Update: {
          name?: string
          email?: string
          company?: string
          address?: string
          city?: string
          state?: string
          country?: string
          fantasy_name?: string
          phone?: string
          client_types?: string[]
          pricing_model?: 'per_sample' | 'per_pound'
          price_per_sample?: number
          price_per_pound_cents?: number
          currency?: string
          fee_payer?: 'exporter' | 'importer' | 'roaster' | 'final_buyer' | 'client_pays'
          payment_terms?: string
          billing_notes?: string
          is_qc_client?: boolean
          default_quality_specs?: string[]
          notification_emails?: string[]
          certificate_delivery_timing?: string
          tracking_number_format?: string
          qc_enabled?: boolean
          company_id?: string
          legacy_client_id?: number
          updated_at?: string
          [key: string]: any
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      search_clients: {
        Args: {
          search_term: string
          limit_count: number
        }
        Returns: {
          company_id: string | null
          qc_client_id: string | null
          name: string
          fantasy_name: string | null
          email: string | null
          phone: string | null
          address: string | null
          city: string | null
          state: string | null
          country: string | null
          primary_category: string | null
          subcategories: string[] | null
          source_table: string
          relevance_score: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}