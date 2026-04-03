/**
 * Re-extract/reprocess expense claim API endpoint
 * Triggers Lambda document processor for receipt extraction
 *
 * MIGRATED: Database uses Convex, file storage uses AWS S3
 * UPDATED: Uses Lambda for document processing
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { invokeDocumentProcessor } from '@/lib/lambda-invoker'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get authenticated Convex client
    const { client, userId } = await getAuthenticatedConvex()

    if (!client || !userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id: expenseClaimId } = await params
    console.log('[Reprocess API] Starting reprocess for claim:', expenseClaimId)

    // Get expense claim from Convex - handles auth and access control internally
    const claim = await client.query(api.functions.expenseClaims.getById, {
      id: expenseClaimId,
    })

    if (!claim) {
      return NextResponse.json(
        { success: false, error: 'Expense claim not found or access denied' },
        { status: 404 }
      )
    }

    // Check if claim has receipt to reprocess
    if (!claim.storagePath) {
      return NextResponse.json(
        { success: false, error: 'No receipt available for reprocessing' },
        { status: 400 }
      )
    }

    // Update status to 'processing' using Convex mutation
    try {
      await client.mutation(api.functions.expenseClaims.updateStatus, {
        id: expenseClaimId,
        status: 'processing',
      })
      console.log('[Reprocess API] Status updated to processing')
    } catch (statusError) {
      console.error('[Reprocess API] Failed to update status:', statusError)
      // Continue anyway - status will be set by Lambda
    }

    // Get user's Convex ID for Lambda
    const user = await client.query(api.functions.users.getByClerkId, {
      clerkUserId: userId,
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    // Invoke Lambda for document processing
    console.log('[Reprocess API] Invoking Lambda document processor')

    // Determine file type from storage path
    const fileType: 'pdf' | 'image' = claim.storagePath.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image'

    // Fetch business details for e-invoice form fill (required for QR → e-invoice flow)
    let businessDetails: { name: string; tin: string; brn: string; address: string; phone?: string; contactEmail?: string; [key: string]: any } | undefined
    try {
      const business = await client.query(api.functions.businesses.getBusinessProfileByStringId, {
        businessId: claim.businessId,
      })
      if (business?.lhdn_tin) {
        businessDetails = {
          name: business.name,
          tin: business.lhdn_tin,
          brn: business.business_registration_number || business.lhdn_tin,
          addressLine1: business.address_line1 || '',
          addressLine2: business.address_line2 || '',
          city: business.city || '',
          stateCode: business.state_code || '',
          postalCode: business.postal_code || '',
          address: [business.address_line1, business.city, business.state_code, business.postal_code].filter(Boolean).join(', '),
          phone: business.contact_phone || '',
          contactEmail: business.contact_email || '',
          countryCode: business.country_code || 'MYS',
        }
      }
    } catch (bizError) {
      console.warn('[Reprocess API] Could not fetch business details for e-invoice:', bizError)
    }

    const lambdaResult = await invokeDocumentProcessor({
      documentId: expenseClaimId,
      domain: 'expense_claims',
      storagePath: claim.storagePath,
      fileType,
      businessId: claim.businessId,
      userId: user._id,
      idempotencyKey: `expense-${expenseClaimId}-${Date.now()}`,
      expectedDocumentType: 'receipt',
      businessDetails,
    })

    // Map Lambda executionId to taskId for API compatibility
    const taskId = lambdaResult.executionId
    console.log('[Reprocess API] Lambda invoked:', { taskId, expenseClaimId })

    return NextResponse.json({
      success: true,
      data: {
        task_id: taskId,
        message: 'AI reprocessing started successfully'
      }
    })

  } catch (error) {
    console.error('[Reprocess API] Error:', error)

    // Handle specific Convex errors
    if (error instanceof Error) {
      if (error.message.includes('Not authenticated')) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        )
      }
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { success: false, error: 'Expense claim not found' },
          { status: 404 }
        )
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reprocess expense claim'
      },
      { status: 500 }
    )
  }
}
