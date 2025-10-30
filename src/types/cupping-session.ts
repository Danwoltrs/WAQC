/**
 * Cupping Session Type Definitions
 * Defines types for managing cupping sessions, scores, and validation
 */

import { AttributeWithScale } from './cupping-templates'

// Sample types - expanded to include calibration
export type SampleType = 'type' | 'pss' | 'ss' | 'calibration'

// Cupping input methods
export type CuppingInputMethod = 'digital' | 'ocr' | 'ios' | 'mixed'

// Session status
export type CuppingSessionStatus =
  | 'pending'      // Session created, not started
  | 'in_progress'  // Cupping in progress
  | 'completed'    // All cuppers finished
  | 'validated'    // Quality validation passed (PSS/SS only)
  | 'rejected'     // Quality validation failed (PSS/SS only)

// Individual cupper's score for a single attribute
export interface AttributeScore {
  attribute: string
  score: number | null
  notes?: string
}

// Individual cupper's scores for a sample
export interface CupperScores {
  cupper_id: string
  cupper_name: string
  sample_id: string
  scores: AttributeScore[]
  taints?: string[]   // Array of taint descriptions
  faults?: string[]   // Array of fault descriptions
  overall_notes?: string
  completed_at?: string
  visibility_hidden?: boolean  // Privacy toggle for individual cupper
}

// Cupping session configuration
export interface CuppingSessionConfig {
  session_type: SampleType
  input_method: CuppingInputMethod
  quality_template_id?: string
  num_cups_per_sample: number
  attributes: AttributeWithScale[]

  // Calibration-specific settings
  cup_pattern?: 'square' | 'pyramid' | 'custom'
  custom_pattern?: number[]  // e.g., [2, 2, 3, 3] for custom pattern
  rounds?: number  // Number of calibration rounds
}

// Main cupping session record
export interface CuppingSession {
  id: string
  sample_ids: string[]
  cupper_ids: string[]
  laboratory_id: string
  config: CuppingSessionConfig
  status: CuppingSessionStatus

  // Scores and results
  cupper_scores: CupperScores[]
  average_scores?: Record<string, number>  // attribute -> average score
  final_score?: number

  // Quality validation (PSS/SS only)
  validation_results?: QualityValidationResult

  // Metadata
  created_by: string
  created_at: string
  started_at?: string
  completed_at?: string
  updated_at: string
}

// Quality validation result for PSS/SS samples
export interface QualityValidationResult {
  passed: boolean
  checked_at: string
  checked_by: string

  // Individual attribute validations
  attribute_validations: {
    attribute: string
    expected_min?: number
    expected_max?: number
    actual_score: number
    passed: boolean
    deviation?: number
  }[]

  // Overall validation
  overall_score_required?: number
  overall_score_actual?: number
  overall_passed?: boolean

  // Failure reasons
  failures?: string[]
  notes?: string
}

// Sample with cupping session data (for list views)
export interface SampleWithCuppingSession {
  id: string
  tracking_number: string
  sample_type: SampleType
  ico_number?: string
  container_nr?: string
  origin?: string

  // Relations
  client?: {
    id: string
    company: string
  }
  laboratory?: {
    id: string
    name: string
  }
  quality_spec?: {
    id: string
    template_id?: string
    custom_parameters?: any
  }

  // Cupping session
  cupping_sessions?: CuppingSession[]

  // Status tracking
  status: string
  created_at: string
}

// Cupper user profile
export interface Cupper {
  id: string
  full_name: string
  first_name?: string
  last_name?: string
  email: string
  is_q_grader: boolean
  laboratory_id?: string
}

// Session creation request
export interface CreateCuppingSessionRequest {
  sample_ids: string[]
  cupper_ids: string[]
  config: CuppingSessionConfig
}

// Session validation request (for PSS/SS)
export interface ValidateCuppingSessionRequest {
  session_id: string
  quality_template_id: string
}
