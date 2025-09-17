import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
import { tasks } from '@trigger.dev/sdk/v3'
import { auth } from '@clerk/nextjs/server'

export async function POST(request: NextRequest) {
  try {
    // Authentication check - ensures only authenticated users can access
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    await createAuthenticatedSupabaseClient(userId)
    
    // Get the request body
    const { 
      receiptText, 
      receiptImageUrl, 
      documentId, 
      imageMetadata, 
      forcedProcessingMethod,
      requestId
    } = await request.json()
    
    if (!receiptText && !receiptImageUrl) {
      return NextResponse.json(
        { error: 'Receipt text or image URL is required' },
        { status: 400 }
      )
    }

    console.log('[DSPy Extraction API] Starting DSPy extraction process via Trigger.dev')
    console.log('[DSPy Extraction API] Receipt text length:', receiptText?.length || 0)
    console.log('[DSPy Extraction API] Image URL provided:', !!receiptImageUrl)
    console.log('[DSPy Extraction API] Document ID:', documentId)

    // Trigger the DSPy extraction task using Trigger.dev
    try {
      const taskResult = await tasks.trigger('dspy-receipt-extraction', {
        receiptText,
        receiptImageUrl,
        documentId,
        userId,
        imageMetadata,
        forcedProcessingMethod,
        requestId: requestId || `${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      })

      console.log('[DSPy Extraction API] Trigger.dev task started:', taskResult.id)

      // If we have a document ID, return immediately with task info
      if (documentId) {
        return NextResponse.json({
          success: true,
          message: 'DSPy extraction started. Processing in background.',
          taskId: taskResult.id,
          documentId,
          processingStatus: 'processing'
        })
      }

      // For direct text processing without document, return task info
      // The extraction will be processed asynchronously in the background
      console.log('[DSPy Extraction API] DSPy extraction task started successfully')

      return NextResponse.json({
        success: true,
        message: 'DSPy extraction started. Processing in background.',
        taskId: taskResult.id,
        processingStatus: 'processing'
      })

    } catch (triggerError) {
      console.error('[DSPy Extraction API] Trigger.dev task failed:', triggerError)
      
      return NextResponse.json(
        { 
          success: false,
          error: `DSPy task execution failed: ${triggerError instanceof Error ? triggerError.message : 'Unknown error'}`
        },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('[DSPy Extraction API] Extraction failed:', error)
    
    // Check if it's an authentication error
    if (error instanceof Error && error.message.includes('Authentication required')) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Authentication required. Please log in to access this service.'
        },
        { status: 401 }
      )
    }
    
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'DSPy extraction failed'
      },
      { status: 500 }
    )
  }
}