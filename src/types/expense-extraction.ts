/**
 * DSPy-Inspired Expense Extraction Types
 * Industry-standard data structure for automated receipt processing
 * Based on SOX, GAAP, IFRS compliance requirements
 */

import { SupportedCurrency } from './transaction'
import { ExpenseCategory } from './expense-claims'

// ============================================================================
// DSPy SIGNATURE INTERFACES (TypeScript as Declarative Signatures)
// ============================================================================

/**
 * Core receipt data extracted via DSPy-inspired OCR
 * This interface serves as our "signature" - the contract between OCR and application
 */
export interface ExtractedReceiptData {
  // Vendor Information (Chain-of-Thought Step 1)
  vendorName: string
  vendorAddress?: string
  vendorTaxId?: string
  
  // Transaction Details (Chain-of-Thought Step 2)
  transactionDate: string // ISO 8601 format: YYYY-MM-DD
  transactionTime?: string // HH:mm:ss format
  receiptNumber?: string
  invoiceNumber?: string
  
  // Financial Data (Chain-of-Thought Step 3)
  subtotalAmount?: number
  taxAmount?: number
  tipAmount?: number
  totalAmount: number
  currency: string // ISO 4217 code (USD, EUR, etc.)
  
  // Tax Information (Chain-of-Thought Step 4)
  taxRate?: number // e.g., 0.08 for 8%
  taxType?: string // e.g., "VAT", "GST", "Sales Tax"
  taxJurisdiction?: string // e.g., "US-CA", "GB", "AU"
  
  // Line Items (Chain-of-Thought Step 5)
  lineItems: ExtractedLineItem[]
  
  // Payment Information (Chain-of-Thought Step 6)
  paymentMethod?: 'cash' | 'card' | 'check' | 'digital' | 'other'
  cardLastFour?: string
  
  // Quality Metrics (DSPy Confidence Scoring)
  extractionQuality: 'high' | 'medium' | 'low'
  confidenceScore: number // 0.0 to 1.0
  missingFields: string[] // Fields that couldn't be extracted
  
  // Processing Metadata
  processingMethod: 'gemini_ocr' | 'manual_entry'
  modelUsed?: string // e.g., "gemini-2.5-flash"
  processingTimestamp: string // ISO 8601
}

/**
 * Individual line item extracted from receipt
 */
export interface ExtractedLineItem {
  description: string
  quantity?: number
  unitPrice?: number
  lineTotal: number
  taxIncluded?: boolean
  category?: string // Auto-suggested category
  sku?: string
}

// ============================================================================
// DSPy CHAIN-OF-THOUGHT INTERFACES
// ============================================================================

/**
 * Structured reasoning output from DSPy-inspired Chain-of-Thought
 */
export interface ExtractionReasoning {
  step1_vendor_analysis: string
  step2_date_identification: string
  step3_amount_parsing: string
  step4_tax_calculation: string
  step5_line_items_extraction: string
  step6_validation_checks: string
  final_confidence_assessment: string
}

/**
 * Complete DSPy-style extraction result
 */
export interface DSPyExtractionResult {
  thinking: ExtractionReasoning
  extractedData: ExtractedReceiptData
  processingComplete: boolean
  needsManualReview: boolean
  suggestedCorrections?: string[]
}

// ============================================================================
// INDUSTRY-STANDARD COMPLIANCE INTERFACES
// ============================================================================

/**
 * Enhanced expense claim with industry compliance standards
 */
export interface EnhancedExpenseClaim {
  // Core Identification
  id: string
  employeeId: string
  claimNumber?: string // Human-readable claim identifier
  
  // Submission & Workflow
  status: ExpenseClaimStatus
  submissionDate: string // ISO 8601
  businessPurpose: string
  
  // Extracted Receipt Data (DSPy Output)
  receiptData: ExtractedReceiptData
  
  // Categorization & Coding
  expenseCategory: ExpenseCategory
  subcategory?: string
  glAccountCode?: string // General Ledger account
  costCenter?: string
  projectCode?: string
  clientCode?: string // For billable expenses
  
  // Amounts & Currency
  originalAmount: number
  originalCurrency: SupportedCurrency
  homeCurrencyAmount?: number // Converted amount
  homeCurrency: SupportedCurrency
  exchangeRate?: number
  exchangeRateDate?: string
  exchangeRateSource?: string // "xe.com", "credit_card", "manual"
  
  // Compliance & Audit Trail
  complianceStatus: ComplianceStatus
  auditTrail: AuditLogEntry[]
  attachments: ReceiptAttachment[]
  
  // Approval Workflow
  approvalWorkflow: ApprovalStep[]
  currentApprover?: string
  
  // Policy & Validation
  policyChecks: PolicyCheck[]
  requiresJustification: boolean
  businessJustification?: string
  
  // Reimbursement
  isReimbursable: boolean
  reimbursementStatus?: ReimbursementStatus
  reimbursementDate?: string
  paymentReference?: string
  
  // Metadata
  createdAt: string
  createdBy: string
  lastModifiedAt: string
  lastModifiedBy: string
  version: number // For optimistic locking
}

/**
 * Enhanced compliance status tracking
 */
export type ComplianceStatus = 
  | 'compliant'
  | 'needs_review'
  | 'violation_detected' 
  | 'pending_documentation'
  | 'tax_implications'
  | 'audit_required'

/**
 * Detailed audit trail for compliance
 */
export interface AuditLogEntry {
  timestamp: string // ISO 8601
  actorId: string
  actorName: string
  action: AuditAction
  previousValue?: any
  newValue?: any
  ipAddress?: string
  userAgent?: string
  reason?: string
}

export type AuditAction =
  | 'created'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'modified'
  | 'attachment_added'
  | 'attachment_removed'
  | 'status_changed'
  | 'amount_changed'
  | 'category_changed'
  | 'policy_override'
  | 'manual_review_requested'

/**
 * Enhanced approval workflow
 */
export interface ApprovalStep {
  stepNumber: number
  approverRole: 'manager' | 'finance' | 'hr' | 'compliance'
  approverId?: string
  approverName?: string
  status: 'pending' | 'approved' | 'rejected' | 'delegated'
  timestamp?: string
  comments?: string
  approvalLimit?: number // Maximum amount this approver can approve
  requiredDocuments?: string[]
  escalationReason?: string
}

/**
 * Enhanced policy checking
 */
export interface PolicyCheck {
  ruleId: string
  ruleName: string
  status: 'passed' | 'failed' | 'warning' | 'requires_review'
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  autoResolvable: boolean
  suggestedAction?: string
  checkedAt: string
  checkedBy: string // 'system' or user ID
}

/**
 * Enhanced receipt attachment tracking
 */
export interface ReceiptAttachment {
  id: string
  fileName: string
  originalFileName: string
  mimeType: string
  fileSize: number
  storageUrl: string
  thumbnailUrl?: string
  
  // Upload metadata
  uploadedAt: string
  uploadedBy: string
  uploadMethod: 'web' | 'mobile' | 'email' | 'api'
  
  // OCR processing
  ocrStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'
  ocrAttempts: number
  ocrLastAttemptAt?: string
  ocrResult?: DSPyExtractionResult
  ocrErrors?: string[]
  
  // Quality metrics
  imageQuality?: 'excellent' | 'good' | 'acceptable' | 'poor'
  isReadable: boolean
  needsManualEntry: boolean
  
  // Security & compliance
  virusScanStatus?: 'clean' | 'infected' | 'suspicious' | 'not_scanned'
  retentionExpiryDate?: string // For compliance retention policies
  encryptedStorage: boolean
}

/**
 * Reimbursement status tracking
 */
export type ReimbursementStatus =
  | 'not_reimbursable'
  | 'pending_reimbursement' 
  | 'processing_payment'
  | 'paid'
  | 'payment_failed'
  | 'refund_requested'
  | 'cancelled'

/**
 * Enhanced expense claim status
 */
export type ExpenseClaimStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'pending_manager_approval'
  | 'pending_finance_approval'
  | 'pending_compliance_review'
  | 'approved'
  | 'partially_approved'
  | 'rejected'
  | 'returned_for_modification'
  | 'processing_reimbursement'
  | 'reimbursed'
  | 'cancelled'
  | 'archived'

// ============================================================================
// DSPy PROMPT CONFIGURATION
// ============================================================================

/**
 * Configuration for DSPy-inspired prompting
 */
export interface DSPyPromptConfig {
  modelName: string
  temperature: number
  maxTokens: number
  enableChainOfThought: boolean
  enforceJsonSchema: boolean
  enableFewShotExamples: boolean
  confidenceThreshold: number // Minimum confidence for auto-approval
  retryAttempts: number
  fallbackToManualEntry: boolean
}

/**
 * Few-shot example for DSPy prompting
 */
export interface DSPyFewShotExample {
  receiptText: string
  expectedReasoning: ExtractionReasoning
  expectedOutput: ExtractedReceiptData
  description: string
}