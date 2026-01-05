import { getAuthenticatedConvex } from '@/lib/convex'
import { auth } from '@clerk/nextjs/server'
import { randomUUID } from 'crypto'
import { invokeDocumentProcessor } from '@/lib/lambda-invoker'
import { generateStoragePath, type DocumentType } from '@/lib/storage-paths'
import {
  validateSearchParameter,
  logSuspiciousSearch
} from '@/lib/security/search-validator'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'

// AWS S3 storage client
import { uploadFile, getMimeType } from '@/lib/aws-s3'

// Error details structure for LLM-generated error messages
export interface ErrorDetails {
  message: string
  suggestions: string[]
  error_type: string
  detected_type?: string
  confidence?: number
}

export interface InvoiceFilters {
  search?: string;
  status?: string;
  file_type?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  cursor?: string;
  businessId?: string;
}

export interface Invoice {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  converted_image_path?: string;
  converted_image_width?: number;
  converted_image_height?: number;
  status: 'pending' | 'uploading' | 'analyzing' | 'paid' | 'overdue' | 'disputed' | 'failed' | 'cancelled' | 'classifying' | 'classification_failed' | 'extracting' | 'processing' | 'completed';
  created_at: string;
  processed_at?: string;
  error_message?: ErrorDetails | null;
  extracted_data?: unknown;
  confidence_score?: number;
  linked_transaction?: {
    id: string;
    description: string;
    original_amount: number;
    original_currency: string;
    created_at: string;
  } | null;
}

export interface InvoicesListResponse {
  success: boolean;
  data: {
    documents: Invoice[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      has_more: boolean;
      total_pages: number;
    };
    nextCursor?: string | null;
  };
  error?: string;
}

/**
 * Convert Convex invoice to API response format
 */
function mapConvexInvoiceToResponse(invoice: {
  _id: Id<"invoices">;
  _creationTime: number;
  fileName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  convertedImagePath?: string;
  convertedImageWidth?: number;
  convertedImageHeight?: number;
  status: string;
  processedAt?: number;
  errorMessage?: unknown;
  extractedData?: unknown;
  confidenceScore?: number;
  [key: string]: unknown;
}): Invoice {
  return {
    id: invoice._id,
    file_name: invoice.fileName,
    file_type: invoice.fileType,
    file_size: invoice.fileSize,
    storage_path: invoice.storagePath,
    converted_image_path: invoice.convertedImagePath,
    converted_image_width: invoice.convertedImageWidth,
    converted_image_height: invoice.convertedImageHeight,
    status: invoice.status as Invoice['status'],
    created_at: new Date(invoice._creationTime).toISOString(),
    processed_at: invoice.processedAt ? new Date(invoice.processedAt).toISOString() : undefined,
    error_message: invoice.errorMessage as ErrorDetails | null | undefined,
    extracted_data: invoice.extractedData,
    confidence_score: invoice.confidenceScore,
    linked_transaction: null // TODO: Implement linked transaction lookup via Convex
  }
}

/**
 * Fetch invoices for the authenticated user with filtering and pagination support
 * Migrated to Convex from Supabase
 */
export async function getInvoices(filters: InvoiceFilters = {}): Promise<InvoicesListResponse> {
  const { client, userId } = await getAuthenticatedConvex()

  if (!client || !userId) {
    throw new Error('Unauthorized')
  }

  // Validate search parameter before passing to Convex
  if (filters.search) {
    const searchValidation = validateSearchParameter(filters.search, 100)

    if (!searchValidation.isValid) {
      logSuspiciousSearch(filters.search, userId)
      throw new Error(`Invalid search parameter: ${searchValidation.error}`)
    }
  }

  const limit = filters.limit || 20

  try {
    // Call Convex query
    const result = await client.query(api.functions.invoices.list, {
      businessId: filters.businessId ? filters.businessId as Id<"businesses"> : undefined,
      status: filters.status,
      limit,
      cursor: filters.cursor
    })

    // Map Convex invoices to API response format
    const documents = result.invoices.map(mapConvexInvoiceToResponse)
    const total = result.totalCount ?? documents.length
    const hasMore = result.nextCursor !== null

    return {
      success: true,
      data: {
        documents,
        pagination: {
          page: 1,
          limit,
          total,
          has_more: hasMore,
          total_pages: Math.ceil(total / limit)
        },
        nextCursor: result.nextCursor
      }
    }
  } catch (error) {
    console.error('[Invoices] Convex query failed:', error)
    throw new Error('Failed to fetch invoices')
  }
}

// Additional interfaces for CRUD operations
export interface CreateInvoiceRequest {
  file: File
  businessId: string
}

export interface UpdateDocumentRequest {
  status?: 'pending' | 'uploading' | 'analyzing' | 'paid' | 'overdue' | 'disputed' | 'failed' | 'cancelled' | 'classifying' | 'classification_failed' | 'extracting' | 'processing' | 'completed'
  extracted_data?: unknown
  error_message?: ErrorDetails | null
  confidence_score?: number
}

// File validation helpers (unchanged - pure functions)
export function validateFileType(file: File): { isValid: boolean; documentType?: string; error?: string } {
  const allowedTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'application/pdf'
  ]

  if (!allowedTypes.includes(file.type)) {
    return {
      isValid: false,
      error: `File type ${file.type} not supported. Please upload PDF, JPEG, PNG, or WebP files.`
    }
  }

  let documentType = 'unknown'
  if (file.type === 'application/pdf') {
    documentType = 'pdf'
  } else if (file.type.startsWith('image/')) {
    documentType = 'image'
  }

  return { isValid: true, documentType }
}

export async function validateFileContent(file: File): Promise<{ isValid: boolean; error?: string }> {
  // Check file size (50MB limit)
  const maxSize = 50 * 1024 * 1024
  if (file.size > maxSize) {
    return {
      isValid: false,
      error: 'File size too large. Maximum size is 50MB.'
    }
  }

  // Check minimum file size (prevent empty files or header-only attacks)
  const minSize = 100
  if (file.size < minSize) {
    return {
      isValid: false,
      error: 'File is too small or corrupted.'
    }
  }

  // Comprehensive file content validation for security
  const buffer = await file.arrayBuffer()
  const uint8Array = new Uint8Array(buffer)
  const fileSize = buffer.byteLength

  // Validate PDF files with comprehensive checks
  if (file.type === 'application/pdf') {
    const pdfMagic = [0x25, 0x50, 0x44, 0x46] // %PDF
    const hasPdfHeader = pdfMagic.every((byte, index) => uint8Array[index] === byte)

    if (!hasPdfHeader) {
      return {
        isValid: false,
        error: 'Invalid PDF file format - missing PDF header'
      }
    }

    if (fileSize > 8) {
      const versionByte = uint8Array[5]
      if (versionByte < 0x30 || versionByte > 0x39) {
        return {
          isValid: false,
          error: 'Invalid PDF version format'
        }
      }
    }

    // Look for %%EOF at the end of file
    const searchStart = Math.max(0, fileSize - 1024)
    const endSection = uint8Array.slice(searchStart)
    const eofMarker = [0x25, 0x25, 0x45, 0x4F, 0x46] // %%EOF
    let hasEofMarker = false

    for (let i = 0; i <= endSection.length - eofMarker.length; i++) {
      if (eofMarker.every((byte, index) => endSection[i + index] === byte)) {
        hasEofMarker = true
        break
      }
    }

    if (!hasEofMarker) {
      return {
        isValid: false,
        error: 'Invalid PDF file - missing EOF marker'
      }
    }
  }

  // Validate image files
  if (file.type.startsWith('image/')) {
    let isValidImage = false
    let errorMessage = 'Invalid image file format'

    // JPEG validation
    if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
      const hasJpegStart = uint8Array[0] === 0xFF && uint8Array[1] === 0xD8
      const hasJpegEnd = fileSize >= 2 &&
        uint8Array[fileSize - 2] === 0xFF &&
        uint8Array[fileSize - 1] === 0xD9

      if (hasJpegStart && hasJpegEnd) {
        isValidImage = true
      } else {
        errorMessage = 'Invalid JPEG file - missing start or end markers'
      }
    }

    // PNG validation
    else if (file.type === 'image/png') {
      const pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
      const hasPngSignature = pngSignature.every((byte, index) => uint8Array[index] === byte)

      if (hasPngSignature && fileSize > 16) {
        const ihdrMarker = [0x49, 0x48, 0x44, 0x52]
        const hasIhdr = ihdrMarker.every((byte, index) => uint8Array[12 + index] === byte)

        const iendMarker = [0x49, 0x45, 0x4E, 0x44]
        let hasIend = false
        for (let i = fileSize - 12; i >= Math.max(0, fileSize - 100); i--) {
          if (iendMarker.every((byte, index) => uint8Array[i + index] === byte)) {
            hasIend = true
            break
          }
        }

        if (hasIhdr && hasIend) {
          isValidImage = true
        } else {
          errorMessage = 'Invalid PNG file - missing required chunks'
        }
      } else {
        errorMessage = 'Invalid PNG file - malformed header'
      }
    }

    // WebP validation
    else if (file.type === 'image/webp') {
      const riffHeader = [0x52, 0x49, 0x46, 0x46]
      const webpMarker = [0x57, 0x45, 0x42, 0x50]

      const hasRiffHeader = fileSize >= 12 &&
        riffHeader.every((byte, index) => uint8Array[index] === byte)
      const hasWebpMarker = fileSize >= 12 &&
        webpMarker.every((byte, index) => uint8Array[8 + index] === byte)

      if (hasRiffHeader && hasWebpMarker) {
        isValidImage = true
      } else {
        errorMessage = 'Invalid WebP file - malformed RIFF container'
      }
    }

    if (!isValidImage) {
      return {
        isValid: false,
        error: errorMessage
      }
    }
  }

  // Security checks for all file types
  if (fileSize > 64) {
    // Check for MZ header (PE executables)
    for (let i = 0; i < Math.min(fileSize - 2, 1024); i++) {
      if (uint8Array[i] === 0x4D && uint8Array[i + 1] === 0x5A) {
        return {
          isValid: false,
          error: 'File contains executable code and is not allowed'
        }
      }
    }
  }

  // Check for suspicious script patterns
  const searchLength = Math.min(fileSize, 2048)
  const searchBytes = uint8Array.slice(0, searchLength)
  const suspiciousPatterns = [
    [0x3C, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74],
    [0x6A, 0x61, 0x76, 0x61, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74],
    [0x3C, 0x69, 0x66, 0x72, 0x61, 0x6D, 0x65],
    [0x3C, 0x6F, 0x62, 0x6A, 0x65, 0x63, 0x74]
  ]

  for (const pattern of suspiciousPatterns) {
    for (let i = 0; i <= searchLength - pattern.length; i++) {
      if (pattern.every((byte, index) => searchBytes[i + index] === byte)) {
        return {
          isValid: false,
          error: 'File contains suspicious content and is not allowed'
        }
      }
    }
  }

  return { isValid: true }
}

/**
 * Create a new invoice with file upload
 * Database: Convex, Storage: Supabase (hybrid approach)
 */
export async function createInvoice({ file, businessId }: CreateInvoiceRequest): Promise<Invoice> {
  const { client, userId } = await getAuthenticatedConvex()

  if (!client || !userId) {
    throw new Error('Unauthorized')
  }

  if (!businessId) {
    throw new Error('Business ID is required')
  }

  // Validate file
  const fileTypeValidation = validateFileType(file)
  if (!fileTypeValidation.isValid) {
    throw new Error(fileTypeValidation.error!)
  }

  const fileContentValidation = await validateFileContent(file)
  if (!fileContentValidation.isValid) {
    throw new Error(fileContentValidation.error!)
  }

  // Generate storage path
  const invoiceId = randomUUID()
  const fileExtension = file.name.split('.').pop() || 'unknown'
  const filename = `${invoiceId}.${fileExtension}`

  const storagePath = generateStoragePath({
    businessId,
    userId,
    documentType: 'invoice' as DocumentType,
    stage: 'raw',
    filename,
    documentId: invoiceId
  })

  // Create invoice record in Convex
  const convexInvoiceId = await client.mutation(api.functions.invoices.create, {
    businessId: businessId as Id<"businesses">,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    storagePath: storagePath,
    status: 'pending'
  })

  // Log the ID for debugging - helps trace ID format issues
  console.log(`[Invoice] Created invoice record: ${convexInvoiceId} (type: ${typeof convexInvoiceId})`)

  try {
    // Upload to AWS S3
    const uploadResult = await uploadFile(
      'invoices',
      storagePath,
      file,
      getMimeType(file.name)
    )

    if (!uploadResult.success) {
      console.error('[Storage] Upload failed:', uploadResult.error)
      // Don't clean up here - let the catch block handle it to avoid double cleanup
      throw new Error(`Storage upload failed: ${uploadResult.error}`)
    }

    // Note: PDF conversion is handled by Lambda during processDocument()
    // No eager conversion on upload - saves resources until processing is triggered

    // Fetch the created invoice to return
    console.log(`[Invoice] Fetching created invoice: ${convexInvoiceId}`)
    const invoice = await client.query(api.functions.invoices.getById, { id: convexInvoiceId })
    if (!invoice) {
      // This shouldn't happen - we just created the invoice
      // Could indicate auth mismatch between mutation and query
      throw new Error(`Failed to fetch created invoice: ${convexInvoiceId} - this may indicate an auth or access control issue`)
    }

    return mapConvexInvoiceToResponse(invoice)

  } catch (error) {
    // Clean up on any failure - but don't let cleanup errors mask the original error
    console.error(`[Invoice] Error during upload flow for ${convexInvoiceId}:`, error)
    try {
      await client.mutation(api.functions.invoices.softDelete, { id: convexInvoiceId })
      console.log(`[Invoice] Cleaned up invoice record: ${convexInvoiceId}`)
    } catch (cleanupError) {
      // Log cleanup error but don't let it mask the original error
      console.error(`[Invoice] Failed to clean up invoice ${convexInvoiceId}:`, cleanupError)
    }
    throw error
  }
}

/**
 * Get a single document by ID
 * Migrated to Convex from Supabase
 */
export async function getDocument(documentId: string): Promise<Invoice | null> {
  const { client } = await getAuthenticatedConvex()

  if (!client) {
    throw new Error('Unauthorized')
  }

  try {
    const invoice = await client.query(api.functions.invoices.getById, { id: documentId })

    if (!invoice) {
      return null
    }

    return mapConvexInvoiceToResponse(invoice)
  } catch (error) {
    console.error('[Document] Failed to fetch document:', error)
    return null
  }
}

/**
 * Update a document
 * Migrated to Convex from Supabase
 */
export async function updateDocument(documentId: string, updates: UpdateDocumentRequest): Promise<Invoice> {
  const { client } = await getAuthenticatedConvex()

  if (!client) {
    throw new Error('Unauthorized')
  }

  try {
    // Update status via Convex
    if (updates.status) {
      await client.mutation(api.functions.invoices.updateStatus, {
        id: documentId,
        status: updates.status,
        errorMessage: updates.error_message ?? undefined
      })
    }

    // Update other fields via Convex
    if (updates.extracted_data !== undefined || updates.confidence_score !== undefined) {
      await client.mutation(api.functions.invoices.update, {
        id: documentId,
        extractedData: updates.extracted_data,
        confidenceScore: updates.confidence_score
      })
    }

    // Fetch and return updated invoice
    const invoice = await client.query(api.functions.invoices.getById, { id: documentId })
    if (!invoice) {
      throw new Error('Invoice not found after update')
    }

    return mapConvexInvoiceToResponse(invoice)
  } catch (error) {
    console.error('[Document] Failed to update document:', error)
    throw new Error('Failed to update document')
  }
}

/**
 * Delete a document (soft delete)
 * Migrated to Convex from Supabase
 */
export async function deleteDocument(documentId: string): Promise<boolean> {
  const { client } = await getAuthenticatedConvex()

  if (!client) {
    throw new Error('Unauthorized')
  }

  try {
    await client.mutation(api.functions.invoices.softDelete, { id: documentId })
    return true
  } catch (error) {
    console.error('[Document] Failed to delete document:', error)
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Failed to delete document')
  }
}

/**
 * Process/reprocess a document with OCR
 * Database: Convex, Tasks: AWS Lambda Durable Functions
 */
export async function processDocument(documentId: string): Promise<{ jobId: string }> {
  const { client, userId } = await getAuthenticatedConvex()

  if (!client || !userId) {
    throw new Error('Unauthorized')
  }

  // Get document details
  const document = await getDocument(documentId)
  if (!document) {
    throw new Error('Document not found or access denied')
  }

  // Check OCR usage limits (still using Stripe/Supabase for billing)
  // TODO: Migrate OCR usage tracking to Convex
  try {
    // Get business ID from document or user context
    // For now, skip OCR check if we can't determine business
    console.log(`[Document] Processing document ${documentId}`)
  } catch (usageError) {
    console.warn('[Document] Could not check OCR usage:', usageError)
  }

  if (document.status === 'analyzing' || document.status === 'processing' || document.status === 'extracting') {
    throw new Error('Document is already being processed')
  }

  // Update status to processing
  await updateDocument(documentId, {
    status: 'classifying',
    error_message: null
  })

  try {
    // Use AWS Lambda Durable Functions for document processing
    return await processDocumentWithLambda(document)

  } catch (error) {
    console.error('[Document] Failed to trigger processing:', error)

    // Reset status on failure
    await updateDocument(documentId, {
      status: 'pending',
      error_message: {
        message: 'Failed to start processing',
        suggestions: ['Please try again', 'If the problem persists, contact support'],
        error_type: 'processing_failed'
      }
    })

    throw new Error('Failed to start document processing')
  }
}

/**
 * Process document using AWS Lambda Durable Functions
 * Single Lambda handles all steps with automatic checkpointing
 */
async function processDocumentWithLambda(document: Invoice): Promise<{ jobId: string }> {
  console.log(`[Document] Processing with Lambda: ${document.id}`)

  // Determine file type
  const fileType: 'pdf' | 'image' = document.file_type === 'application/pdf' ? 'pdf' : 'image'

  // Invoke Lambda with fire-and-forget (async)
  const result = await invokeDocumentProcessor({
    documentId: document.id,
    storagePath: document.storage_path,
    documentType: 'invoice',
    fileType,
    // Generate idempotency key to prevent duplicate processing
    idempotencyKey: `invoice-${document.id}-${Date.now()}`,
  })

  // Map Lambda executionId to jobId for API compatibility
  console.log(`[Document] Lambda invoked: ${result.executionId}`)
  return { jobId: result.executionId }
}

