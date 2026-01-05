/**
 * Stuck Records Monitor API - Handle Trigger.dev Task Failures
 *
 * This endpoint monitors expense claims stuck in 'analyzing' status and automatically
 * marks them as 'failed' after a timeout period. This handles cases where:
 * - Trigger.dev tasks never execute
 * - Tasks timeout completely without error handling
 * - System-level failures prevent status updates
 *
 * ✅ MIGRATED TO CONVEX (2025-01)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserContextWithBusiness } from '@/domains/security/lib/rbac'
import { getUserFriendlyErrorMessage, type ErrorContext } from '@/domains/expense-claims/lib/error-message-mapper'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'

// Timeout configuration
const STUCK_TIMEOUT_MINUTES = 10 // Mark as failed after 10 minutes in 'analyzing' status
const MAX_RECORDS_TO_PROCESS = 50 // Batch size limit for safety

function createStuckRecordFailureMetadata(minutesStuck: number) {
  // Create error context for stuck record timeout
  const errorContext: ErrorContext = {
    errorCode: 'STUCK_RECORD_TIMEOUT',
    errorCategory: 'system_timeout',
    technicalError: `Record was stuck in 'analyzing' status for ${minutesStuck} minutes without updates from Trigger.dev task`,
    processingStage: 'stuck_record_monitoring',
    timeoutDuration: `${minutesStuck} minutes`
  };

  // Get user-friendly error message using mapper
  const userFriendlyMapping = getUserFriendlyErrorMessage(errorContext);

  return {
    extraction_method: 'ai',
    extraction_timestamp: new Date().toISOString(),
    ai_processing_status: 'failed',
    processing_status: 'failed',
    error_category: 'system_timeout',
    error_code: 'STUCK_RECORD_TIMEOUT',
    error_message: userFriendlyMapping.userMessage,
    technical_error: `Record was stuck in 'analyzing' status for ${minutesStuck} minutes without updates from Trigger.dev task`,
    failed_at: new Date().toISOString(),
    processing_stage: 'stuck_record_monitoring',
    failure_level: 'system',
    timeout_duration: `${minutesStuck} minutes`,
    monitoring_action: 'auto_failed_by_monitor'
  }
}

/**
 * GET /api/v1/expense-claims/monitor-stuck-records
 * Monitor and fix stuck expense claims
 */
export async function GET(request: NextRequest) {
  try {
    // Get user context with business permissions
    const userContext = await getCurrentUserContextWithBusiness()

    if (!userContext) {
      return NextResponse.json(
        { success: false, error: 'User not authenticated' },
        { status: 401 }
      )
    }

    // Only allow admin/manager access for monitoring operations
    if (!userContext.permissions.admin && !userContext.permissions.manager) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions. Admin or manager role required.' },
        { status: 403 }
      )
    }

    if (!userContext.businessContext) {
      return NextResponse.json(
        { success: false, error: 'No business context found. Please select a business.' },
        { status: 400 }
      )
    }

    const businessId = userContext.businessContext.businessId

    // Get authenticated Convex client
    const { client } = await getAuthenticatedConvex()
    if (!client) {
      console.error('[Stuck Monitor] Failed to get Convex client')
      return NextResponse.json(
        { success: false, error: 'Database connection failed' },
        { status: 500 }
      )
    }

    // Calculate timeout threshold (Unix timestamp)
    const timeoutThreshold = Date.now() - (STUCK_TIMEOUT_MINUTES * 60 * 1000)

    console.log(`🔍 [Stuck Monitor] Checking for records older than: ${new Date(timeoutThreshold).toISOString()}`)

    // Find expense claims stuck in processing/uploading status using Convex
    const stuckRecords = await client.query(api.functions.expenseClaims.getStuckRecords, {
      businessId,
      timeoutThreshold,
      limit: MAX_RECORDS_TO_PROCESS
    })

    if (!stuckRecords || stuckRecords.length === 0) {
      console.log('✅ [Stuck Monitor] No stuck records found')
      return NextResponse.json({
        success: true,
        data: {
          stuck_records_found: 0,
          fixed_records: 0,
          message: 'No stuck records detected'
        }
      })
    }

    console.log(`⚠️ [Stuck Monitor] Found ${stuckRecords.length} stuck records`)

    // Prepare records for batch update
    const recordsToUpdate = stuckRecords.map(record => {
      // Calculate how long it's been stuck
      const processingStarted = record.processingStartedAt || record.updatedAt || 0
      const minutesStuck = Math.floor((Date.now() - processingStarted) / (1000 * 60))

      console.log(`🚨 [Stuck Monitor] Processing stuck record ${record.id} - stuck for ${minutesStuck} minutes`)

      return {
        id: String(record.id),
        minutesStuck,
        errorMetadata: createStuckRecordFailureMetadata(minutesStuck)
      }
    })

    // Batch update stuck records using Convex mutation
    const updateResults = await client.mutation(api.functions.expenseClaims.markStuckRecordsFailed, {
      businessId,
      records: recordsToUpdate,
      actorUserId: userContext.userId
    })

    // Format results for response
    const fixedRecords = updateResults.fixed.map((id, idx) => {
      const original = stuckRecords.find(r => String(r.id) === id)
      const updateRecord = recordsToUpdate.find(r => r.id === id)
      return {
        record_id: id,
        minutes_stuck: updateRecord?.minutesStuck || 0,
        vendor_name: original?.vendorName || 'Unknown',
        amount: original?.totalAmount || 0
      }
    })

    const failedFixes = updateResults.failed.map(f => ({
      record_id: f.id,
      error: f.error
    }))

    // Log audit event for monitoring action
    if (fixedRecords.length > 0) {
      try {
        await client.mutation(api.functions.audit.logEvent, {
          businessId,
          actorUserId: userContext.userId,
          eventType: 'system.stuck_records_monitor',
          targetEntityType: 'expense_claim',
          targetEntityId: 'batch_operation',
          details: {
            action: 'auto_failed_stuck_records',
            records_found: stuckRecords.length,
            records_fixed: fixedRecords.length,
            records_failed_to_fix: failedFixes.length,
            timeout_threshold_minutes: STUCK_TIMEOUT_MINUTES,
            fixed_records: fixedRecords,
            failed_fixes: failedFixes
          }
        })
      } catch (auditError) {
        console.error('❌ [Stuck Monitor] Failed to log audit event:', auditError)
        // Don't fail the whole operation if audit logging fails
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        stuck_records_found: stuckRecords.length,
        fixed_records_count: fixedRecords.length,
        failed_fixes_count: failedFixes.length,
        timeout_threshold_minutes: STUCK_TIMEOUT_MINUTES,
        fixed_records: fixedRecords,
        failed_fixes: failedFixes
      }
    })

  } catch (error) {
    console.error('❌ [Stuck Monitor] System error:', error)
    return NextResponse.json(
      { success: false, error: 'System error during stuck record monitoring' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/v1/expense-claims/monitor-stuck-records
 * Force-fail a specific expense claim (admin override)
 */
export async function POST(request: NextRequest) {
  try {
    // Get user context with business permissions
    const userContext = await getCurrentUserContextWithBusiness()

    if (!userContext) {
      return NextResponse.json(
        { success: false, error: 'User not authenticated' },
        { status: 401 }
      )
    }

    // Only allow admin access for manual override
    if (!userContext.permissions.admin) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions. Admin role required for manual override.' },
        { status: 403 }
      )
    }

    const { expense_claim_id, reason } = await request.json()

    if (!expense_claim_id) {
      return NextResponse.json(
        { success: false, error: 'expense_claim_id is required' },
        { status: 400 }
      )
    }

    if (!userContext.businessContext) {
      return NextResponse.json(
        { success: false, error: 'No business context found. Please select a business.' },
        { status: 400 }
      )
    }

    const businessId = userContext.businessContext.businessId

    // Get authenticated Convex client
    const { client } = await getAuthenticatedConvex()
    if (!client) {
      console.error('[Manual Override] Failed to get Convex client')
      return NextResponse.json(
        { success: false, error: 'Database connection failed' },
        { status: 500 }
      )
    }

    // Create error context for manual override
    const errorContext: ErrorContext = {
      errorCode: 'MANUAL_OVERRIDE',
      errorCategory: 'admin_override',
      technicalError: `Manually failed by admin user ${userContext.userId}`,
      processingStage: 'admin_manual_override'
    };

    // Get user-friendly error message using mapper (can be overridden by reason)
    const userFriendlyMapping = getUserFriendlyErrorMessage(errorContext);
    const finalErrorMessage = reason || userFriendlyMapping.userMessage;

    // Create failure metadata for manual override
    const errorMetadata = {
      extraction_method: 'ai',
      extraction_timestamp: new Date().toISOString(),
      ai_processing_status: 'failed',
      processing_status: 'failed',
      error_category: 'admin_override',
      error_code: 'MANUAL_OVERRIDE',
      error_message: finalErrorMessage,
      technical_error: `Manually failed by admin user ${userContext.userId}`,
      failed_at: new Date().toISOString(),
      processing_stage: 'admin_manual_override',
      failure_level: 'admin_action',
      override_reason: reason,
      overridden_by: userContext.userId
    }

    // Force fail the expense claim using Convex mutation
    const result = await client.mutation(api.functions.expenseClaims.forceFailRecord, {
      businessId,
      claimId: expense_claim_id,
      reason: reason || undefined,
      errorMetadata
    })

    // Log audit event for manual override
    try {
      await client.mutation(api.functions.audit.logEvent, {
        businessId,
        actorUserId: userContext.userId,
        eventType: 'expense_claim.manual_override_failed',
        targetEntityType: 'expense_claim',
        targetEntityId: expense_claim_id,
        details: {
          action: 'manual_force_fail',
          original_status: result.originalStatus,
          reason: reason || 'No reason provided',
          minutes_stuck: result.minutesStuck,
          vendor_name: result.vendorName,
          amount: result.totalAmount
        }
      })
    } catch (auditError) {
      console.error('❌ [Manual Override] Failed to log audit event:', auditError)
      // Don't fail the operation if audit logging fails
    }

    console.log(`✅ [Manual Override] Admin ${userContext.userId} manually failed expense claim ${expense_claim_id}`)

    return NextResponse.json({
      success: true,
      data: {
        message: 'Expense claim manually marked as failed',
        expense_claim_id,
        original_status: result.originalStatus,
        minutes_stuck: result.minutesStuck
      }
    })

  } catch (error) {
    console.error('❌ [Manual Override] System error:', error)
    return NextResponse.json(
      { success: false, error: 'System error during manual override' },
      { status: 500 }
    )
  }
}
