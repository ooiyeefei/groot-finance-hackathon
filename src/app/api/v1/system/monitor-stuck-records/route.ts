/**
 * Domain-Agnostic Stuck Records Monitor API
 *
 * Monitors and fixes stuck records across ALL domains using Trigger.dev processing:
 * - invoices (process-document-ocr)
 * - expense_claims (extract-receipt-data)
 *
 * ✅ MIGRATED TO CONVEX (2025-01)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserContextWithBusiness } from '@/domains/security/lib/rbac'
import { getUserFriendlyErrorMessage, type ErrorContext } from '@/lib/shared/error-message-mapper'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'

// Domain configuration for monitoring (metadata only - Convex functions handle the actual queries)
interface DomainConfig {
  displayName: string;
  stuckStatuses: string[];
}

const DOMAIN_CONFIGS: Record<string, DomainConfig> = {
  'invoices': {
    displayName: 'Invoice Processing',
    stuckStatuses: ['processing', 'analyzing', 'classifying', 'extracting', 'uploading']
  },
  'expense_claims': {
    displayName: 'Receipt Processing',
    stuckStatuses: ['processing', 'uploading', 'analyzing']
  }
};

// Timeout configuration
const STUCK_TIMEOUT_MINUTES = 10 // Mark as failed after 10 minutes in processing status
const MAX_RECORDS_TO_PROCESS = 50 // Batch size limit for safety

function createStuckRecordFailureMetadata(minutesStuck: number, domain: string) {
  // Create error context for stuck record timeout
  const errorContext: ErrorContext = {
    errorCode: 'STUCK_RECORD_TIMEOUT',
    errorCategory: 'system_timeout',
    technicalError: `Record was stuck in processing status for ${minutesStuck} minutes without updates from Trigger.dev task`,
    processingStage: 'stuck_record_monitoring',
    timeoutDuration: `${minutesStuck} minutes`,
    domain: domain as any
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
    technical_error: `Record was stuck in processing status for ${minutesStuck} minutes without updates from Trigger.dev task`,
    failed_at: new Date().toISOString(),
    processing_stage: 'stuck_record_monitoring',
    failure_level: 'system',
    timeout_duration: `${minutesStuck} minutes`,
    monitoring_action: 'auto_failed_by_monitor',
    domain: domain
  }
}

/**
 * GET /api/v1/system/monitor-stuck-records
 * Monitor and fix stuck records across all domains
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
    const { searchParams } = new URL(request.url)
    const targetDomain = searchParams.get('domain') // Optional: monitor specific domain

    // Get authenticated Convex client
    const { client } = await getAuthenticatedConvex()
    if (!client) {
      console.error('[System Monitor] Failed to get Convex client')
      return NextResponse.json(
        { success: false, error: 'Database connection failed' },
        { status: 500 }
      )
    }

    // Calculate timeout threshold (Unix timestamp)
    const timeoutThreshold = Date.now() - (STUCK_TIMEOUT_MINUTES * 60 * 1000)

    console.log(`🔍 [System Monitor] Checking for stuck records older than: ${new Date(timeoutThreshold).toISOString()}`)

    const allResults: any = {
      domains_checked: [],
      total_stuck_records: 0,
      total_fixed_records: 0,
      total_failed_fixes: 0,
      domain_results: {}
    }

    // Monitor each domain (or specific domain if requested)
    const domainsToCheck = targetDomain ? [targetDomain] : Object.keys(DOMAIN_CONFIGS)

    for (const domain of domainsToCheck) {
      const config = DOMAIN_CONFIGS[domain]
      if (!config) {
        console.warn(`⚠️ [System Monitor] Unknown domain: ${domain}`)
        continue
      }

      console.log(`🔍 [System Monitor] Checking domain: ${domain} (${config.displayName})`)

      try {
        // Get stuck records using domain-specific Convex query
        let stuckRecords: any[] = []

        if (domain === 'invoices') {
          stuckRecords = await client.query(api.functions.invoices.getStuckInvoices, {
            businessId,
            timeoutThreshold,
            limit: MAX_RECORDS_TO_PROCESS
          })
        } else if (domain === 'expense_claims') {
          stuckRecords = await client.query(api.functions.expenseClaims.getStuckRecords, {
            businessId,
            timeoutThreshold,
            limit: MAX_RECORDS_TO_PROCESS
          })
        }

        allResults.domains_checked.push(domain)

        if (!stuckRecords || stuckRecords.length === 0) {
          console.log(`✅ [System Monitor] No stuck records found for ${domain}`)
          allResults.domain_results[domain] = {
            display_name: config.displayName,
            stuck_records_found: 0,
            fixed_records: 0,
            checked: true
          }
          continue
        }

        console.log(`⚠️ [System Monitor] Found ${stuckRecords.length} stuck records for ${domain}`)

        // Prepare records for batch update
        const recordsToUpdate = stuckRecords.map(record => {
          // Calculate how long it's been stuck
          const processingStarted = record.processingStartedAt || record.updatedAt || 0
          const minutesStuck = Math.floor((Date.now() - processingStarted) / (1000 * 60))

          console.log(`🚨 [System Monitor] Processing stuck ${domain} record ${record.id} - stuck for ${minutesStuck} minutes`)

          return {
            id: String(record.id),
            minutesStuck,
            errorMetadata: createStuckRecordFailureMetadata(minutesStuck, domain)
          }
        })

        // Batch update using domain-specific Convex mutation
        let updateResults: { fixed: string[], failed: { id: string; error: string }[] } = { fixed: [], failed: [] }

        if (domain === 'invoices') {
          updateResults = await client.mutation(api.functions.invoices.markStuckInvoicesFailed, {
            businessId,
            records: recordsToUpdate,
            actorUserId: userContext.userId
          })
        } else if (domain === 'expense_claims') {
          updateResults = await client.mutation(api.functions.expenseClaims.markStuckRecordsFailed, {
            businessId,
            records: recordsToUpdate,
            actorUserId: userContext.userId
          })
        }

        // Format results for response
        const fixedRecords = updateResults.fixed.map((id) => {
          const original = stuckRecords.find(r => String(r.id) === id)
          const updateRecord = recordsToUpdate.find(r => r.id === id)
          return {
            domain,
            record_id: id,
            minutes_stuck: updateRecord?.minutesStuck || 0,
            file_name: original?.fileName || original?.vendorName || 'Unknown'
          }
        })

        const failedFixes = updateResults.failed.map(f => ({
          domain,
          record_id: f.id,
          error: f.error
        }))

        // Store domain results
        allResults.domain_results[domain] = {
          display_name: config.displayName,
          stuck_records_found: stuckRecords.length,
          fixed_records_count: fixedRecords.length,
          failed_fixes_count: failedFixes.length,
          fixed_records: fixedRecords,
          failed_fixes: failedFixes,
          checked: true
        }

        // Update totals
        allResults.total_stuck_records += stuckRecords.length
        allResults.total_fixed_records += fixedRecords.length
        allResults.total_failed_fixes += failedFixes.length

      } catch (domainError) {
        console.error(`❌ [System Monitor] Error processing domain ${domain}:`, domainError)
        allResults.domain_results[domain] = {
          error: domainError instanceof Error ? domainError.message : 'Unknown error',
          checked: false
        }
      }
    }

    // Log audit event for monitoring action
    if (allResults.total_fixed_records > 0) {
      try {
        await client.mutation(api.functions.audit.logEvent, {
          businessId,
          actorUserId: userContext.userId,
          eventType: 'system.stuck_records_monitor_all_domains',
          targetEntityType: 'system_monitoring',
          targetEntityId: 'batch_operation',
          details: {
            action: 'auto_failed_stuck_records_all_domains',
            domains_checked: allResults.domains_checked,
            total_records_found: allResults.total_stuck_records,
            total_records_fixed: allResults.total_fixed_records,
            total_failed_fixes: allResults.total_failed_fixes,
            timeout_threshold_minutes: STUCK_TIMEOUT_MINUTES,
            domain_results: allResults.domain_results
          }
        })
      } catch (auditError) {
        console.error('❌ [System Monitor] Failed to log audit event:', auditError)
        // Don't fail the whole operation if audit logging fails
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...allResults,
        timeout_threshold_minutes: STUCK_TIMEOUT_MINUTES,
        checked_at: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('❌ [System Monitor] System error:', error)
    return NextResponse.json(
      { success: false, error: 'System error during stuck record monitoring' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/v1/system/monitor-stuck-records
 * Force-fail a specific record in any domain (admin override)
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

    const { domain, record_id, reason } = await request.json()

    if (!domain || !record_id) {
      return NextResponse.json(
        { success: false, error: 'domain and record_id are required' },
        { status: 400 }
      )
    }

    const config = DOMAIN_CONFIGS[domain]
    if (!config) {
      return NextResponse.json(
        { success: false, error: `Unknown domain: ${domain}` },
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
      processingStage: 'admin_manual_override',
      domain: domain as any
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
      overridden_by: userContext.userId,
      domain: domain
    }

    // Force fail using domain-specific Convex mutation
    let result: any

    if (domain === 'invoices') {
      result = await client.mutation(api.functions.invoices.forceFailInvoice, {
        businessId,
        invoiceId: record_id,
        reason: reason || undefined,
        errorMetadata
      })
    } else if (domain === 'expense_claims') {
      result = await client.mutation(api.functions.expenseClaims.forceFailRecord, {
        businessId,
        claimId: record_id,
        reason: reason || undefined,
        errorMetadata
      })
    } else {
      return NextResponse.json(
        { success: false, error: `Unsupported domain: ${domain}` },
        { status: 400 }
      )
    }

    // Log audit event for manual override
    try {
      await client.mutation(api.functions.audit.logEvent, {
        businessId,
        actorUserId: userContext.userId,
        eventType: `${domain}.manual_override_failed`,
        targetEntityType: domain,
        targetEntityId: record_id,
        details: {
          action: 'manual_force_fail',
          domain: domain,
          domain_display_name: config.displayName,
          original_status: result.originalStatus,
          reason: reason || 'No reason provided',
          minutes_stuck: result.minutesStuck
        }
      })
    } catch (auditError) {
      console.error('❌ [Manual Override] Failed to log audit event:', auditError)
      // Don't fail the operation if audit logging fails
    }

    console.log(`✅ [Manual Override] Admin ${userContext.userId} manually failed ${domain} record ${record_id}`)

    return NextResponse.json({
      success: true,
      data: {
        message: `${config.displayName} record manually marked as failed`,
        domain,
        record_id,
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
