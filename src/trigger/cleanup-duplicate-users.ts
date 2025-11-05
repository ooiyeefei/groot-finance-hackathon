/**
 * Automated Duplicate User Cleanup Task
 *
 * Purpose: Detect and resolve duplicate user records created by race conditions
 * Schedule: Weekly execution to maintain data integrity
 * Security: Validates email and business_id consistency before merging
 */

import { task, schedules } from "@trigger.dev/sdk";
import { createClient } from '@supabase/supabase-js';

interface DuplicateGroup {
  clerk_user_id: string;
  records: Array<{
    id: string;
    email: string;
    business_id: string | null;
    created_at: string;
    full_name: string | null;
  }>;
}

interface AuditLog {
  clerk_user_id: string;
  action: 'merged' | 'archived' | 'skipped';
  kept_record_id: string;
  removed_record_ids: string[];
  reason: string;
  timestamp: string;
}

/**
 * Scheduled task: Run weekly on Sundays at 2 AM UTC
 */
export const cleanupDuplicateUsersScheduled = schedules.task({
  id: "cleanup-duplicate-users-scheduled",
  cron: "0 2 * * 0", // Weekly on Sundays at 2 AM UTC
  run: async (payload) => {
    console.log(`[Cleanup] Starting scheduled duplicate user cleanup at ${payload.timestamp}`);

    const result = await cleanupDuplicateUsersTask.trigger({
      dryRun: false,
      triggerSource: 'scheduled'
    });

    return {
      scheduled_at: payload.timestamp,
      task_id: result.id,
      message: 'Duplicate user cleanup initiated'
    };
  }
});

/**
 * Manual cleanup task: Can be triggered on-demand via Trigger.dev dashboard
 */
export const cleanupDuplicateUsersTask = task({
  id: "cleanup-duplicate-users",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
  },
  run: async (payload: { dryRun?: boolean; triggerSource?: string }) => {
    const isDryRun = payload.dryRun ?? false;
    const source = payload.triggerSource || 'manual';

    console.log(`[Cleanup] Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}, Source: ${source}`);

    // Create service role client (bypasses RLS for admin operations)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    try {
      // Step 1: Find all duplicate user records
      console.log('[Cleanup] Step 1: Detecting duplicate user records...');

      const { data: allUsers, error: fetchError } = await supabase
        .from('users')
        .select('id, clerk_user_id, email, business_id, created_at, full_name')
        .not('clerk_user_id', 'is', null)
        .order('created_at', { ascending: false });

      if (fetchError) {
        throw new Error(`Failed to fetch users: ${fetchError.message}`);
      }

      // Group by clerk_user_id to find duplicates
      const groupedUsers = new Map<string, DuplicateGroup>();

      for (const user of allUsers || []) {
        if (!groupedUsers.has(user.clerk_user_id)) {
          groupedUsers.set(user.clerk_user_id, {
            clerk_user_id: user.clerk_user_id,
            records: []
          });
        }
        groupedUsers.get(user.clerk_user_id)!.records.push(user);
      }

      // Filter to only groups with duplicates (2+ records)
      const duplicateGroups = Array.from(groupedUsers.values())
        .filter(group => group.records.length > 1);

      console.log(`[Cleanup] Found ${duplicateGroups.length} users with duplicate records`);

      if (duplicateGroups.length === 0) {
        return {
          success: true,
          duplicates_found: 0,
          duplicates_resolved: 0,
          message: 'No duplicate user records found - database is clean'
        };
      }

      // Step 2: Validate and resolve each duplicate group
      const auditLogs: AuditLog[] = [];
      let resolvedCount = 0;
      let skippedCount = 0;

      for (const group of duplicateGroups) {
        console.log(`[Cleanup] Processing ${group.records.length} duplicates for clerk_user_id: ${group.clerk_user_id}`);

        // Security validation: Check email consistency
        const emails = group.records.map(r => r.email).filter(Boolean);
        const uniqueEmails = [...new Set(emails)];

        if (uniqueEmails.length > 1) {
          console.error(`[Cleanup] SECURITY VIOLATION: Different emails for ${group.clerk_user_id}: ${uniqueEmails.join(', ')}`);
          auditLogs.push({
            clerk_user_id: group.clerk_user_id,
            action: 'skipped',
            kept_record_id: '',
            removed_record_ids: group.records.map(r => r.id),
            reason: `SECURITY: Multiple emails detected - manual review required`,
            timestamp: new Date().toISOString()
          });
          skippedCount++;
          continue;
        }

        // Security validation: Check business_id consistency
        const businessIds = group.records.map(r => r.business_id).filter(Boolean);
        const uniqueBusinessIds = [...new Set(businessIds)];

        if (uniqueBusinessIds.length > 1) {
          console.error(`[Cleanup] SECURITY VIOLATION: Different business_ids for ${group.clerk_user_id}`);
          auditLogs.push({
            clerk_user_id: group.clerk_user_id,
            action: 'skipped',
            kept_record_id: '',
            removed_record_ids: group.records.map(r => r.id),
            reason: `SECURITY: Multiple business_ids detected - manual review required`,
            timestamp: new Date().toISOString()
          });
          skippedCount++;
          continue;
        }

        // Select the "canonical" record to keep
        // Priority: 1) Has business_id, 2) Most recent created_at
        const recordsWithBusiness = group.records.filter(r => r.business_id);
        const canonicalRecord = recordsWithBusiness.length > 0
          ? recordsWithBusiness[0] // Most recent with business_id
          : group.records[0]; // Most recent overall

        const recordsToRemove = group.records.filter(r => r.id !== canonicalRecord.id);

        console.log(`[Cleanup] Selected canonical record: ${canonicalRecord.id}`);
        console.log(`[Cleanup] Will remove ${recordsToRemove.length} duplicate(s)`);

        if (isDryRun) {
          console.log(`[Cleanup] DRY RUN: Would keep ${canonicalRecord.id}, remove ${recordsToRemove.map(r => r.id).join(', ')}`);
          auditLogs.push({
            clerk_user_id: group.clerk_user_id,
            action: 'merged',
            kept_record_id: canonicalRecord.id,
            removed_record_ids: recordsToRemove.map(r => r.id),
            reason: 'DRY RUN: No actual changes made',
            timestamp: new Date().toISOString()
          });
          resolvedCount++;
          continue;
        }

        // Step 3: Update foreign key references to canonical record
        for (const duplicateRecord of recordsToRemove) {
          console.log(`[Cleanup] Migrating data from ${duplicateRecord.id} to ${canonicalRecord.id}`);

          // Update business_memberships
          const { error: membershipError } = await supabase
            .from('business_memberships')
            .update({ user_id: canonicalRecord.id })
            .eq('user_id', duplicateRecord.id);

          if (membershipError) {
            console.error(`[Cleanup] Failed to update business_memberships: ${membershipError.message}`);
          }

          // Update conversations (chat history)
          const { error: conversationError } = await supabase
            .from('conversations')
            .update({ user_id: canonicalRecord.id })
            .eq('user_id', duplicateRecord.id);

          if (conversationError) {
            console.error(`[Cleanup] Failed to update conversations: ${conversationError.message}`);
          }

          // Update expense_claims
          const { error: expenseError } = await supabase
            .from('expense_claims')
            .update({ user_id: canonicalRecord.id })
            .eq('user_id', duplicateRecord.id);

          if (expenseError) {
            console.error(`[Cleanup] Failed to update expense_claims: ${expenseError.message}`);
          }

          // Update accounting_entries
          const { error: accountingError } = await supabase
            .from('accounting_entries')
            .update({ user_id: canonicalRecord.id })
            .eq('user_id', duplicateRecord.id);

          if (accountingError) {
            console.error(`[Cleanup] Failed to update accounting_entries: ${accountingError.message}`);
          }
        }

        // Step 4: Soft delete duplicate records
        const { error: deleteError } = await supabase
          .from('users')
          .update({
            clerk_user_id: null, // Unlink to prevent conflicts
            email: `archived_${Date.now()}_${group.records[0].email}`, // Archive email
            updated_at: new Date().toISOString()
          })
          .in('id', recordsToRemove.map(r => r.id));

        if (deleteError) {
          console.error(`[Cleanup] Failed to archive duplicate records: ${deleteError.message}`);
          auditLogs.push({
            clerk_user_id: group.clerk_user_id,
            action: 'skipped',
            kept_record_id: canonicalRecord.id,
            removed_record_ids: recordsToRemove.map(r => r.id),
            reason: `ERROR: ${deleteError.message}`,
            timestamp: new Date().toISOString()
          });
          skippedCount++;
          continue;
        }

        console.log(`[Cleanup] ✅ Successfully resolved duplicates for ${group.clerk_user_id}`);

        auditLogs.push({
          clerk_user_id: group.clerk_user_id,
          action: 'merged',
          kept_record_id: canonicalRecord.id,
          removed_record_ids: recordsToRemove.map(r => r.id),
          reason: 'Duplicate records merged successfully',
          timestamp: new Date().toISOString()
        });

        resolvedCount++;
      }

      // Step 5: Store audit logs
      if (auditLogs.length > 0 && !isDryRun) {
        const { error: auditError } = await supabase
          .from('system_audit_logs')
          .insert({
            action: 'cleanup_duplicate_users',
            resource_type: 'users',
            metadata: {
              audit_logs: auditLogs,
              total_groups: duplicateGroups.length,
              resolved: resolvedCount,
              skipped: skippedCount,
              dry_run: isDryRun
            },
            created_at: new Date().toISOString()
          });

        if (auditError) {
          console.warn(`[Cleanup] Failed to store audit logs: ${auditError.message}`);
        }
      }

      // Step 6: Return summary
      return {
        success: true,
        dry_run: isDryRun,
        duplicates_found: duplicateGroups.length,
        duplicates_resolved: resolvedCount,
        duplicates_skipped: skippedCount,
        audit_logs: auditLogs,
        message: isDryRun
          ? 'Dry run completed - no changes made'
          : `Cleanup completed: ${resolvedCount} resolved, ${skippedCount} skipped`
      };

    } catch (error) {
      console.error('[Cleanup] Fatal error during cleanup:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duplicates_found: 0,
        duplicates_resolved: 0,
        message: 'Cleanup failed - see error details'
      };
    }
  }
});

/**
 * Manual dry run task for testing (no actual changes)
 */
export const cleanupDuplicateUsersDryRun = task({
  id: "cleanup-duplicate-users-dry-run",
  run: async () => {
    console.log('[Cleanup] Starting DRY RUN mode - no changes will be made');

    const result = await cleanupDuplicateUsersTask.triggerAndWait({
      dryRun: true,
      triggerSource: 'manual-dry-run'
    });

    // Handle Result object properly - check ok before accessing output
    if (result.ok) {
      return result.output;
    } else {
      throw new Error(`Dry run task failed: ${result.error}`);
    }
  }
});
