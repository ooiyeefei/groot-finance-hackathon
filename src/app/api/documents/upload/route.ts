import { auth, currentUser } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient, getUserData } from '@/lib/supabase-server'
import { uploadRateLimiter, getClientIdentifier, applyRateLimit } from '@/lib/rate-limiter'
import { StoragePathBuilder, generateUniqueFilename, type DocumentType } from '@/lib/storage-paths'

// File validation constants
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB in bytes

// Magic byte signatures for file type validation
const MAGIC_BYTES = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  'application/pdf': [0x25, 0x50, 0x44, 0x46] // %PDF
}

/**
 * Detect document type from filename or form data
 * This will eventually be enhanced by AI classification
 */
function detectDocumentType(filename: string, formData: FormData): DocumentType {
  const lowerFilename = filename.toLowerCase()
  const explicitType = formData.get('documentType') as string

  // Check for explicit type from form
  if (explicitType && ['invoice', 'receipt', 'application_form', 'payslip', 'ic', 'other'].includes(explicitType)) {
    return explicitType as DocumentType
  }

  // Detect from filename patterns
  if (lowerFilename.includes('invoice')) return 'invoice'
  if (lowerFilename.includes('receipt')) return 'receipt'
  if (lowerFilename.includes('application') || lowerFilename.includes('form')) return 'application_form'
  if (lowerFilename.includes('payslip') || lowerFilename.includes('salary')) return 'payslip'
  if (lowerFilename.includes('identity') || lowerFilename.includes('ic') || lowerFilename.includes('mykad')) return 'ic'

  // Default to invoice for general business documents
  return 'invoice'
}

// Validate file type using magic bytes
function validateFileMagicBytes(buffer: ArrayBuffer, mimeType: string): boolean {
  const bytes = new Uint8Array(buffer)
  const expectedBytes = MAGIC_BYTES[mimeType as keyof typeof MAGIC_BYTES]
  
  if (!expectedBytes) return false
  
  // Check if the first bytes match the expected magic signature
  for (let i = 0; i < expectedBytes.length; i++) {
    if (i >= bytes.length || bytes[i] !== expectedBytes[i]) {
      return false
    }
  }
  
  return true
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Apply rate limiting
    const clientId = getClientIdentifier(request, userId)
    const rateLimit = applyRateLimit(uploadRateLimiter, clientId)
    
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Please try again later.' },
        { 
          status: 429,
          headers: rateLimit.headers
        }
      )
    }

    const user = await currentUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 401 }
      )
    }

    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid file type. Only JPG, PNG, and PDF files are allowed.' 
        },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'File too large. Maximum size is 10MB.' 
        },
        { status: 400 }
      )
    }

    const userData = await getUserData(userId)
    const supabase = await createAuthenticatedSupabaseClient(userId)

    if (!userData.business_id) {
      return NextResponse.json(
        { success: false, error: 'User not associated with a business' },
        { status: 400 }
      )
    }

    const businessId = userData.business_id

    // Detect document type
    const documentType = detectDocumentType(file.name, formData)
    console.log(`[Upload API] Detected document type: ${documentType} for file: ${file.name}`)

    // Convert file to buffer for validation
    const fileBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(fileBuffer)

    // Validate file type using magic bytes to prevent file type spoofing
    if (!validateFileMagicBytes(fileBuffer, file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: 'File type mismatch. The file content does not match the declared type.'
        },
        { status: 400 }
      )
    }

    // Step 1: Create document record first to get documentId
    const { data: documentData, error: dbError } = await supabase
      .from('documents')
      .insert({
        user_id: userData.id, // Use the actual users.id, not clerk_user_id
        business_id: businessId,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        storage_path: 'temp_pending_upload', // Temporary placeholder
        processing_status: 'pending',
        document_type: documentType, // Store detected document type
        document_metadata: {
          storage_version: '3.0', // Track new documentId-based storage format
          original_filename: file.name,
          detected_type: documentType,
          use_case: 'documents', // Context: documents/ page for invoices and general business documents
          upload_context: {
            page: 'documents',
            description: 'General business document upload for invoices and financial records'
          }
        }
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database insert error:', dbError)
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to create document record'
        },
        { status: 500 }
      )
    }

    // Step 2: Generate storage path with documentId
    const storageBuilder = new StoragePathBuilder(businessId, userData.id, undefined, documentData.id)
    const uniqueFilename = generateUniqueFilename(file.name)
    const storagePath = storageBuilder.forDocument(documentType).raw(uniqueFilename)

    console.log(`[Upload API] Generated storage path with documentId: ${storagePath}`)

    // Step 3: Upload to Supabase Storage with documentId-based path
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)

      // Clean up document record if upload fails
      await supabase.from('documents').delete().eq('id', documentData.id)

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to upload file to storage'
        },
        { status: 500 }
      )
    }

    // Step 4: Update document record with final storage path
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        storage_path: uploadData.path,
        processing_status: 'pending'
      })
      .eq('id', documentData.id)

    if (updateError) {
      console.error('Database update error:', updateError)

      // Clean up uploaded file if database update fails
      await supabase.storage
        .from('documents')
        .remove([storagePath])

      // Clean up document record
      await supabase.from('documents').delete().eq('id', documentData.id)

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to update document record with storage path'
        },
        { status: 500 }
      )
    }

    // Return success response
    return NextResponse.json({
      success: true,
      data: {
        id: documentData.id,
        fileName: documentData.file_name,
        fileSize: documentData.file_size,
        fileType: documentData.file_type,
        status: documentData.processing_status
      }
    })

  } catch (error) {
    console.error('Upload API error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error' 
      },
      { status: 500 }
    )
  }
}