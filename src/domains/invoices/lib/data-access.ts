import { createBusinessContextSupabaseClient, getUserData } from '@/lib/db/supabase-server'
import { auth } from '@clerk/nextjs/server'
import { tasks } from "@trigger.dev/sdk/v3"
import { processDocumentOCR } from "@/trigger/process-document-ocr"
import { convertPdfToImage } from "@/trigger/convert-pdf-to-image"
import { randomUUID } from 'crypto'
import { generateStoragePath, type DocumentType } from '@/lib/storage-paths'

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
  processing_status: 'pending' | 'processing' | 'ocr_processing' | 'completed' | 'failed';
  created_at: string;
  processed_at?: string;
  error_message?: string;
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

  console.log('[Data Access] Get invoices - User ID:', userData.id, 'Filters:', filters)

  // Build query with filters
  let query = supabase
    .from('invoices')
    .select(`
      id, file_name, file_type, file_size, storage_path, converted_image_path, converted_image_width, converted_image_height, processing_status, created_at, processed_at, error_message, extracted_data, confidence_score,
      accounting_entries:accounting_entries!source_record_id!left (
        id, description, original_amount, original_currency, created_at, deleted_at
      )
    `)
    .eq('user_id', userData.id) // SECURITY FIX: Use validated Supabase UUID
    .is('deleted_at', null)

  // Apply status filter
  if (filters.status) {
    query = query.eq('processing_status', filters.status)
  }

  // Apply file type filter
  if (filters.file_type) {
    query = query.eq('file_type', filters.file_type)
  }

  // Apply date range filters
  if (filters.date_from) {
    query = query.gte('created_at', filters.date_from)
  }
  if (filters.date_to) {
    query = query.lte('created_at', filters.date_to)
  }

  // Apply search filter (search in file_name)
  if (filters.search) {
    query = query.ilike('file_name', `%${filters.search}%`)
  }

  // Apply pagination
  const limit = filters.limit || 20
  query = query.limit(limit)

  // Apply cursor-based pagination if provided
  if (filters.cursor) {
    query = query.lt('created_at', filters.cursor)
  }

  // Order by creation date (newest first) - maintain existing behavior
  query = query.order('created_at', { ascending: false })

  const { data: invoices, error } = await query

  if (error) {
    console.error('Database error:', error)
    throw new Error('Failed to fetch invoices')
  }

  // Process invoices to include linked accounting entry data (excluding soft-deleted entries)
  const processedInvoices: Invoice[] = (invoices || []).map((invoice: any) => {
    // Filter out soft-deleted accounting entries
    const activeEntries = invoice.accounting_entries?.filter((entry: any) => !entry.deleted_at) || []

    return {
      ...invoice,
      linked_transaction: activeEntries.length > 0 ? activeEntries[0] : null,
      accounting_entries: undefined // Remove the raw accounting_entries array from the response
    }
  })

  // Get total count for pagination (simplified - in production this would be optimized)
  let totalQuery = supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userData.id)
    .is('deleted_at', null)

  // Apply same filters for count
  if (filters.status) {
    totalQuery = totalQuery.eq('processing_status', filters.status)
  }
  if (filters.file_type) {
    totalQuery = totalQuery.eq('file_type', filters.file_type)
  }
  if (filters.date_from) {
    totalQuery = totalQuery.gte('created_at', filters.date_from)
  }
  if (filters.date_to) {
    totalQuery = totalQuery.lte('created_at', filters.date_to)
  }
  if (filters.search) {
    totalQuery = totalQuery.ilike('file_name', `%${filters.search}%`)
  }

  const { count: totalCount } = await totalQuery

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
  processing_status?: 'pending' | 'processing' | 'completed' | 'failed' | 'ocr_processing'
  extracted_data?: any
  error_message?: string
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

  // Magic byte validation for security
  const buffer = await file.arrayBuffer()
  const uint8Array = new Uint8Array(buffer)

  // Check PDF magic bytes
  if (file.type === 'application/pdf') {
    const pdfMagic = [0x25, 0x50, 0x44, 0x46] // %PDF
    const matches = pdfMagic.every((byte, index) => uint8Array[index] === byte)
    if (!matches) {
      return {
        isValid: false,
        error: 'Invalid PDF file format'
      }
    }
  }

  // Check image magic bytes
  if (file.type.startsWith('image/')) {
    const isJPEG = uint8Array[0] === 0xFF && uint8Array[1] === 0xD8
    const isPNG = uint8Array[0] === 0x89 && uint8Array[1] === 0x50 && uint8Array[2] === 0x4E && uint8Array[3] === 0x47
    const isWebP = uint8Array[8] === 0x57 && uint8Array[9] === 0x45 && uint8Array[10] === 0x42 && uint8Array[11] === 0x50

    if (!isJPEG && !isPNG && !isWebP) {
      return {
        isValid: false,
        error: 'Invalid image file format'
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
    console.error('[Business] User not authorized for business:', businessError)
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
      processing_status: 'pending',
      user_id: userData.id,
      business_id: businessId,
      document_type: 'invoice' // Fixed: Use 'invoice' for invoices table
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

    console.log(`[Invoice] Successfully created: ${invoice.id} at ${storagePath}`)

    // If uploaded file is PDF, trigger PDF to image conversion
    if (file.type === 'application/pdf') {
      try {
        console.log(`[PDF Conversion] Triggering PDF to image conversion for: ${invoice.id}`)
        await tasks.trigger<typeof convertPdfToImage>("convert-pdf-to-image", {
          documentId: invoice.id,
          pdfStoragePath: storagePath,
          documentDomain: 'invoices'
        })
        console.log(`[PDF Conversion] Successfully triggered conversion job for: ${invoice.id}`)
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
    .select(`
      *,
      accounting_entries:accounting_entries!source_record_id!left (
        id, description, original_amount, original_currency, created_at, deleted_at
      )
    `)
    .eq('id', documentId)
    .eq('user_id', userData.id)
    .is('deleted_at', null)
    .single()

  if (error) {
    console.error('[Document] Failed to fetch document:', error)
    return null
  }

  // Process linked transaction data (excluding soft-deleted entries)
  const docData = document as any
  const activeEntries = docData.accounting_entries?.filter((entry: any) => !entry.deleted_at) || []

  return {
    ...docData,
    linked_transaction: activeEntries.length > 0 ? activeEntries[0] : null,
    accounting_entries: undefined // Remove raw accounting_entries from response
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
      processed_at: updates.processing_status === 'completed' ? new Date().toISOString() : undefined
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
    .select(`
      id, storage_path,
      accounting_entries:accounting_entries!source_record_id!left(id, deleted_at)
    `)
    .eq('id', documentId)
    .eq('user_id', userData.id)
    .is('deleted_at', null)
    .single()

  if (fetchError || !document) {
    console.error('[Document] Document not found or access denied:', fetchError)
    throw new Error('Document not found or access denied')
  }

  // Check if document has linked transactions (excluding soft-deleted ones)
  const docData = document as any
  const activeAccountingEntries = docData.accounting_entries?.filter((entry: any) => !entry.deleted_at) || []

  if (activeAccountingEntries.length > 0) {
    console.warn('[Document] Cannot delete document with active linked transactions:', documentId)
    console.warn('[Document] Active transaction IDs:', activeAccountingEntries.map((e: any) => e.id))
    throw new Error('Cannot delete document that has linked transactions. Please delete the transaction first.')
  }

  console.log(`[Document] No active linked transactions found - proceeding with soft delete for: ${documentId}`)

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
  console.log(`[Document] Successfully soft-deleted: ${documentId}`)
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

  // Verify document ownership and get document details
  const document = await getDocument(documentId)
  if (!document) {
    throw new Error('Document not found or access denied')
  }

  if (document.processing_status === 'processing' || document.processing_status === 'ocr_processing') {
    throw new Error('Document is already being processed')
  }

  // Update status to processing
  await updateDocument(documentId, {
    processing_status: 'processing',
    error_message: undefined
  })

  try {
    // Check file type to determine appropriate processing workflow
    if (document.file_type === 'application/pdf') {
      // PDF files need conversion first, then classification -> OCR
      console.log(`[Document] PDF detected - triggering PDF to image conversion for: ${documentId}`)

      const handle = await tasks.trigger<typeof convertPdfToImage>("convert-pdf-to-image", {
        documentId: document.id,
        pdfStoragePath: document.storage_path!,
        documentDomain: 'invoices'
      })

      console.log(`[Document] Triggered PDF conversion for ${documentId}, job: ${handle.id}`)
      return { jobId: handle.id }

    } else {
      // Image files can go directly to OCR processing
      console.log(`[Document] Image detected - triggering direct OCR processing for: ${documentId}`)

      const handle = await tasks.trigger<typeof processDocumentOCR>("process-document-ocr", {
        documentId: document.id,
        imageStoragePath: document.storage_path!,
        documentDomain: 'invoices'
      })

      console.log(`[Document] Triggered OCR processing for ${documentId}, job: ${handle.id}`)
      return { jobId: handle.id }
    }

  } catch (error) {
    console.error('[Document] Failed to trigger OCR processing:', error)

    // Reset status on failure
    await updateDocument(documentId, {
      processing_status: 'pending',
      error_message: 'Failed to start processing'
    })

    throw new Error('Failed to start document processing')
  }
}