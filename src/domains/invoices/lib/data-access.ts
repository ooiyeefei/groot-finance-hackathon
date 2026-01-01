import { createBusinessContextSupabaseClient, getUserData } from '@/lib/db/supabase-server'
import { auth } from '@clerk/nextjs/server'
import { tasks } from "@trigger.dev/sdk/v3"
import { randomUUID } from 'crypto'
import { generateStoragePath, type DocumentType } from '@/lib/storage-paths'
import {
  validateSearchParameter,
  createSafeILikePattern,
  logSuspiciousSearch
} from '@/lib/security/search-validator'
import { withCache, CACHE_TTL } from '@/lib/cache/api-cache'
import { checkOcrUsage } from '@/lib/stripe/usage'

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
  status: 'pending' | 'uploading' | 'analyzing' | 'paid' | 'overdue' | 'disputed' | 'failed' | 'cancelled' | 'classifying' | 'classification_failed';
  created_at: string;
  processed_at?: string;
  error_message?: ErrorDetails | null;
  extracted_data?: any;
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
 * Fetch invoices for the authenticated user with filtering and pagination support
 * Migrated from /api/invoices/list endpoint
 */
export async function getInvoices(filters: InvoiceFilters = {}): Promise<InvoicesListResponse> {
  // Check authentication
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  // SECURITY: Get user data with business context for proper tenant isolation
  const userData = await getUserData(userId)
  const supabase = await createBusinessContextSupabaseClient()

  // Use RPC function to perform JOIN at database level (eliminates N+1 query)
  // This reduces 2 database round-trips to 1, saving 300-800ms per list fetch

  // Validate search parameter before passing to RPC
  let sanitizedSearch: string | null = null
  if (filters.search) {
    const searchValidation = validateSearchParameter(filters.search, 100)

    if (!searchValidation.isValid) {
      // Log suspicious search attempt
      logSuspiciousSearch(filters.search, userData.id)
      throw new Error(`Invalid search parameter: ${searchValidation.error}`)
    }

    // Use sanitized value for RPC
    sanitizedSearch = searchValidation.sanitizedValue
  }

  // Apply pagination
  const limit = filters.limit || 20

  // Validate business context for multi-tenant isolation
  if (!userData.business_id) {
    throw new Error('Business context required - no active business selected')
  }

  // ⚡ PERFORMANCE: Cache the RPC result to avoid repeated database calls
  const rpcParams = {
    p_user_id: userData.id,
    p_business_id: userData.business_id,  // Multi-tenant isolation
    p_status: filters.status || null,
    p_file_type: filters.file_type || null,
    p_date_from: filters.date_from || null,
    p_date_to: filters.date_to || null,
    p_search: sanitizedSearch,
    p_limit: limit,
    p_cursor: filters.cursor || null
  };

  const rpcResult = await withCache(
    userId,
    'invoices',
    async () => {
      const { data, error } = await supabase.rpc('get_invoices_with_linked_transactions', rpcParams);
      if (error) {
        console.error('Database RPC error:', error);
        throw new Error('Failed to fetch invoices');
      }
      return data;
    },
    {
      params: rpcParams,
      ttlMs: CACHE_TTL.INVOICES_LIST,
      // Skip cache for searches or when cursor pagination is used
      skipCache: !!(filters.search || filters.cursor)
    }
  );

  // Parse RPC result (returns JSON with documents and total_count)
  const { documents: processedInvoices, total_count: totalCount } = rpcResult || { documents: [], total_count: 0 }

  // Calculate pagination metadata
  const total = totalCount || 0
  const hasMore = processedInvoices.length === limit
  const nextCursor = hasMore && processedInvoices.length > 0
    ? processedInvoices[processedInvoices.length - 1].created_at
    : null

  return {
    success: true,
    data: {
      documents: processedInvoices,
      pagination: {
        page: 1, // Simplified for cursor-based pagination
        limit,
        total,
        has_more: hasMore,
        total_pages: Math.ceil(total / limit)
      },
      nextCursor
    }
  }
}

// Additional interfaces for CRUD operations
export interface CreateInvoiceRequest {
  file: File
  businessId: string
}

export interface UpdateDocumentRequest {
  status?: 'pending' | 'uploading' | 'analyzing' | 'paid' | 'overdue' | 'disputed' | 'failed' | 'cancelled' | 'classifying' | 'classification_failed'
  extracted_data?: any
  error_message?: ErrorDetails | null
  confidence_score?: number
}

// File validation helpers
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

  // Determine document type
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
  const minSize = 100 // 100 bytes minimum
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
    // Check PDF magic bytes
    const pdfMagic = [0x25, 0x50, 0x44, 0x46] // %PDF
    const hasPdfHeader = pdfMagic.every((byte, index) => uint8Array[index] === byte)

    if (!hasPdfHeader) {
      return {
        isValid: false,
        error: 'Invalid PDF file format - missing PDF header'
      }
    }

    // Check for PDF version after %PDF
    if (fileSize > 8) {
      const versionByte = uint8Array[5]
      if (versionByte < 0x30 || versionByte > 0x39) { // ASCII '0' to '9'
        return {
          isValid: false,
          error: 'Invalid PDF version format'
        }
      }
    }

    // Look for %%EOF at the end of file (within last 1024 bytes)
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

  // Validate image files with comprehensive checks
  if (file.type.startsWith('image/')) {
    let isValidImage = false
    let errorMessage = 'Invalid image file format'

    // JPEG validation
    if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
      // Check JPEG SOI (Start of Image) marker
      const hasJpegStart = uint8Array[0] === 0xFF && uint8Array[1] === 0xD8

      // Check JPEG EOI (End of Image) marker at the end
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
      // Check PNG signature (8 bytes)
      const pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
      const hasPngSignature = pngSignature.every((byte, index) => uint8Array[index] === byte)

      // Check for IHDR chunk (must be first chunk after signature)
      if (hasPngSignature && fileSize > 16) {
        const ihdrMarker = [0x49, 0x48, 0x44, 0x52] // 'IHDR'
        const hasIhdr = ihdrMarker.every((byte, index) => uint8Array[12 + index] === byte)

        // Check for IEND chunk at the end
        const iendMarker = [0x49, 0x45, 0x4E, 0x44] // 'IEND'
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
      // Check RIFF container
      const riffHeader = [0x52, 0x49, 0x46, 0x46] // 'RIFF'
      const webpMarker = [0x57, 0x45, 0x42, 0x50] // 'WEBP'

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

  // Additional security checks for all file types

  // Check for embedded executables (PE header)
  if (fileSize > 64) {
    // Look for MZ header (PE executables) - common in malicious files
    for (let i = 0; i < Math.min(fileSize - 2, 1024); i++) {
      if (uint8Array[i] === 0x4D && uint8Array[i + 1] === 0x5A) { // 'MZ'
        return {
          isValid: false,
          error: 'File contains executable code and is not allowed'
        }
      }
    }
  }

  // Check for suspicious script patterns in the first 2KB
  const searchLength = Math.min(fileSize, 2048)
  const searchBytes = uint8Array.slice(0, searchLength)
  const suspiciousPatterns = [
    [0x3C, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74], // '<script'
    [0x6A, 0x61, 0x76, 0x61, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74], // 'javascript'
    [0x3C, 0x69, 0x66, 0x72, 0x61, 0x6D, 0x65], // '<iframe'
    [0x3C, 0x6F, 0x62, 0x6A, 0x65, 0x63, 0x74] // '<object'
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
 * Migrated from /api/invoices/upload endpoint
 */
export async function createInvoice({ file, businessId }: CreateInvoiceRequest): Promise<Invoice> {
  // Authentication
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  const userData = await getUserData(userId)
  const supabase = await createBusinessContextSupabaseClient()

  // Validate business context
  if (!businessId) {
    throw new Error('Business ID is required')
  }

  // Validate business ownership or membership
  const { data: businessAccess, error: businessError } = await supabase
    .from('business_memberships')
    .select('business_id, role')
    .eq('business_id', businessId)
    .eq('user_id', userData.id)
    .single()

  if (businessError || !businessAccess) {
    throw new Error('Unauthorized access to business')
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

  // Generate storage path using standardized paths
  const invoiceId = randomUUID()
  const fileExtension = file.name.split('.').pop() || 'unknown'
  const filename = `${invoiceId}.${fileExtension}`

  // Use standardized storage path with 'raw' stage for initial upload
  const storagePath = generateStoragePath({
    businessId,
    userId: userData.id,
    documentType: 'invoice' as DocumentType,
    stage: 'raw',
    filename,
    documentId: invoiceId
  })

  // Create invoice record with storage_path (following working expense-claims pattern)
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .insert({
      id: invoiceId, // Set explicit ID to match storage path
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      storage_path: storagePath, // Include storage_path in initial insert
      status: 'pending',
      user_id: userData.id,
      business_id: businessId
      // Removed document_type - column being dropped, value stored in document_metadata instead
    })
    .select()
    .single()

  if (invoiceError || !invoice) {
    console.error('[Invoice] Failed to create invoice record:', invoiceError)
    throw new Error('Failed to create invoice record')
  }

  try {
    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('invoices')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (uploadError) {
      console.error('[Storage] Upload failed:', uploadError)

      // Clean up invoice record on upload failure
      await supabase.from('invoices').delete().eq('id', invoice.id)
      throw new Error(`Storage upload failed: ${uploadError.message}`)
    }

    // If uploaded file is PDF, trigger PDF to image conversion
    if (file.type === 'application/pdf') {
      try {
        await tasks.trigger("convert-pdf-to-image", {
          documentId: invoice.id,
          pdfStoragePath: storagePath,
          documentDomain: 'invoices'
        })
      } catch (conversionError) {
        console.error('[PDF Conversion] Failed to trigger conversion:', conversionError)
        // Don't throw error - invoice creation was successful, conversion can be retried later
      }
    }

    return invoice

  } catch (error) {
    // Clean up on any failure
    await supabase.from('invoices').delete().eq('id', invoice.id)
    throw error
  }
}

/**
 * Get a single document by ID
 * Migrated from /api/invoices/[invoiceId] GET endpoint
 */
export async function getDocument(documentId: string): Promise<Invoice | null> {
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  const userData = await getUserData(userId)
  const supabase = await createBusinessContextSupabaseClient()

  const { data: document, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', documentId)
    .eq('user_id', userData.id)
    .is('deleted_at', null)
    .single()

  if (error) {
    console.error('[Document] Failed to fetch document:', error)
    return null
  }

  // Return document with linked_transaction as null for now
  // TODO: Fetch linked accounting entries separately if needed
  return {
    ...document,
    linked_transaction: null
  } as Invoice
}

/**
 * Update a document
 * Migrated from /api/invoices/[invoiceId] PUT endpoint
 */
export async function updateDocument(documentId: string, updates: UpdateDocumentRequest): Promise<Invoice> {
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  const userData = await getUserData(userId)
  const supabase = await createBusinessContextSupabaseClient()

  const { data: document, error } = await supabase
    .from('invoices')
    .update({
      ...updates,
      processed_at: updates.status === 'paid' ? new Date().toISOString() : undefined
    })
    .eq('id', documentId)
    .eq('user_id', userData.id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    console.error('[Document] Failed to update document:', error)
    throw new Error('Failed to update document')
  }

  return document
}

/**
 * Delete a document (soft delete)
 * Migrated from /api/invoices/[invoiceId] DELETE endpoint
 */
export async function deleteDocument(documentId: string): Promise<boolean> {
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  const userData = await getUserData(userId)
  const supabase = await createBusinessContextSupabaseClient()

  // First check if document exists and user owns it
  const { data: document, error: fetchError } = await supabase
    .from('invoices')
    .select('id, storage_path')
    .eq('id', documentId)
    .eq('user_id', userData.id)
    .is('deleted_at', null)
    .single()

  if (fetchError || !document) {
    console.error('[Document] Document not found or access denied:', fetchError)
    throw new Error('Document not found or access denied')
  }

  // Check if document has linked accounting entries (excluding soft-deleted ones)
  const { data: linkedEntries } = await supabase
    .from('accounting_entries')
    .select('id')
    .eq('source_record_id', documentId)
    .is('deleted_at', null)

  if (linkedEntries && linkedEntries.length > 0) {
    throw new Error('Cannot delete document that has linked transactions. Please delete the transaction first.')
  }

  // Perform soft delete by setting deleted_at timestamp
  const { error: deleteError } = await supabase
    .from('invoices')
    .update({
      deleted_at: new Date().toISOString()
    })
    .eq('id', documentId)
    .eq('user_id', userData.id)

  if (deleteError) {
    console.error('[Document] Failed to delete document:', deleteError)
    throw new Error('Failed to delete document')
  }

  // Note: We keep the file in storage for audit purposes
  // This follows the pattern from the original implementation
  return true
}

/**
 * Process/reprocess a document with OCR
 * Migrated from /api/documents/[documentId]/process endpoint
 */
export async function processDocument(documentId: string): Promise<{ jobId: string }> {
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  const userData = await getUserData(userId)
  const supabase = await createBusinessContextSupabaseClient()

  // Check OCR usage limits before processing (soft-block)
  if (userData.business_id) {
    const usageCheck = await checkOcrUsage(userData.business_id)
    if (!usageCheck.canUse) {
      throw new Error(
        `OCR limit reached (${usageCheck.used}/${usageCheck.limit} scans used this month). ` +
        `Please upgrade your plan to continue processing documents.`
      )
    }
    console.log(`[Document] OCR usage check passed: ${usageCheck.used}/${usageCheck.limit ?? 'unlimited'}`)
  }

  // Verify document ownership and get document details
  const document = await getDocument(documentId)
  if (!document) {
    throw new Error('Document not found or access denied')
  }

  if (document.status === 'analyzing') {
    throw new Error('Document is already being processed')
  }

  // Update status to analyzing
  await updateDocument(documentId, {
    status: 'analyzing',
    error_message: null
  })

  try {
    // Check file type to determine appropriate processing workflow
    if (document.file_type === 'application/pdf') {
      // PDF files need conversion first, then classification -> OCR
      const handle = await tasks.trigger("convert-pdf-to-image", {
        documentId: document.id,
        pdfStoragePath: document.storage_path!,
        documentDomain: 'invoices'
      })

      return { jobId: handle.id }

    } else {
      // Image files go through classification first for document type validation
      const handle = await tasks.trigger("classify-document", {
        documentId: document.id,
        documentDomain: 'invoices'
      })

      return { jobId: handle.id }
    }

  } catch (error) {
    console.error('[Document] Failed to trigger OCR processing:', error)

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