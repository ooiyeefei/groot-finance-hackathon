import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
import { tasks } from '@trigger.dev/sdk/v3'
import { auth } from '@clerk/nextjs/server'

// Simple in-memory deduplication store (in production, use Redis)
const recentRequests = new Map<string, number>()

/**
 * Synchronous DSPy Receipt Extraction API
 * Triggers DSPy task and waits for completion to maintain UI compatibility
 */
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
    
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'Receipt file is required' },
        { status: 400 }
      )
    }

    const supabase = await createAuthenticatedSupabaseClient(userId)
    
    // Convert uploaded file to base64 for processing
    const fileBuffer = await file.arrayBuffer()
    const fileBase64 = Buffer.from(fileBuffer).toString('base64')
    const mimeType = file.type
    
    console.log(`[DSPy Sync API] Processing uploaded file: ${file.name}`)
    console.log(`[DSPy Sync API] File type: ${mimeType}, Size: ${file.size} bytes`)
    
    // Create document record first for tracking
    const fileName = `receipt-${Date.now()}-${Math.random().toString(36).substring(2)}.${file.name.split('.').pop()}`
    const filePath = `receipts/${userId}/${fileName}`

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (uploadError) {
      console.error('[DSPy Sync API] Upload failed:', uploadError)
      return NextResponse.json(
        { success: false, error: 'File upload failed' },
        { status: 500 }
      )
    }

    // Create document record
    const { data: newDoc, error: docError } = await supabase
      .from('documents')
      .insert({
        user_id: userId,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        storage_path: filePath,
        processing_status: 'processing',
        document_type: 'receipt',
        processing_tier: 1
      })
      .select()
      .single()

    if (docError || !newDoc) {
      console.error('[DSPy Sync API] Document creation failed:', docError)
      return NextResponse.json(
        { success: false, error: 'Failed to create document record' },
        { status: 500 }
      )
    }

    console.log(`[DSPy Sync API] Created document ${newDoc.id} for tracking`)
    
    // The DSPy task will handle OCR extraction from the actual image
    const receiptText: string | null = null // Will be extracted from image in DSPy task
    const receiptImageData = {
      base64: fileBase64,
      mimeType: mimeType,
      filename: file.name
    }
    
    // Generate truly idempotent deduplication key (stable across identical requests)
    // Use only stable identifiers: userId + filename + filesize
    const idempotentKey = `extract-receipt-v1-${userId}-${file.name}-${file.size}`
    
    // Check for recent duplicate requests (30-second window for same file)
    const now = Date.now()
    const existingTime = recentRequests.get(idempotentKey)
    if (existingTime && (now - existingTime) < 30 * 1000) {
      console.log(`[DSPy Sync API] ⚠️ DUPLICATE REQUEST BLOCKED: ${idempotentKey}`)
      console.log(`[DSPy Sync API] Original request was ${((now - existingTime)/1000).toFixed(2)}s ago`)
      return NextResponse.json({
        success: true,
        data: {
          document_id: null,
          processing_complete: false,
          processing_time_ms: 0,
          confidence_score: 0.85,
          extraction_method: 'dspy',
          processing_tier: 1,
          task_id: `duplicate-${idempotentKey}`,
          message: 'Duplicate request detected - original task already processing.',
          processingStatus: 'processing'
        }
      })
    }
    
    // Record this request to prevent duplicates
    recentRequests.set(idempotentKey, now)
    
    // Generate unique task request ID for actual processing (can include timestamp)
    const requestId = `${idempotentKey}-${now}`
    
    // Clean up old entries (older than 10 minutes)
    for (const [key, timestamp] of recentRequests.entries()) {
      if (now - timestamp > 10 * 60 * 1000) {
        recentRequests.delete(key)
      }
    }
    
    console.log(`[DSPy Sync API] Starting DSPy extraction for user ${userId}`)
    console.log(`[DSPy Sync API] File: ${file.name}, Size: ${file.size}`)
    console.log(`[DSPy Sync API] Request ID: ${requestId}`)
    console.log(`[DSPy Sync API] Active requests: ${recentRequests.size}`)

    // Prepare image metadata from file
    const imageMetadata = {
      confidence: 0.85,
      quality: 'good' as const,
      textLength: (receiptText as string | null)?.length || 0 // Handle null case for image-only processing
    }

    // Trigger the DSPy extraction task (fire-and-forget, then return processing status)
    console.log(`[DSPy Sync API] Starting DSPy extraction via Trigger.dev...`)
    
    try {
      // Fire-and-forget trigger (proper architecture for async processing)
      const taskHandle = await tasks.trigger('dspy-receipt-extraction', {
        receiptText: receiptText, // null - will be extracted from image
        receiptImageData: receiptImageData, // Pass actual image data
        receiptImageUrl: null,
        documentId: newDoc.id, // Pass the created document ID
        userId,
        imageMetadata,
        forcedProcessingMethod: 'auto',
        requestId
      })

      console.log(`[DSPy Sync API] DSPy task triggered successfully`)
      console.log(`[DSPy Sync API] Task ID: ${taskHandle.id}`)
      
      // Update document with task ID for polling (use requestId for consistency with DSPy task)
      await supabase
        .from('documents')
        .update({
          processing_metadata: {
            task_id: requestId, // Use requestId for consistent lookup
            trigger_task_id: taskHandle.id, // Store actual Trigger.dev task ID too
            extraction_method: 'dspy',
            processing_tier: 1,
            started_at: new Date().toISOString()
          }
        })
        .eq('id', newDoc.id)
      
      console.log(`[DSPy Sync API] Updated document ${newDoc.id} with task ID ${requestId} (Trigger ID: ${taskHandle.id})`)
      
      // Return immediate response indicating processing started
      // Note: This API is named "sync" but uses async processing with polling on frontend
      return NextResponse.json({
        success: true,
        data: {
          processing_complete: false,
          processing_time_ms: 0,
          confidence_score: 0.85,
          extraction_method: 'dspy',
          processing_tier: 1,
          task_id: requestId, // Use requestId for frontend polling
          document_id: newDoc.id,
          message: 'DSPy extraction task started - processing in background',
          processingStatus: 'processing'
        }
      })
    } catch (error) {
      console.error(`[DSPy Sync API] Task execution failed:`, error)
      
      // Check if this is a timeout error
      if (error instanceof Error && error.message.includes('timeout')) {
        return NextResponse.json({
          success: false,
          error: 'Processing timeout - please try again with a simpler receipt',
          processingStatus: 'timeout'
        }, { status: 408 })
      }
      
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : 'Task execution failed',
        processingStatus: 'failed'
      }, { status: 500 })
    }
  } catch (error) {
    console.error('[DSPy Sync API] Request processing failed:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Request processing failed'
    }, { status: 500 })
  }
}