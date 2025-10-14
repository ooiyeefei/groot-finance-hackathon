/**
 * Re-extract/reprocess expense claim API endpoint
 * Moves Trigger.dev call from client-side to server-side to fix TRIGGER_SECRET_KEY error
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import { tasks } from '@trigger.dev/sdk/v3'
import type { extractReceiptData } from '@/trigger/extract-receipt-data'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id: expenseClaimId } = await params
    console.log('[Reprocess API] Starting reprocess for claim:', expenseClaimId)

    // Initialize Supabase client with service role for server-side access
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get user's Supabase UUID from Clerk user ID
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_user_id', userId)
      .single()

    if (userError || !userData) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    const supabaseUserId = userData.id

    // Get expense claim to verify access and get storage path
    const { data: claim, error: claimError } = await supabase
      .from('expense_claims')
      .select('id, storage_path, user_id')
      .eq('id', expenseClaimId)
      .single()

    if (claimError || !claim) {
      return NextResponse.json(
        { success: false, error: 'Expense claim not found' },
        { status: 404 }
      )
    }

    // Verify user owns this claim (compare Supabase UUIDs)
    if (claim.user_id !== supabaseUserId) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      )
    }

    // Check if claim has receipt to reprocess
    if (!claim.storage_path) {
      return NextResponse.json(
        { success: false, error: 'No receipt available for reprocessing' },
        { status: 400 }
      )
    }

    // Create signed URL for the receipt (same pattern as data-access.ts)
    const { data: urlData, error: urlError } = await supabase.storage
      .from('expense_claims')
      .createSignedUrl(claim.storage_path, 600) // 10 minutes

    if (urlError || !urlData?.signedUrl) {
      console.error('[Reprocess API] Failed to create signed URL:', urlError)
      return NextResponse.json(
        { success: false, error: 'Failed to generate secure access to receipt' },
        { status: 500 }
      )
    }

    console.log('[Reprocess API] Generated signed URL for reprocessing')

    // Step 1: Update status to 'analyzing' immediately for instant UI feedback
    const { error: statusError } = await supabase
      .from('expense_claims')
      .update({
        status: 'analyzing',
        processing_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', expenseClaimId)

    if (statusError) {
      console.error('[Reprocess API] Failed to update status:', statusError)
      // Continue anyway - status will be set by Trigger.dev job
    } else {
      console.log('[Reprocess API] Status updated to analyzing')
    }

    // Step 2: Trigger the same Trigger.dev job as upload workflow (server-side with environment variables)
    const triggerResult = await tasks.trigger<typeof extractReceiptData>(
      "extract-receipt-data",
      {
        expenseClaimId: expenseClaimId,
        documentId: undefined, // No separate document ID for direct expense claims
        userId: supabaseUserId, // Pass the Supabase UUID for consistency
        documentDomain: 'expense_claims',
        receiptImageUrl: urlData.signedUrl
      }
    )

    console.log('[Reprocess API] Trigger.dev job started:', {
      taskId: triggerResult.id,
      expenseClaimId
    })

    return NextResponse.json({
      success: true,
      data: {
        task_id: triggerResult.id,
        message: 'AI reprocessing started successfully'
      }
    })

  } catch (error) {
    console.error('[Reprocess API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reprocess expense claim'
      },
      { status: 500 }
    )
  }
}