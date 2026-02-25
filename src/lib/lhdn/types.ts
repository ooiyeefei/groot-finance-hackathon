/**
 * LHDN MyInvois API Types — e-Invoice Submission Pipeline
 *
 * Types for LHDN's MyInvois REST API used for e-invoice document submission,
 * status polling, cancellation, and TIN validation.
 */

// ============================================
// CONFIGURATION
// ============================================

export interface LhdnConfig {
  clientId: string
  clientSecret: string
  baseUrl: string
  environment: "sandbox" | "production"
}

// ============================================
// AUTHENTICATION
// ============================================

export interface LhdnToken {
  accessToken: string
  expiresAt: number // Unix timestamp (ms)
  tokenType: string
}

export interface LhdnTokenResponse {
  access_token: string
  token_type: string
  expires_in: number // seconds
}

// ============================================
// UBL 2.1 DOCUMENT STRUCTURE
// ============================================

export interface LhdnDocument {
  format: "JSON"
  document: string // Stringified UBL 2.1 JSON
  documentHash: string // SHA256 hash
  codeNumber: string // Document type code: "01", "02", "03", "04", "11"
}

export interface LhdnUblParty {
  TIN: string
  BRN?: string
  SST?: string
  Name: string
  AddressLine1?: string
  AddressLine2?: string
  AddressLine3?: string
  City?: string
  State?: string
  PostalZone?: string
  CountryCode: string
  ContactNumber?: string
  Email?: string
}

export interface LhdnUblInvoiceLine {
  ID: string
  Description: string
  Quantity: string // LHDN decimal format
  UnitCode: string
  UnitPrice: string // LHDN decimal format
  TaxAmount: string // LHDN decimal format
  TaxPercent: string // LHDN decimal format
  TaxCategory: string
  LineExtensionAmount: string // LHDN decimal format
  ItemClassificationCode?: string
}

export interface LhdnUblDocument {
  _D: string // UBL namespace
  _A: string // CommonAggregateComponents namespace
  _B: string // CommonBasicComponents namespace
  Invoice?: LhdnUblInvoiceBody[]
}

export interface LhdnUblInvoiceBody {
  ID: string
  IssueDate: string
  IssueTime: string
  InvoiceTypeCode: string
  DocumentCurrencyCode: string
  InvoicePeriod?: Array<{
    StartDate?: string
    EndDate?: string
    Description?: string
  }>
  BillingReference?: Array<{
    AdditionalDocumentReference?: Array<{
      ID: string
    }>
  }>
  AccountingSupplierParty: Array<{
    Party: Array<{
      IndustryClassificationCode: string
      PartyIdentification: Array<{
        ID: Array<{ _: string; schemeID: string }>
      }>
      PostalAddress: Array<{
        AddressLine: Array<{ Line: string }>
        CityName?: string
        PostalZone?: string
        CountrySubentityCode?: string
        Country: Array<{ IdentificationCode: string }>
      }>
      PartyLegalEntity: Array<{
        RegistrationName: string
      }>
      Contact: Array<{
        Telephone?: string
        ElectronicMail?: string
      }>
    }>
  }>
  AccountingCustomerParty: Array<{
    Party: Array<{
      PartyIdentification: Array<{
        ID: Array<{ _: string; schemeID: string }>
      }>
      PostalAddress: Array<{
        AddressLine: Array<{ Line: string }>
        CityName?: string
        PostalZone?: string
        CountrySubentityCode?: string
        Country: Array<{ IdentificationCode: string }>
      }>
      PartyLegalEntity: Array<{
        RegistrationName: string
      }>
      Contact: Array<{
        Telephone?: string
        ElectronicMail?: string
      }>
    }>
  }>
  TaxTotal: Array<{
    TaxAmount: string
    TaxSubtotal: Array<{
      TaxableAmount: string
      TaxAmount: string
      TaxCategory: Array<{
        ID: string
        Percent: string
        TaxScheme: Array<{
          ID: string
        }>
      }>
    }>
  }>
  LegalMonetaryTotal: Array<{
    LineExtensionAmount: string
    TaxExclusiveAmount: string
    TaxInclusiveAmount: string
    PayableAmount: string
  }>
  InvoiceLine: LhdnUblInvoiceLine[]
}

// ============================================
// SUBMISSION
// ============================================

export interface LhdnSubmissionResponse {
  submissionUid: string
  acceptedDocuments: Array<{
    uuid: string
    invoiceCodeNumber: string
  }>
  rejectedDocuments: Array<{
    invoiceCodeNumber: string
    error: {
      code: string
      message: string
      target?: string
    }
  }>
}

// ============================================
// STATUS POLLING
// ============================================

export interface LhdnSubmissionStatus {
  submissionUid: string
  documentCount: number
  dateTimeReceived: string
  overallStatus: string
  documentSummary: Array<{
    uuid: string
    submissionUid: string
    longId?: string
    internalId: string
    typeName: string
    typeVersionName: string
    issuerTin: string
    receiverTin?: string
    dateTimeIssued: string
    dateTimeReceived: string
    dateTimeValidated?: string
    totalExcludingTax: number
    totalNetAmount: number
    totalPayableAmount: number
    status: "Valid" | "Invalid" | "Cancelled" | "Submitted"
    cancelDateTime?: string
    rejectRequestDateTime?: string
    documentStatusReason?: string
    validationResults?: {
      status: string
      validationSteps: Array<{
        status: string
        name: string
        error?: {
          code: string
          message: string
          target?: string
        }
      }>
    }
  }>
}

// ============================================
// CANCELLATION
// ============================================

export interface LhdnCancelRequest {
  status: "cancelled"
  reason: string
}

// ============================================
// TIN VALIDATION
// ============================================

export interface LhdnTinValidationResult {
  isValid: boolean
}

// ============================================
// VALIDATION ERROR
// ============================================

export interface LhdnValidationError {
  code: string
  message: string
  target?: string
}

// ============================================
// STATUS TYPES
// ============================================

export type LhdnStatus = "pending" | "submitted" | "valid" | "invalid" | "cancelled"

export type LhdnJobStatus =
  | "queued"
  | "signing"
  | "submitting"
  | "polling"
  | "completed"
  | "failed"

// ============================================
// ERROR TYPES
// ============================================

export class LhdnApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errors?: LhdnValidationError[]
  ) {
    super(message)
    this.name = "LhdnApiError"
  }
}

// ============================================
// DIGITAL SIGNATURE
// ============================================

export interface SignDocumentRequest {
  action: "sign"
  document: string
  environment: "sandbox" | "production"
}

export interface SignDocumentResponse {
  success: boolean
  signedDocument: string
  documentHash: string
}
