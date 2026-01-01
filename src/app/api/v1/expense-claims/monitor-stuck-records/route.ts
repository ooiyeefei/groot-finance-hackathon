/**
 * Stuck Records Monitor API - Handle Trigger.dev Task Failures
 *
 * This endpoint monitors expense claims stuck in 'analyzing' status and automatically
 * marks them as 'failed' after a timeout period. This handles cases where:
 * - Trigger.dev tasks never execute
 * - Tasks timeout completely without error handling
 * - System-level failures prevent status updates
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin-client'
import { getCurrentUserContextWithBusiness } from '@/domains/security/lib/rbac'
import { getUserFriendlyErrorMessage, type ErrorContext } from '@/domains/expense-claims/lib/error-message-mapper'

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
    const supabaseServiceRole = getSupabaseAdmin()

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

    const businessId = userContext.profile.business_id

    // Calculate timeout threshold
    const timeoutThreshold = new Date()
    timeoutThreshold.setMinutes(timeoutThreshold.getMinutes() - STUCK_TIMEOUT_MINUTES)

    console.log(`🔍 [Stuck Monitor] Checking for records older than: ${timeoutThreshold.toISOString()}`)

    // Find expense claims stuck in 'analyzing' status
    const { data: stuckRecords, error: findError } = await supabaseServiceRole
      .from('expense_claims')
      .select('id, processing_started_at, updated_at, user_id, vendor_name, total_amount, status')
      .eq('business_id', businessId)
      .eq('status', 'analyzing')
      .lt('processing_started_at', timeoutThreshold.toISOString())
      .limit(MAX_RECORDS_TO_PROCESS)

    if (findError) {
      console.error('❌ [Stuck Monitor] Database query error:', findError)
      return NextResponse.json(
        { success: false, error: 'Failed to query stuck records' },
        { status: 500 }
      )
    }

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

    // Process each stuck record
    const fixedRecords = []
    const failedFixes = []

    for (const record of stuckRecords) {
      try {
        // Calculate how long it's been stuck
        const processingStarted = new Date(record.processing_started_at)
        const minutesStuck = Math.floor((Date.now() - processingStarted.getTime()) / (1000 * 60))

        console.log(`🚨 [Stuck Monitor] Processing stuck record ${record.id} - stuck for ${minutesStuck} minutes`)

        // Create failure metadata
        const failureMetadata = createStuckRecordFailureMetadata(minutesStuck)

        // Update the stuck record to 'failed' status
        const { error: updateError } = await supabaseServiceRole
          .from('expense_claims')
          .update({
            status: 'failed',
            processing_metadata: failureMetadata,
            updated_at: new Date().toISOString()
          })
          .eq('id', record.id)

        if (updateError) {
          console.error(`❌ [Stuck Monitor] Failed to update record ${record.id}:`, updateError)
          failedFixes.push({
            record_id: record.id,
            error: updateError.message
          })
        } else {
          console.log(`✅ [Stuck Monitor] Successfully marked record ${record.id} as failed`)
          fixedRecords.push({
            record_id: record.id,
            minutes_stuck: minutesStuck,
            vendor_name: record.vendor_name || 'Unknown',
            amount: record.total_amount || 0
          })
        }
      } catch (error) {
        console.error(`❌ [Stuck Monitor] Error processing record ${record.id}:`, error)
        failedFixes.push({
          record_id: record.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    // Log audit event for monitoring action
    if (fixedRecords.length > 0) {
      try {
        await supabaseServiceRole
          .from('audit_events')
          .insert({
            business_id: businessId,
            actor_user_id: userContext.userId,
            event_type: 'system.stuck_records_monitor',
            target_entity_type: 'expense_claim',
            target_entity_id: null, // Multiple records
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
    const supabaseServiceRole = getSupabaseAdmin()

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

    const businessId = userContext.profile.business_id

    // Get the expense claim to verify it exists and is in our business
    const { data: expenseClaim, error: fetchError } = await supabaseServiceRole
      .from('expense_claims')
      .select('id, status, processing_started_at, user_id, vendor_name, total_amount')
      .eq('id', expense_claim_id)
      .eq('business_id', businessId)
      .single()

    if (fetchError || !expenseClaim) {
      return NextResponse.json(
        { success: false, error: 'Expense claim not found' },
        { status: 404 }
      )
    }

    // Calculate how long it's been stuck (if applicable)
    let minutesStuck = 0
    if (expenseClaim.processing_started_at) {
      const processingStarted = new Date(expenseClaim.processing_started_at)
      minutesStuck = Math.floor((Date.now() - processingStarted.getTime()) / (1000 * 60))
    }

    // Create error context for manual override
    const errorContext: ErrorContext = {
      errorCode: 'MANUAL_OVERRIDE',
      errorCategory: 'admin_override',
      technicalError: `Manually failed by admin user ${userContext.userId}. Original status: ${expenseClaim.status}`,
      processingStage: 'admin_manual_override'
    };

    // Get user-friendly error message using mapper (can be overridden by reason)
    const userFriendlyMapping = getUserFriendlyErrorMessage(errorContext);
    const finalErrorMessage = reason || userFriendlyMapping.userMessage;

    // Create failure metadata for manual override
    const failureMetadata = {
      extraction_method: 'ai',
      extraction_timestamp: new Date().toISOString(),
      ai_processing_status: 'failed',
      processing_status: 'failed',
      error_category: 'admin_override',
      error_code: 'MANUAL_OVERRIDE',
      error_message: finalErrorMessage,
      technical_error: `Manually failed by admin user ${userContext.userId}. Original status: ${expenseClaim.status}`,
      failed_at: new Date().toISOString(),
      processing_stage: 'admin_manual_override',
      failure_level: 'admin_action',
      minutes_stuck: minutesStuck,
      override_reason: reason,
      overridden_by: userContext.userId
    }

    // Update the expense claim to 'failed' status
    const { error: updateError } = await supabaseServiceRole
      .from('expense_claims')
      .update({
        status: 'failed',
        processing_metadata: failureMetadata,
        updated_at: new Date().toISOString()
      })
      .eq('id', expense_claim_id)

    if (updateError) {
      console.error(`❌ [Manual Override] Failed to update record ${expense_claim_id}:`, updateError)
      return NextResponse.json(
        { success: false, error: 'Failed to update expense claim status' },
        { status: 500 }
      )
    }

    // Log audit event for manual override
    try {
      await supabaseServiceRole
        .from('audit_events')
        .insert({
          business_id: businessId,
          actor_user_id: userContext.userId,
          event_type: 'expense_claim.manual_override_failed',
          target_entity_type: 'expense_claim',
          target_entity_id: expense_claim_id,
          details: {
            action: 'manual_force_fail',
            original_status: expenseClaim.status,
            reason: reason || 'No reason provided',
            minutes_stuck: minutesStuck,
            vendor_name: expenseClaim.vendor_name,
            amount: expenseClaim.total_amount
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
        original_status: expenseClaim.status,
        minutes_stuck: minutesStuck
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