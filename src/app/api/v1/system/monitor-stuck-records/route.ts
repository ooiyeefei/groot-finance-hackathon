/**
 * Domain-Agnostic Stuck Records Monitor API
 *
 * Monitors and fixes stuck records across ALL domains using Trigger.dev processing:
 * - invoices (process-document-ocr)
 * - expense_claims (extract-receipt-data)
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUserContextWithBusiness } from '@/domains/security/lib/rbac'
import { getUserFriendlyErrorMessage, type ErrorContext } from '@/lib/shared/error-message-mapper'

// Domain configuration for monitoring
interface DomainConfig {
  tableName: string;
  statusField: string;
  processingStatusField?: string; // Some domains use separate processing status
  stuckStatus: string[];
  processingStartedField: string;
  displayName: string;
}

const DOMAIN_CONFIGS: Record<string, DomainConfig> = {
  'invoices': {
    tableName: 'documents', // invoices table name may vary
    statusField: 'processing_status',
    stuckStatus: ['processing', 'analyzing'],
    processingStartedField: 'processing_started_at',
    displayName: 'Invoice Processing'
  },
  'expense_claims': {
    tableName: 'expense_claims',
    statusField: 'status',
    processingStatusField: 'processing_status', // Has separate field for processing status
    stuckStatus: ['analyzing'],
    processingStartedField: 'processing_started_at',
    displayName: 'Receipt Processing'
  }
};

// Timeout configuration
const STUCK_TIMEOUT_MINUTES = 10 // Mark as failed after 10 minutes in processing status
const MAX_RECORDS_TO_PROCESS = 50 // Batch size limit for safety

// Initialize Supabase client with service role for admin operations
const supabaseServiceRole = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
)

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

    const businessId = userContext.profile.business_id
    const { searchParams } = new URL(request.url)
    const targetDomain = searchParams.get('domain') // Optional: monitor specific domain

    // Calculate timeout threshold
    const timeoutThreshold = new Date()
    timeoutThreshold.setMinutes(timeoutThreshold.getMinutes() - STUCK_TIMEOUT_MINUTES)

    console.log(`🔍 [System Monitor] Checking for stuck records older than: ${timeoutThreshold.toISOString()}`)

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
        // Build query for stuck records in this domain
        let query = supabaseServiceRole
          .from(config.tableName)
          .select('id, processing_started_at, updated_at, user_id, status')

        // Add business_id filter if the table supports it
        if (config.tableName !== 'documents') { // documents table might not have business_id
          query = query.eq('business_id', businessId)
        }

        // Add status conditions for stuck records
        if (config.stuckStatus.length === 1) {
          query = query.eq(config.statusField, config.stuckStatus[0])
        } else {
          query = query.in(config.statusField, config.stuckStatus)
        }

        // Add timeout condition
        query = query
          .lt(config.processingStartedField, timeoutThreshold.toISOString())
          .limit(MAX_RECORDS_TO_PROCESS)

        const { data: stuckRecords, error: findError } = await query

        if (findError) {
          console.error(`❌ [System Monitor] Database query error for ${domain}:`, findError)
          allResults.domain_results[domain] = {
            error: findError.message,
            checked: false
          }
          continue
        }

        allResults.domains_checked.push(domain)

        if (!stuckRecords || stuckRecords.length === 0) {
          console.log(`✅ [System Monitor] No stuck records found for ${domain}`)
          allResults.domain_results[domain] = {
            stuck_records_found: 0,
            fixed_records: 0,
            checked: true
          }
          continue
        }

        console.log(`⚠️ [System Monitor] Found ${stuckRecords.length} stuck records for ${domain}`)

        // Process each stuck record
        const fixedRecords = []
        const failedFixes = []

        for (const record of stuckRecords) {
          try {
            // Calculate how long it's been stuck
            const processingStarted = new Date(record.processing_started_at || record.updated_at)
            const minutesStuck = Math.floor((Date.now() - processingStarted.getTime()) / (1000 * 60))

            console.log(`🚨 [System Monitor] Processing stuck ${domain} record ${record.id} - stuck for ${minutesStuck} minutes`)

            // Create failure metadata
            const failureMetadata = createStuckRecordFailureMetadata(minutesStuck, domain)

            // Update the stuck record to 'failed' status
            const updateData: any = {
              [config.statusField]: 'failed',
              processing_metadata: failureMetadata,
              updated_at: new Date().toISOString()
            }

            // If domain has separate processing status field, update that too
            if (config.processingStatusField) {
              updateData[config.processingStatusField] = 'failed'
            }

            const { error: updateError } = await supabaseServiceRole
              .from(config.tableName)
              .update(updateData)
              .eq('id', record.id)

            if (updateError) {
              console.error(`❌ [System Monitor] Failed to update ${domain} record ${record.id}:`, updateError)
              failedFixes.push({
                domain,
                record_id: record.id,
                error: updateError.message
              })
            } else {
              console.log(`✅ [System Monitor] Successfully marked ${domain} record ${record.id} as failed`)
              fixedRecords.push({
                domain,
                record_id: record.id,
                minutes_stuck: minutesStuck
              })
            }
          } catch (error) {
            console.error(`❌ [System Monitor] Error processing ${domain} record ${record.id}:`, error)
            failedFixes.push({
              domain,
              record_id: record.id,
              error: error instanceof Error ? error.message : 'Unknown error'
            })
          }
        }

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
        await supabaseServiceRole
          .from('audit_events')
          .insert({
            business_id: businessId,
            actor_user_id: userContext.userId,
            event_type: 'system.stuck_records_monitor_all_domains',
            target_entity_type: 'system_monitoring',
            target_entity_id: null, // Multiple records
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

    const businessId = userContext.profile.business_id

    // Get the record to verify it exists and is in our business
    let query = supabaseServiceRole
      .from(config.tableName)
      .select(`id, ${config.statusField}, ${config.processingStartedField}, user_id`)
      .eq('id', record_id)

    // Add business_id filter if the table supports it
    if (config.tableName !== 'documents') {
      query = query.eq('business_id', businessId)
    }

    const { data: record, error: fetchError } = await query.single()

    if (fetchError || !record) {
      return NextResponse.json(
        { success: false, error: `${config.displayName} record not found` },
        { status: 404 }
      )
    }

    // Calculate how long it's been stuck (if applicable)
    let minutesStuck = 0
    if ((record as any)[config.processingStartedField]) {
      const processingStarted = new Date((record as any)[config.processingStartedField])
      minutesStuck = Math.floor((Date.now() - processingStarted.getTime()) / (1000 * 60))
    }

    // Create error context for manual override
    const errorContext: ErrorContext = {
      errorCode: 'MANUAL_OVERRIDE',
      errorCategory: 'admin_override',
      technicalError: `Manually failed by admin user ${userContext.userId}. Original status: ${(record as any)[config.statusField]}`,
      processingStage: 'admin_manual_override',
      domain: domain as any
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
      technical_error: `Manually failed by admin user ${userContext.userId}. Original status: ${(record as any)[config.statusField]}`,
      failed_at: new Date().toISOString(),
      processing_stage: 'admin_manual_override',
      failure_level: 'admin_action',
      minutes_stuck: minutesStuck,
      override_reason: reason,
      overridden_by: userContext.userId,
      domain: domain
    }

    // Update the record to 'failed' status
    const updateData: any = {
      [config.statusField]: 'failed',
      processing_metadata: failureMetadata,
      updated_at: new Date().toISOString()
    }

    // If domain has separate processing status field, update that too
    if (config.processingStatusField) {
      updateData[config.processingStatusField] = 'failed'
    }

    const { error: updateError } = await supabaseServiceRole
      .from(config.tableName)
      .update(updateData)
      .eq('id', record_id)

    if (updateError) {
      console.error(`❌ [Manual Override] Failed to update ${domain} record ${record_id}:`, updateError)
      return NextResponse.json(
        { success: false, error: `Failed to update ${config.displayName.toLowerCase()} status` },
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
          event_type: `${domain}.manual_override_failed`,
          target_entity_type: domain,
          target_entity_id: record_id,
          details: {
            action: 'manual_force_fail',
            domain: domain,
            domain_display_name: config.displayName,
            original_status: (record as any)[config.statusField],
            reason: reason || 'No reason provided',
            minutes_stuck: minutesStuck
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
        original_status: (record as any)[config.statusField],
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