/**
 * Storecove API Types — Peppol InvoiceNow Integration
 *
 * Types for Storecove's JSON REST API used for Peppol document submission,
 * discovery, and webhook event handling.
 */

// ============================================
// CONFIGURATION
// ============================================

export interface StorecoveConfig {
  apiKey: string
  legalEntityId: number
  baseUrl: string
}

// ============================================
// DOCUMENT SUBMISSION
// ============================================

export interface StorecoveParty {
  party: {
    companyName: string
    address: {
      street1?: string
      street2?: string
      city?: string
      zip?: string
      country: string // ISO 3166-1 alpha-2
    }
    contact?: {
      email?: string
      firstName?: string
      lastName?: string
      phone?: string
    }
  }
  publicIdentifiers?: Array<{
    scheme: string
    id: string
  }>
}

export interface StorecoveInvoiceLine {
  lineId: string
  description: string
  quantity: number
  unitCode: string // UN/ECE Recommendation 20 (e.g., "C62" for unit)
  amountExcludingVat: number
  itemPrice: number
  tax?: {
    amount: number
    percentage: number
    country: string
    category: "S" | "Z" | "E" | "O" // UNCL 5305
  }
}

export interface StorecoveDocumentSubmission {
  legalEntityId: number
  routing: {
    eIdentifiers: Array<{
      scheme: string // e.g., "sg:uen" for Singapore
      id: string // UEN without scheme prefix
    }>
  }
  document: {
    documentType: "invoice" | "creditnote"
    invoiceNumber: string
    issueDate: string // YYYY-MM-DD
    dueDate?: string // YYYY-MM-DD
    taxPointDate?: string
    documentCurrencyCode: string // ISO 4217
    accountingSupplierParty: StorecoveParty
    accountingCustomerParty: StorecoveParty
    invoiceLines: StorecoveInvoiceLine[]
    allowanceCharges?: Array<{
      reason: string
      amountExcludingTax: number
    }>
    paymentMeansCode?: string
    paymentId?: string
    note?: string
    taxSubtotals?: Array<{
      taxableAmount: number
      taxAmount: number
      percentage: number
      country: string
      category: "S" | "Z" | "E" | "O"
    }>
    amountIncludingVat: number
    billingReference?: string // For credit notes: original invoice number
  }
}

// ============================================
// SUBMISSION RESPONSE
// ============================================

export interface StorecoveSubmissionResponse {
  guid: string // Storecove submission GUID — stored as peppolDocumentId
}

// ============================================
// DISCOVERY
// ============================================

export interface StorecoveDiscoveryRequest {
  documentTypes: string[]
  network: string
  metaScheme: string
  scheme: string
  identifier: string
}

export interface StorecoveDiscoveryResponse {
  code: string
}

// ============================================
// EVIDENCE
// ============================================

export interface StorecoveEvidence {
  guid: string
  status: string
  evidence?: string // Base64 encoded evidence document
}

// ============================================
// WEBHOOK EVENTS
// ============================================

export interface StorecoveWebhookPayload {
  guid: string // Webhook instance GUID
  body: string // Stringified JSON - needs JSON.parse
}

export interface StorecoveWebhookBody {
  guid: string // Document submission GUID (matches peppolDocumentId)
  status: "transmitted" | "delivered" | "failed"
  timestamp?: string
  errors?: Array<{
    code: string
    message: string
  }>
}

export interface StorecoveWebhookEvent {
  submissionGuid: string
  eventType: "transmitted" | "delivered" | "failed"
  timestamp: number // Unix ms
  errors?: Array<{ code: string; message: string }>
}

// ============================================
// ERROR TYPES
// ============================================

export interface StorecoveValidationError {
  source: string
  details: string
}

export class StorecoveApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errors?: StorecoveValidationError[]
  ) {
    super(message)
    this.name = "StorecoveApiError"
  }
}

// ============================================
// PEPPOL CONSTANTS
// ============================================

/** Singapore UEN scheme for Peppol */
export const PEPPOL_SCHEME_SG_UEN = "0195"

/** Storecove routing scheme for Singapore */
export const STORECOVE_SCHEME_SG = "sg:uen"

/** UNCL 5305 tax category mapping */
export function mapTaxCategory(
  taxRate: number,
  isExempt?: boolean
): "S" | "Z" | "E" | "O" {
  if (isExempt) return "E"
  if (taxRate > 0) return "S" // Standard rate (9% GST in SG)
  if (taxRate === 0) return "Z" // Zero-rated
  return "O" // Out of scope
}
