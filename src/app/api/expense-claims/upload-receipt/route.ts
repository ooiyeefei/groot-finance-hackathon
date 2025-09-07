/**
 * Expense Claims Receipt Upload API
 * Extends existing OCR system with expense-specific document classification
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
import { ensureEmployeeProfile } from '@/lib/ensure-employee-profile'
import { tasks } from '@trigger.dev/sdk/v3'

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
    const expenseCategory = formData.get('expense_category') as string

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'Receipt file is required' },
        { status: 400 }
      )
    }

    // Validate expense category if provided (optional for OCR processing)
    if (expenseCategory && !['travel_accommodation', 'petrol', 'toll', 'entertainment', 'other'].includes(expenseCategory)) {
      return NextResponse.json(
        { success: false, error: 'Invalid expense category provided' },
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

    // Get or create employee profile (handles Clerk ID -> UUID mapping)
    const employeeProfile = await ensureEmployeeProfile(userId)
    
    if (!employeeProfile) {
      return NextResponse.json(
        { success: false, error: 'Employee profile not found' },
        { status: 404 }
      )
    }
    
    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Generate unique file path for Supabase Storage
    const fileExtension = file.name.split('.').pop()
    const fileName = `expense-receipt-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`
    const filePath = `expense-receipts/${userId}/${fileName}`

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (uploadError) {
      console.error('[Expense Receipt Upload API] Storage upload failed:', uploadError)
      return NextResponse.json(
        { success: false, error: 'Failed to upload file' },
        { status: 500 }
      )
    }

    // Create document record with Supabase UUID
    const { data: document, error: documentError } = await supabase
      .from('documents')
      .insert({
        user_id: employeeProfile.user_id, // Use Supabase UUID, not Clerk ID
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        storage_path: filePath,
        processing_status: 'pending',
        document_type: 'receipt', // Set as receipt for expense claims
        processing_metadata: {
          expense_category: expenseCategory || 'auto_detect', // Let Gemini suggest if not provided
          upload_source: 'expense_claims_mobile',
          employee_id: employeeProfile.id
        }
      })
      .select()
      .single()

    if (documentError) {
      console.error('[Expense Receipt Upload API] Document creation failed:', documentError)
      
      // Cleanup uploaded file
      await supabase.storage
        .from('documents')
        .remove([filePath])
        
      return NextResponse.json(
        { success: false, error: 'Failed to create document record' },
        { status: 500 }
      )
    }

    // Get public URL for the uploaded file
    const { data: publicUrlData } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath)

    if (!publicUrlData?.publicUrl) {
      console.error('[Expense Receipt Upload API] Failed to get public URL')
      return NextResponse.json(
        { success: false, error: 'Failed to process uploaded file' },
        { status: 500 }
      )
    }

    console.log(`[Expense Receipt Upload API] Uploaded receipt ${document.id} for user ${userId}`)

    // Trigger Gemini OCR processing for expense receipt
    try {
      // Trigger Gemini OCR task with correct parameters
      await tasks.trigger('process-document-ocr', {
        documentId: document.id,
        imageStoragePath: filePath, // Use storage path instead of public URL
        expenseCategory: expenseCategory
      })
      
      console.log(`[Expense Receipt Upload API] Triggered Gemini OCR processing for document ${document.id}`)
    } catch (triggerError) {
      console.error('[Expense Receipt Upload API] Failed to trigger OCR:', triggerError)
      // Don't fail the upload, user can manually enter data
    }

    // Return immediate response (non-blocking as per existing pattern)
    return NextResponse.json({
      success: true,
      data: {
        document: {
          id: document.id,
          file_name: document.file_name,
          file_size: document.file_size,
          file_type: document.file_type,
          processing_status: document.processing_status,
          document_type: document.document_type,
          expense_category: expenseCategory,
          public_url: publicUrlData.publicUrl,
          created_at: document.created_at
        }
      },
      message: 'Receipt uploaded successfully. OCR processing started.'
    }, { status: 202 }) // 202 Accepted - processing started

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

// Get OCR extraction results for expense receipt
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
    const documentId = searchParams.get('document_id')

    if (!documentId) {
      return NextResponse.json(
        { success: false, error: 'document_id parameter is required' },
        { status: 400 }
      )
    }

    // Get or create employee profile (handles Clerk ID -> UUID mapping)
    const employeeProfile = await ensureEmployeeProfile(userId)
    
    if (!employeeProfile) {
      return NextResponse.json(
        { success: false, error: 'Employee profile not found' },
        { status: 404 }
      )
    }
    
    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Get document with OCR results using Supabase UUID
    const { data: document, error: documentError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', employeeProfile.user_id) // Use Supabase UUID, not Clerk ID
      .single()

    if (documentError || !document) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      )
    }

    // Parse Gemini OCR data for expense-specific fields
    const extractedData = document.extracted_data || {}
    const documentSummary = extractedData.document_summary || {}
    const metadata = extractedData.metadata || {}

    // Map Gemini OCR results to expense claim format
    const expenseData = {
      vendor_name: documentSummary.vendor_name?.value || null,
      total_amount: parseFloat(documentSummary.total_amount?.value) || null,
      currency: documentSummary.currency?.value || 'SGD',
      transaction_date: documentSummary.transaction_date?.value || null,
      description: extractedData.text || document.file_name,
      line_items: extractedData.line_items || [],
      confidence_score: (document.confidence_score || 0) * 100, // Convert to percentage
      processing_status: document.processing_status,
      
      // Expense-specific extracted data from Gemini
      expense_category: documentSummary.suggested_category?.value || document.processing_metadata?.expense_category || 'other',
      category_confidence: (documentSummary.suggested_category?.confidence || 0) * 100,
      business_purpose: null, // To be filled by user
      
      // Gemini-specific metadata
      processing_method: metadata.processingMethod || 'gemini_ocr',
      requires_validation: metadata.requires_validation || false,
      category_reasoning: metadata.category_reasoning || '',
      gemini_model: document.processing_metadata?.gemini_model || 'gemini-2.5-flash',
      
      // Quality indicators for error handling UX
      missing_fields: [] as string[]
    }

    // Identify missing required fields for UX guidance
    if (!expenseData.vendor_name) expenseData.missing_fields.push('vendor_name')
    if (!expenseData.total_amount) expenseData.missing_fields.push('total_amount')
    if (!expenseData.transaction_date) expenseData.missing_fields.push('transaction_date')

    return NextResponse.json({
      success: true,
      data: {
        document_id: document.id,
        processing_complete: document.processing_status === 'completed',
        extraction_quality: expenseData.confidence_score >= 80 ? 'high' : expenseData.confidence_score >= 60 ? 'medium' : 'low',
        expense_data: expenseData,
        gemini_metadata: {
          processing_time_ms: document.processing_metadata?.processing_time_ms,
          category_suggestion: document.processing_metadata?.category_suggestion,
          requires_validation: expenseData.requires_validation,
          model_used: expenseData.gemini_model
        },
        raw_extracted_data: extractedData, // For debugging/manual correction
        public_url: await getPublicUrl(supabase, document.storage_path)
      }
    })

  } catch (error) {
    console.error('[Expense Receipt OCR API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get OCR results'
      },
      { status: 500 }
    )
  }
}

// Helper function to get public URL
async function getPublicUrl(supabase: any, storagePath: string): Promise<string | null> {
  const { data } = supabase.storage
    .from('documents')
    .getPublicUrl(storagePath)
    
  return data?.publicUrl || null
}