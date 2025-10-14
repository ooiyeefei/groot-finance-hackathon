/**
 * Application Domain Type Definitions
 * Comprehensive TypeScript interfaces for the applications module
 */

// ============================================================================
// Core Application Types
// ============================================================================

export type ApplicationStatus = 'draft' | 'processing' | 'completed' | 'failed' | 'needs_review'

export interface Application {
  id: string
  user_id: string
  business_id: string
  application_type: string
  title: string
  description: string
  status: ApplicationStatus
  slots_filled: number
  slots_total: number
  progress_percentage: number
  validation_results?: Record<string, any>
  created_at: string
  updated_at: string
  submitted_at?: string | null
}

export interface ApplicationWithType extends Application {
  application_types: {
    type_code: string
    display_name: string
    description: string
    required_documents: RequiredDocument[]
  }
}

export interface ApplicationWithSlotStatus extends ApplicationWithType {
  slot_status: SlotStatus[]
}

// ============================================================================
// Application Type Configuration
// ============================================================================

export interface RequiredDocument {
  slot: string
  display_name: string
  description?: string
  is_critical: boolean
  document_type: string
  group_slots?: string[]
}

export interface ApplicationType {
  type_code: string
  display_name: string
  description: string
  required_documents: RequiredDocument[]
  is_active: boolean
  created_at: string
}

// ============================================================================
// Slot Status Types
// ============================================================================

export type SlotStatusType = 'empty' | 'processing' | 'completed' | 'error' | 'partial'

export interface SlotStatus {
  slot: string
  display_name: string
  is_critical: boolean
  status: SlotStatusType
  document_id: string | null
  uploaded_at: string | null
  group_slots?: string[]
  group_documents?: ApplicationDocument[]
  document?: ApplicationDocument | null
}

export interface ProgressStats {
  total_slots: number
  completed_slots: number
  critical_slots: number
  completed_critical_slots: number
  can_submit: boolean
  progress_percentage: number
}

// ============================================================================
// Document Types
// ============================================================================

export type DocumentProcessingStatus =
  | 'pending'
  | 'classifying'
  | 'pending_extraction'
  | 'extracting'
  | 'completed'
  | 'failed'
  | 'classification_failed'

export interface ApplicationDocument {
  id: string
  user_id: string
  business_id: string
  application_id: string | null
  document_slot: string
  slot_position: number
  file_name: string
  storage_path: string
  converted_image_path?: string | null
  converted_image_width?: number | null
  converted_image_height?: number | null
  file_size: number
  file_type: string
  processing_status: DocumentProcessingStatus
  document_type?: string | null
  document_classification_confidence?: number | null
  extracted_data?: Record<string, any> | null
  error_message?: string | null
  classification_task_id?: string | null
  extraction_task_id?: string | null
  document_metadata?: Record<string, any> | null
  deleted_at?: string | null
  processed_at?: string | null
  created_at: string
  updated_at: string
}

// ============================================================================
// Request/Response DTOs
// ============================================================================

export interface CreateApplicationRequest {
  title: string
  description?: string
  application_type?: string
}

export interface UpdateApplicationRequest {
  title?: string
  description?: string
}

export interface ListApplicationsParams {
  page?: number
  limit?: number
  status?: ApplicationStatus
  application_type?: string
}

export interface PaginationMetadata {
  page: number
  limit: number
  total: number
  has_more: boolean
  total_pages: number
}

export interface ApplicationListResponse {
  applications: ApplicationWithSlotStatus[]
  pagination: PaginationMetadata
}

export interface UploadDocumentRequest {
  file: File
  slot: string
}

export interface UploadDocumentResponse {
  document_id: string
  application_id: string
  document_slot: string
  file_name: string
  processing_status: string
  expected_document_type: string
  is_replacement: boolean
}

// ============================================================================
// Summary Types (AI-Consolidated Data)
// ============================================================================

export interface ApplicationSummary {
  application: {
    id: string
    title: string
    type: string
    type_display: string
    status: ApplicationStatus
    progress: number
    created_at: string
    submitted_at?: string | null
  }
  applicant: ApplicantData | null
  employment: EmploymentData | null
  financial: FinancialData | null
  financing: FinancingData | null
  processing: ProcessingMetadata
}

export interface ApplicantData {
  full_name?: string
  ic_number?: string
  date_of_birth?: string
  gender?: string
  address?: string
  phone?: string
  email?: string
  marital_status?: string
  confidence?: number
}

export interface EmploymentData {
  employer_name?: string
  job_title?: string
  employment_type?: string
  monthly_income?: number
  years_of_service?: number
  employer_address?: string
  office_phone?: string
  department?: string
  employee_name?: string
  employee_code?: string
}

export interface FinancialData {
  payslip_count: number
  average_net_income: number
  average_gross_income: number
  min_net_income: number
  max_net_income: number
  latest_net_income: number
  income_trend: 'stable' | 'increasing' | 'decreasing' | 'volatile'
  payslip_months: PayslipMonth[]
  employer_consistency: boolean
}

export interface PayslipMonth {
  period: string
  net_wages: number
  gross_wages: number
  employer: string
}

export interface FinancingData {
  type_of_financing?: string
  application_type?: string
  amount_requested?: number
  tenor?: number
  purpose_of_financing?: string
}

export interface ProcessingMetadata {
  total_documents: number
  confidence_scores: ConfidenceScore[]
  average_confidence: number
  completion_status: 'complete' | 'incomplete'
}

export interface ConfidenceScore {
  document_type: string
  slot: string
  confidence: number
}
