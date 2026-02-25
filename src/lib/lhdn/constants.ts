/**
 * LHDN MyInvois Constants — e-Invoice Submission Pipeline
 *
 * Document type codes, general TINs, API paths, rate limits,
 * and UBL namespace prefixes for LHDN e-invoice integration.
 */

// ============================================
// DOCUMENT TYPE CODES
// ============================================

export const LHDN_DOCUMENT_TYPES = {
  INVOICE: "01",
  CREDIT_NOTE: "02",
  DEBIT_NOTE: "03",
  REFUND_NOTE: "04",
  SELF_BILLED_INVOICE: "11",
  SELF_BILLED_CREDIT_NOTE: "12",
  SELF_BILLED_DEBIT_NOTE: "13",
  SELF_BILLED_REFUND_NOTE: "14",
} as const

export type LhdnDocumentTypeCode = typeof LHDN_DOCUMENT_TYPES[keyof typeof LHDN_DOCUMENT_TYPES]

// ============================================
// GENERAL TINS
// ============================================

/** General public TIN — used when buyer has no TIN (B2C transactions) */
export const GENERAL_PUBLIC_TIN = "EI00000000000"

/** General individual TIN — used for self-billing when vendor is an individual */
export const GENERAL_INDIVIDUAL_TIN = "EI00000000010"

/** General foreign buyer TIN */
export const GENERAL_FOREIGN_BUYER_TIN = "EI00000000020"

/** General foreign seller TIN — for self-billing from foreign suppliers */
export const GENERAL_FOREIGN_SELLER_TIN = "EI00000000020"

// ============================================
// API PATHS
// ============================================

export const LHDN_API_PATHS = {
  TOKEN: "/connect/token",
  SUBMIT_DOCUMENTS: "/api/v1.0/documentsubmissions/",
  GET_SUBMISSION: "/api/v1.0/documentsubmissions/",
  CANCEL_DOCUMENT: "/api/v1.0/documents/state/",
  VALIDATE_TIN: "/api/v1.0/taxpayer/validate/",
} as const

// ============================================
// RATE LIMITS (requests per minute)
// ============================================

export const LHDN_RATE_LIMITS = {
  TOKEN: 12,
  SUBMIT: 100,
  POLL: 300,
  CANCEL: 12,
  VALIDATE_TIN: 60,
} as const

// ============================================
// UBL NAMESPACE PREFIXES
// ============================================

export const UBL_NAMESPACES = {
  /** UBL Invoice root namespace */
  _D: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
  /** CommonAggregateComponents namespace */
  _A: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
  /** CommonBasicComponents namespace */
  _B: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
} as const

// ============================================
// SUBMISSION CONSTRAINTS
// ============================================

export const LHDN_SUBMISSION_LIMITS = {
  MAX_DOCUMENTS_PER_BATCH: 100,
  MAX_DOCUMENT_SIZE_BYTES: 300 * 1024, // 300KB
  MAX_BATCH_SIZE_BYTES: 5 * 1024 * 1024, // 5MB
} as const

// ============================================
// POLLING CONFIGURATION
// ============================================

export const LHDN_POLLING_CONFIG = {
  /** Initial polling interval (ms) — first 2 minutes */
  INITIAL_INTERVAL_MS: 5_000,
  /** Backoff polling interval (ms) — after 2 minutes */
  BACKOFF_INTERVAL_MS: 30_000,
  /** Switch from initial to backoff after this duration (ms) */
  INITIAL_PHASE_DURATION_MS: 2 * 60 * 1000,
  /** Maximum polling duration before timeout (ms) */
  MAX_POLL_DURATION_MS: 30 * 60 * 1000,
  /** Retry interval after timeout (ms) — 1 hour */
  RETRY_INTERVAL_MS: 60 * 60 * 1000,
  /** Maximum number of full retry cycles */
  MAX_RETRIES: 3,
} as const

// ============================================
// CANCELLATION
// ============================================

export const LHDN_CANCELLATION = {
  /** Maximum hours after validation to allow cancellation */
  WINDOW_HOURS: 72,
  /** Window in milliseconds */
  WINDOW_MS: 72 * 60 * 60 * 1000,
} as const

// ============================================
// TOKEN CONFIGURATION
// ============================================

export const LHDN_TOKEN_CONFIG = {
  /** Token validity duration (ms) — 60 minutes with 5-minute buffer */
  VALIDITY_BUFFER_MS: 5 * 60 * 1000,
} as const

// ============================================
// QR CODE
// ============================================

export const LHDN_QR_BASE_URL = "https://myinvois.hasil.gov.my"

export function getLhdnVerificationUrl(longId: string): string {
  return `${LHDN_QR_BASE_URL}/${longId}/share`
}

// ============================================
// EINVOICE TYPE TO DOCUMENT TYPE MAPPING
// ============================================

export function mapEinvoiceTypeToDocumentType(
  einvoiceType?: string,
  isSelfBilled?: boolean
): string {
  if (isSelfBilled) {
    switch (einvoiceType) {
      case "credit_note":
        return LHDN_DOCUMENT_TYPES.SELF_BILLED_CREDIT_NOTE
      case "debit_note":
        return LHDN_DOCUMENT_TYPES.SELF_BILLED_DEBIT_NOTE
      case "refund_note":
        return LHDN_DOCUMENT_TYPES.SELF_BILLED_REFUND_NOTE
      default:
        return LHDN_DOCUMENT_TYPES.SELF_BILLED_INVOICE
    }
  }

  switch (einvoiceType) {
    case "credit_note":
      return LHDN_DOCUMENT_TYPES.CREDIT_NOTE
    case "debit_note":
      return LHDN_DOCUMENT_TYPES.DEBIT_NOTE
    case "refund_note":
      return LHDN_DOCUMENT_TYPES.REFUND_NOTE
    default:
      return LHDN_DOCUMENT_TYPES.INVOICE
  }
}
