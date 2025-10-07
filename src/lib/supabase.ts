import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
          // QC-specific fields
          default_quality_specs?: string[]
          qc_enabled?: boolean
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
          default_quality_specs?: string[]
          qc_enabled?: boolean
          created_at?: string
          updated_at?: string
          [key: string]: any
        }
        Update: {
          name?: string
          email?: string
          company?: string
          address?: string
          default_quality_specs?: string[]
          qc_enabled?: boolean
          updated_at?: string
          [key: string]: any
        }
      }
    }
  }
}