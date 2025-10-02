/**
 * Expense Claims Receipt Upload API
 * Creates expense claim record directly with processing status tracking
 * Unlike documents API, this creates expense_claims records that go through the workflow
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { ensureEmployeeProfile } from '@/lib/ensure-employee-profile'
import { tasks } from '@trigger.dev/sdk/v3'
import {
  mapExpenseCategoryToAccounting,
  getBusinessExpenseCategory,
  isValidExpenseCategory
} from '@/lib/expense-category-mapper'
import { StoragePathBuilder, generateUniqueFilename } from '@/lib/storage-paths'

// Simple in-memory deduplication store (in production, use Redis)
const recentRequests = new Map<string, number>()

// Upload and process expense receipt (Mel's mobile-first approach)
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('receipt') as File
    const businessPurpose = formData.get('business_purpose') as string
    const expenseCategory = formData.get('expense_category') as string

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'Receipt file is required' },
        { status: 400 }
      )
    }

    // Smart DSPy workflow: business_purpose and expense_category are optional for auto-categorization
    if (!businessPurpose && !expenseCategory) {
      return NextResponse.json(
        { success: false, error: 'Either business purpose or expense category must be provided' },
        { status: 400 }
      )
    }

    // Validate file type and size
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Only JPEG, PNG, WebP, and PDF are allowed' },
        { status: 400 }
      )
    }

    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: 'File size must be less than 10MB' },
        { status: 400 }
      )
    }

    const supabase = await createAuthenticatedSupabaseClient(userId)
    const serviceSupabase = createServiceSupabaseClient()

    // Get employee profile
    const employeeProfile = await ensureEmployeeProfile(userId)
    if (!employeeProfile) {
      return NextResponse.json(
        { success: false, error: 'Failed to create employee profile' },
        { status: 500 }
      )
    }

    // Smart DSPy categorization: Handle 'auto' flag for DSPy auto-categorization
    let useAutoCategorization = false
    let categoryInfo = null
    let accountingCategory = null

    if (expenseCategory === 'auto') {
      // Use DSPy auto-categorization with business categories
      useAutoCategorization = true
      console.log(`[Expense Receipt API] Using DSPy auto-categorization for business ${employeeProfile.business_id}`)
    } else if (expenseCategory) {
      // Validate provided expense category against business-specific categories
      const isValidCategory = await isValidExpenseCategory(employeeProfile.business_id, expenseCategory)
      if (!isValidCategory) {
        return NextResponse.json(
          { success: false, error: `Invalid expense category: ${expenseCategory}. Please use a valid category for your business.` },
          { status: 400 }
        )
      }

      // Get category details for proper accounting mapping
      categoryInfo = await getBusinessExpenseCategory(employeeProfile.business_id, expenseCategory)
      accountingCategory = categoryInfo?.accounting_category || mapExpenseCategoryToAccounting(expenseCategory)
    } else {
      // No category provided, use auto-categorization
      useAutoCategorization = true
    }

    console.log(`[Expense Receipt API] Processing receipt upload for user ${userId}`)
    console.log(`[Expense Receipt API] File: ${file.name}, Category: ${expenseCategory}`)

    // Step 1: Create document record first for receipt to get documentId
    const { data: documentData, error: docError } = await serviceSupabase
      .from('documents')
      .insert({
        user_id: userId,
        business_id: employeeProfile.business_id,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        storage_path: 'temp_pending_upload', // Temporary placeholder
        processing_status: 'pending',
        document_type: 'receipt', // Use standard 'receipt' instead of 'expense_receipts'
        document_metadata: {
          storage_version: '3.0', // Track new documentId-based storage format
          original_filename: file.name,
          detected_type: 'receipt',
          use_case: 'expense_claims', // Context: expense-claims/ page for expense receipts
          upload_context: {
            page: 'expense-claims',
            description: 'Expense receipt upload for claims and reimbursements'
          },
          expense_context: {
            business_purpose: businessPurpose,
            expense_category: expenseCategory,
            use_auto_categorization: useAutoCategorization
          }
        }
      })
      .select()
      .single()

    if (docError) {
      console.error('[Expense Receipt API] Failed to create document record:', docError)
      return NextResponse.json(
        { success: false, error: 'Failed to create document record' },
        { status: 500 }
      )
    }

    // Step 2: Generate standardized storage path with documentId
    const storageBuilder = new StoragePathBuilder(employeeProfile.business_id, userId, undefined, documentData.id)
    const uniqueFilename = generateUniqueFilename(file.name, 'expense-receipt')
    const filePath = storageBuilder.forDocument('receipt').raw(uniqueFilename)

    console.log(`[Expense Receipt API] Generated storage path with documentId: ${filePath}`)

    // Step 3: Upload to Supabase Storage with documentId-based path
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (uploadError) {
      console.error('[Expense Receipt Upload API] Storage upload failed:', uploadError)

      // Clean up document record if upload fails
      await serviceSupabase.from('documents').delete().eq('id', documentData.id)

      return NextResponse.json(
        { success: false, error: 'Failed to upload file' },
        { status: 500 }
      )
    }

    // Step 4: Update document record with final storage path
    const { error: pathUpdateError } = await serviceSupabase
      .from('documents')
      .update({
        storage_path: filePath,
        processing_status: 'pending'
      })
      .eq('id', documentData.id)

    if (pathUpdateError) {
      console.error('[Expense Receipt API] Failed to update storage path:', pathUpdateError)

      // Clean up uploaded file and document record
      await supabase.storage.from('documents').remove([filePath])
      await serviceSupabase.from('documents').delete().eq('id', documentData.id)

      return NextResponse.json(
        { success: false, error: 'Failed to update document storage path' },
        { status: 500 }
      )
    }

    // Get user's home currency from users table
    const { data: userProfile, error: userError } = await supabase
      .from('users')
      .select('home_currency')
      .eq('clerk_user_id', userId)
      .single()

    const userHomeCurrency = userProfile?.home_currency || 'SGD'

    // Create preliminary transaction record (will be updated when DSPy processing completes)
    const transactionData = {
      user_id: userId,
      transaction_type: 'expense',
      category: useAutoCategorization ? 'administrative_expenses' : accountingCategory, // Placeholder for auto, actual for manual
      subcategory: useAutoCategorization ? 'auto_pending' : expenseCategory, // Placeholder for auto
      description: `Expense from ${file.name}`,
      original_currency: userHomeCurrency, // Will be updated from OCR if different
      original_amount: 0, // Will be updated from OCR
      home_currency: userHomeCurrency,
      home_currency_amount: 0,
      exchange_rate: 1,
      exchange_rate_date: new Date().toISOString().split('T')[0],
      transaction_date: new Date().toISOString().split('T')[0], // Will be updated from OCR
      status: 'pending', // Start with pending status (will be synced by trigger)
      created_by_method: 'document_extract',
      processing_metadata: {
        expense_category: useAutoCategorization ? 'auto_pending' : expenseCategory,
        business_purpose: businessPurpose || 'Auto-extracted from receipt',
        employee_profile_id: employeeProfile.id,
        created_via: 'expense_receipt_upload',
        file_path: filePath,
        file_name: file.name,
        processing_stage: 'ocr_extraction',
        use_auto_categorization: useAutoCategorization,
        category_mapping: useAutoCategorization ? null : {
          business_category: expenseCategory,
          accounting_category: accountingCategory,
          category_name: categoryInfo?.business_category_name
        }
      }
    }

    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .insert(transactionData)
      .select()
      .single()

    if (transactionError || !transaction) {
      console.error('[Expense Receipt API] Failed to create transaction:', transactionError)

      // Cleanup uploaded file
      await supabase.storage
        .from('documents')
        .remove([filePath])

      return NextResponse.json(
        { success: false, error: 'Failed to create transaction record' },
        { status: 500 }
      )
    }

    // Create expense claim record with processing status
    const claimMonth = new Date().toISOString().split('T')[0].substring(0, 7) + '-01' // YYYY-MM-01

    const expenseClaimData = {
      transaction_id: transaction.id,
      employee_id: employeeProfile.id,
      business_id: employeeProfile.business_id,
      status: 'draft', // Start in draft status
      business_purpose: businessPurpose || 'Auto-extracting from receipt...',
      business_purpose_details: {
        category_reason: businessPurpose || 'Auto-extracting from receipt...',
        file_upload: {
          original_filename: file.name,
          file_path: filePath,
          file_size: file.size,
          file_type: file.type,
          document_id: documentData.id // Link to document record
        },
        processing_source: 'receipt_upload',
        use_auto_categorization: useAutoCategorization
      },
      expense_category: useAutoCategorization ? 'auto_pending' : expenseCategory,
      claim_month: claimMonth,
      risk_score: 0, // Will be calculated after OCR
      current_approver_id: null,

      // Processing status fields (new)
      processing_status: 'processing',
      processing_started_at: new Date().toISOString(),
      processing_metadata: {
        file_info: {
          name: file.name,
          size: file.size,
          type: file.type,
          path: filePath,
          document_id: documentData.id // Link to document record
        },
        extraction_method: 'dspy',
        processing_stage: 'ocr_extraction',
        use_auto_categorization: useAutoCategorization,
        started_at: new Date().toISOString()
      }
    }

    const { data: expenseClaim, error: claimError } = await serviceSupabase
      .from('expense_claims')
      .insert(expenseClaimData)
      .select()
      .single()

    if (claimError || !expenseClaim) {
      console.error('[Expense Receipt API] Failed to create expense claim:', claimError)

      // Cleanup uploaded file and transaction
      await supabase.storage
        .from('documents')
        .remove([filePath])

      return NextResponse.json(
        { success: false, error: 'Failed to create expense claim record' },
        { status: 500 }
      )
    }

    console.log(`[Expense Receipt API] Created expense claim ${expenseClaim.id} for receipt processing`)

    // Prepare image data for DSPy processing
    const fileBuffer = await file.arrayBuffer()
    const fileBase64 = Buffer.from(fileBuffer).toString('base64')
    const receiptImageData = {
      base64: fileBase64,
      mimeType: file.type,
      filename: file.name
    }

    // Generate deduplication key
    const idempotentKey = `expense-receipt-v1-${userId}-${file.name}-${file.size}`
    const now = Date.now()

    // Check for duplicates
    const existingTime = recentRequests.get(idempotentKey)
    if (existingTime && (now - existingTime) < 30 * 1000) {
      console.log(`[Expense Receipt API] Duplicate request detected - returning existing claim`)
      return NextResponse.json({
        success: true,
        data: {
          expense_claim_id: expenseClaim.id,
          transaction_id: transaction.id,
          processing_status: 'processing',
          task_id: `duplicate-${idempotentKey}`,
          message: 'Processing receipt data...'
        }
      })
    }

    recentRequests.set(idempotentKey, now)
    const requestId = `${idempotentKey}-${now}`

    // Trigger DSPy extraction with expense claim context and business categories
    try {
      const taskHandle = await tasks.trigger('dspy-receipt-extraction', {
        receiptText: null,
        receiptImageData: receiptImageData,
        receiptImageUrl: null,
        expenseClaimId: expenseClaim.id, // Pass expense claim ID instead of document ID
        transactionId: transaction.id,
        userId,
        businessPurpose: businessPurpose || 'Auto-extracting from receipt...',
        expenseCategory: useAutoCategorization ? 'auto' : expenseCategory,
        useAutoCategorization: useAutoCategorization,
        imageMetadata: {
          confidence: 0.85,
          quality: 'good',
          textLength: 0
        },
        forcedProcessingMethod: 'auto',
        requestId
      })

      console.log(`[Expense Receipt API] DSPy task triggered: ${taskHandle.id}`)

      // Update expense claim with task ID for polling
      await serviceSupabase
        .from('expense_claims')
        .update({
          processing_metadata: {
            ...expenseClaimData.processing_metadata,
            task_id: requestId,
            trigger_task_id: taskHandle.id,
            started_at: new Date().toISOString()
          }
        })
        .eq('id', expenseClaim.id)

      // Log audit event
      await serviceSupabase
        .from('audit_events')
        .insert({
          business_id: employeeProfile.business_id,
          actor_user_id: userId,
          event_type: 'expense_claim.receipt_uploaded',
          target_entity_type: 'expense_claim',
          target_entity_id: expenseClaim.id,
          details: {
            expense_category: expenseCategory,
            business_purpose: businessPurpose.substring(0, 100),
            file_name: file.name,
            file_size: file.size,
            processing_method: 'dspy_extraction'
          }
        })

      return NextResponse.json({
        success: true,
        data: {
          expense_claim_id: expenseClaim.id,
          transaction_id: transaction.id,
          processing_status: 'processing',
          task_id: requestId,
          message: 'Receipt uploaded successfully. Extracting data...'
        }
      })

    } catch (taskError) {
      console.error(`[Expense Receipt API] Task trigger failed:`, taskError)

      // Update expense claim to failed status
      await serviceSupabase
        .from('expense_claims')
        .update({
          processing_status: 'failed',
          failed_at: new Date().toISOString(),
          error_message: taskError instanceof Error ? taskError.message : 'Task trigger failed'
        })
        .eq('id', expenseClaim.id)

      return NextResponse.json({
        success: false,
        error: 'Failed to start receipt processing',
        expense_claim_id: expenseClaim.id
      }, { status: 500 })
    }

  } catch (error) {
    console.error('[Expense Receipt Upload API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to upload receipt'
      },
      { status: 500 }
    )
  }
}

// Get expense claim processing status and extraction results
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const expenseClaimId = searchParams.get('expense_claim_id')

    if (!expenseClaimId) {
      return NextResponse.json(
        { success: false, error: 'expense_claim_id parameter is required' },
        { status: 400 }
      )
    }

    const employeeProfile = await ensureEmployeeProfile(userId)
    if (!employeeProfile) {
      return NextResponse.json(
        { success: false, error: 'Employee profile not found' },
        { status: 404 }
      )
    }

    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Get user's home currency from users table
    const { data: userProfile, error: userError } = await supabase
      .from('users')
      .select('home_currency')
      .eq('clerk_user_id', userId)
      .single()

    const userHomeCurrency = userProfile?.home_currency || 'SGD'

    // Get expense claim with transaction data
    const { data: expenseClaim, error: claimError } = await supabase
      .from('expense_claims')
      .select(`
        *,
        transaction:transactions(*)
      `)
      .eq('id', expenseClaimId)
      .eq('employee_id', employeeProfile.id) // Ensure user can only access their own claims
      .single()

    if (claimError || !expenseClaim) {
      return NextResponse.json(
        { success: false, error: 'Expense claim not found' },
        { status: 404 }
      )
    }

    const transaction = expenseClaim.transaction
    const processingMetadata = expenseClaim.processing_metadata || {}
    const fileInfo = processingMetadata.file_info || {}

    // Get file URL if available
    let fileUrl = null
    if (fileInfo.path) {
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(fileInfo.path)
      fileUrl = urlData?.publicUrl || null
    }

    // Get raw DSPy extraction result from transaction processing_metadata
    const rawDspyData = transaction?.processing_metadata?.extracted_data || null
    const dspyLineItems = rawDspyData?.line_items || []

    console.log(`[Expense Receipt Status API] DSPy data check:`, {
      hasDspyData: !!rawDspyData,
      lineItemsCount: dspyLineItems.length,
      sampleLineItem: dspyLineItems[0] || null
    })

    // Map expense claim data for frontend with raw DSPy structure preserved
    const expenseData = {
      expense_claim_id: expenseClaim.id,
      processing_status: expenseClaim.processing_status,
      processing_complete: expenseClaim.processing_status === 'completed',

      // Transaction data (extracted from OCR or default values)
      vendor_name: transaction.vendor_name || null,
      total_amount: transaction.original_amount || 0,
      currency: transaction.original_currency || userHomeCurrency,
      transaction_date: transaction.transaction_date || null,
      description: transaction.description || '',

      // Expense claim specific
      business_purpose: expenseClaim.business_purpose || '',
      expense_category: expenseClaim.expense_category || 'other',
      status: expenseClaim.status,
      risk_score: expenseClaim.risk_score || 0,

      // Raw DSPy line items data (preserve original structure)
      line_items: dspyLineItems,

      // File info
      file_info: fileInfo,
      file_url: fileUrl,

      // Processing metadata
      processing_method: processingMetadata.extraction_method || 'dspy',
      task_id: processingMetadata.task_id || null,
      started_at: expenseClaim.processing_started_at,
      processed_at: expenseClaim.processed_at,
      error_message: expenseClaim.error_message,

      // Quality indicators
      extraction_quality: expenseClaim.processing_status === 'completed' ? 'high' : 'pending',
      missing_fields: [] as string[]
    }

    // Identify missing required fields for UX guidance
    if (!expenseData.vendor_name) expenseData.missing_fields.push('vendor_name')
    if (!expenseData.total_amount) expenseData.missing_fields.push('total_amount')
    if (!expenseData.transaction_date) expenseData.missing_fields.push('transaction_date')

    return NextResponse.json({
      success: true,
      data: expenseData
    })

  } catch (error) {
    console.error('[Expense Receipt Status API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get expense claim status'
      },
      { status: 500 }
    )
  }
}