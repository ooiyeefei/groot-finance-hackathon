/**
 * Convex API Contracts: Document Inbox
 *
 * This file defines the TypeScript contracts for Convex mutations and queries
 * related to email forwarding and the "Needs Review" inbox.
 *
 * DO NOT IMPORT THIS FILE IN PRODUCTION CODE.
 * This is a contract specification for documentation and testing purposes only.
 */

import { Id } from '../../convex/_generated/dataModel';

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new document inbox entry from email forwarding
 * Called by: Lambda email processor after parsing SES email
 */
export interface CreateInboxEntryArgs {
  businessId: Id<'businesses'>;
  userId: Id<'users'>; // Determined from email sender
  fileStorageId: Id<'_storage'>; // Convex file storage ID after upload
  originalFilename: string;
  fileHash: string; // MD5 hash for duplicate detection
  fileSizeBytes: number;
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png';
  sourceType: 'email_forward';
  emailMetadata: {
    from: string; // sender@domain.com
    subject: string;
    body: string; // First 1000 characters
    receivedAt: number; // Timestamp
    messageId: string; // SES message ID
  };
}

export interface CreateInboxEntryResult {
  inboxEntryId: Id<'document_inbox_entries'>;
  triggerClassification: boolean; // True if should trigger Trigger.dev task
  isDuplicate: boolean; // True if duplicate detected
  duplicateOriginalId?: Id<'expense_claims'> | Id<'invoices'>;
}

/**
 * Update document inbox entry status after classification
 * Called by: Trigger.dev classify-document task
 */
export interface UpdateInboxStatusArgs {
  inboxEntryId: Id<'document_inbox_entries'>;
  status: 'needs_review' | 'routed' | 'extraction_failed';
  aiDetectedType?: 'receipt' | 'invoice' | 'e_invoice' | 'unknown';
  aiConfidence?: number; // 0.0-1.0
  aiReasoning?: string;
  destinationDomain?: 'expense_claims' | 'invoices' | 'einvoice';
  destinationRecordId?: Id<'expense_claims'> | Id<'invoices'> | Id<'einvoice_received_documents'>;
  errorMessage?: string;
  errorDetails?: any;
}

export interface UpdateInboxStatusResult {
  success: boolean;
  shouldNotifyUser: boolean; // True if needs_review or extraction_failed
}

/**
 * Manually classify a document from "Needs Review" inbox
 * Called by: Frontend when user selects document type
 */
export interface ManuallyClassifyDocumentArgs {
  inboxEntryId: Id<'document_inbox_entries'>;
  classifiedType: 'receipt' | 'invoice' | 'e_invoice';
  classifiedBy: Id<'users'>; // Current user ID
}

export interface ManuallyClassifyDocumentResult {
  success: boolean;
  destinationDomain: 'expense_claims' | 'invoices' | 'einvoice';
  destinationRecordId: Id<'expense_claims'> | Id<'invoices'> | Id<'einvoice_received_documents'>;
  message: string; // User-facing success message
}

/**
 * Route classified document to destination table
 * Called by: classify-document task (high confidence) or manuallyClassifyDocument (user override)
 */
export interface RouteDocumentArgs {
  inboxEntryId: Id<'document_inbox_entries'>;
  destinationDomain: 'expense_claims' | 'invoices' | 'einvoice';
  extractedData?: any; // Document-specific extracted fields (vendor, amount, etc.)
  classificationMethod: 'ai' | 'manual';
}

export interface RouteDocumentResult {
  success: boolean;
  destinationRecordId: Id<'expense_claims'> | Id<'invoices'> | Id<'einvoice_received_documents'>;
  inboxEntryDeleted: boolean; // True after successful routing
}

/**
 * Delete document from inbox (user action)
 * Called by: Frontend when user clicks "Delete" button
 */
export interface DeleteInboxEntryArgs {
  inboxEntryId: Id<'document_inbox_entries'>;
  deletedBy: Id<'users'>;
  reason?: string; // Optional: why user deleted (e.g., "wrong document", "duplicate")
}

export interface DeleteInboxEntryResult {
  success: boolean;
  fileDeleted: boolean; // True if Convex storage file also deleted
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all documents in "Needs Review" inbox for a business
 * Called by: Frontend "Needs Review" inbox page
 */
export interface GetInboxDocumentsArgs {
  businessId: Id<'businesses'>;
  status?: 'needs_review' | 'extraction_failed' | 'archived' | 'quarantined'; // Default: needs_review
  userId?: Id<'users'>; // Optional: filter by user (employees see only their docs)
  limit?: number; // Default: 50
  offset?: number; // For pagination
}

export interface GetInboxDocumentsResult {
  documents: Array<{
    _id: Id<'document_inbox_entries'>;
    _creationTime: number;
    originalFilename: string;
    fileStorageId: Id<'_storage'>;
    fileSizeBytes: number;
    mimeType: string;
    status: string;
    aiDetectedType?: string;
    aiConfidence?: number;
    aiReasoning?: string;
    emailMetadata: {
      from: string;
      subject: string;
      receivedAt: number;
    };
    isDuplicate: boolean;
    duplicateOriginalId?: Id<'expense_claims'> | Id<'invoices'>;
    archiveEligibleAt: number;
  }>;
  total: number; // Total count (for pagination)
  hasMore: boolean; // True if more documents exist beyond current page
}

/**
 * Get inbox document by ID (for detail view)
 * Called by: Frontend when user clicks on a document
 */
export interface GetInboxDocumentArgs {
  inboxEntryId: Id<'document_inbox_entries'>;
}

export interface GetInboxDocumentResult {
  document: {
    _id: Id<'document_inbox_entries'>;
    _creationTime: number;
    businessId: Id<'businesses'>;
    userId: Id<'users'>;
    originalFilename: string;
    fileStorageId: Id<'_storage'>;
    fileUrl: string; // Convex storage signed URL
    fileHash: string;
    fileSizeBytes: number;
    mimeType: string;
    status: string;
    sourceType: string;
    emailMetadata?: {
      from: string;
      subject: string;
      body: string;
      receivedAt: number;
      messageId: string;
    };
    aiDetectedType?: string;
    aiConfidence?: number;
    aiReasoning?: string;
    manuallyClassifiedType?: string;
    classifiedBy?: Id<'users'>;
    classifiedAt?: number;
    errorMessage?: string;
    errorDetails?: any;
    retryCount: number;
    isDuplicate: boolean;
    duplicateOriginalId?: Id<'expense_claims'> | Id<'invoices'>;
    archiveEligibleAt: number;
    deleteEligibleAt: number;
  };
  user: {
    _id: Id<'users'>;
    name: string;
    email: string;
  };
}

/**
 * Find existing document by file hash (duplicate detection)
 * Called by: Lambda email processor before classification
 */
export interface FindDocumentByHashArgs {
  businessId: Id<'businesses'>;
  fileHash: string;
  sinceTimestamp: number; // Check only documents created after this timestamp (90-day window)
}

export interface FindDocumentByHashResult {
  found: boolean;
  documentType?: 'expense_claim' | 'invoice' | 'inbox_entry'; // Which table the duplicate is in
  documentId?: Id<'expense_claims'> | Id<'invoices'> | Id<'document_inbox_entries'>;
  createdAt?: number;
  metadata?: {
    filename?: string;
    vendor?: string;
    amount?: number;
    date?: string;
  };
}

/**
 * Get inbox statistics for dashboard/analytics
 * Called by: Frontend dashboard or admin page
 */
export interface GetInboxStatsArgs {
  businessId: Id<'businesses'>;
  period?: '7d' | '30d' | '90d' | 'all'; // Default: 30d
}

export interface GetInboxStatsResult {
  needsReview: number; // Current count of documents awaiting classification
  extractionFailed: number; // Current count of failed extractions
  totalProcessed: number; // Total documents routed in period
  totalQuarantined: number; // Total unauthorized submissions in period
  averageClassificationTime: number; // Average seconds from received to routed
  autoRouteRate: number; // Percentage of documents routed directly (confidence ≥85%)
  manualClassificationRate: number; // Percentage requiring user intervention
  documentTypeBreakdown: {
    receipts: number;
    invoices: number;
    eInvoices: number;
    unknown: number;
  };
  sourceTypeBreakdown: {
    emailForward: number;
    manualUpload: number;
  };
}

// ============================================================================
// Internal Mutations (Cron Jobs)
// ============================================================================

/**
 * Auto-archive documents with no user action for 30 days
 * Called by: Convex cron (daily at 2 AM)
 */
export interface AutoArchiveInboxDocumentsResult {
  archivedCount: number;
  filesMovedToGlacier: number;
}

/**
 * Delete archived documents after 7-year retention period (PDPA)
 * Called by: Convex cron (monthly)
 */
export interface DeleteExpiredDocumentsResult {
  deletedCount: number;
  filesDeleted: number;
}

/**
 * Send exception notifications (low confidence, extraction failures)
 * Called by: Convex cron (hourly)
 */
export interface SendExceptionNotificationsArgs {
  // No args - processes all businesses with pending notifications
}

export interface SendExceptionNotificationsResult {
  emailsSent: number;
  errors: Array<{
    businessId: Id<'businesses'>;
    error: string;
  }>;
}

// ============================================================================
// Example Usage (TypeScript)
// ============================================================================

/*
// Frontend: Get inbox documents
const { documents, total, hasMore } = await convex.query(
  api.functions.documentInbox.getInboxDocuments,
  {
    businessId: currentBusinessId,
    status: 'needs_review',
    limit: 50,
    offset: 0
  }
);

// Frontend: Manually classify document
const result = await convex.mutation(
  api.functions.documentInbox.manuallyClassifyDocument,
  {
    inboxEntryId: selectedDocId,
    classifiedType: 'invoice',
    classifiedBy: currentUserId
  }
);
// result.destinationDomain = 'invoices'
// result.message = 'Document classified as AP Invoice and routed successfully'

// Lambda: Create inbox entry from email
const { inboxEntryId, triggerClassification, isDuplicate } = await convex.mutation(
  api.functions.documentInbox.createInboxEntry,
  {
    businessId,
    userId,
    fileStorageId,
    originalFilename: 'receipt.jpg',
    fileHash: 'abc123...',
    fileSizeBytes: 45678,
    mimeType: 'image/jpeg',
    sourceType: 'email_forward',
    emailMetadata: {
      from: 'user@company.com',
      subject: 'Fwd: Receipt',
      body: 'See attached receipt...',
      receivedAt: Date.now(),
      messageId: '<msg123@ses.amazonaws.com>'
    }
  }
);

if (isDuplicate) {
  // Send auto-reply email
  await sendDuplicateNotification(emailMetadata.from);
} else if (triggerClassification) {
  // Trigger Trigger.dev classification task
  await triggerDev.trigger('classify-document', {
    documentId: inboxEntryId,
    businessId,
    targetDomain: 'auto'
  });
}
*/
