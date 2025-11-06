/**
 * Cleanup Stuck Documents - Background Job
 *
 * Resets documents stuck in 'analyzing' status after timeout period.
 * Prevents documents from being permanently stuck when Trigger.dev jobs fail/expire.
 *
 * Runs every 15 minutes to check for documents stuck for more than 30 minutes.
 */

import { task, schedules } from "@trigger.dev/sdk/v3";
import { supabase } from './utils/db-helpers';

/**
 * Scheduled cleanup job - runs every 15 minutes
 */
export const cleanupStuckDocuments = schedules.task({
  id: "cleanup-stuck-documents",
  cron: "*/15 * * * *", // Every 15 minutes
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
  },
  run: async (payload) => {
    console.log('[Cleanup] Starting cleanup of stuck documents at:', payload.timestamp);

    const STUCK_TIMEOUT_MINUTES = 30; // Consider documents stuck after 30 minutes
    const cutoffTime = new Date(Date.now() - STUCK_TIMEOUT_MINUTES * 60 * 1000).toISOString();

    try {
      // Find documents stuck in 'analyzing' status for more than 30 minutes
      const { data: stuckDocuments, error: queryError } = await supabase
        .from('invoices')
        .select('id, file_name, status, updated_at, created_at')
        .eq('status', 'analyzing')
        .lt('updated_at', cutoffTime)
        .is('deleted_at', null);

      if (queryError) {
        console.error('[Cleanup] Failed to query stuck documents:', queryError);
        throw new Error(`Database query failed: ${queryError.message}`);
      }

      if (!stuckDocuments || stuckDocuments.length === 0) {
        console.log('[Cleanup] No stuck documents found');
        return {
          documentsFound: 0,
          documentsReset: 0,
          timestamp: payload.timestamp
        };
      }

      console.log(`[Cleanup] Found ${stuckDocuments.length} stuck documents:`,
        stuckDocuments.map(doc => ({ id: doc.id, file_name: doc.file_name, stuck_since: doc.updated_at }))
      );

      // Reset stuck documents to 'pending' status with error message
      const resetUpdates = stuckDocuments.map(doc => ({
        id: doc.id,
        status: 'pending' as const,
        error_message: {
          message: 'Processing timed out and was automatically reset',
          suggestions: [
            'Click "Reprocess" to try again',
            'If the issue persists, the document may be corrupted',
            'Try uploading a different version of the document'
          ],
          error_type: 'timeout_reset',
          reset_by: 'automated_cleanup',
          original_stuck_since: doc.updated_at
        },
        updated_at: new Date().toISOString()
      }));

      // Batch update all stuck documents
      let resetCount = 0;
      const errors: string[] = [];

      for (const update of resetUpdates) {
        try {
          const { error: updateError } = await supabase
            .from('invoices')
            .update({
              status: update.status,
              error_message: update.error_message,
              updated_at: update.updated_at
            })
            .eq('id', update.id)
            .eq('status', 'analyzing'); // Additional safety check

          if (updateError) {
            console.error(`[Cleanup] Failed to reset document ${update.id}:`, updateError);
            errors.push(`${update.id}: ${updateError.message}`);
          } else {
            resetCount++;
            console.log(`[Cleanup] Reset document ${update.id} (${stuckDocuments.find(d => d.id === update.id)?.file_name})`);
          }
        } catch (error) {
          console.error(`[Cleanup] Unexpected error resetting document ${update.id}:`, error);
          errors.push(`${update.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      const result = {
        documentsFound: stuckDocuments.length,
        documentsReset: resetCount,
        errors: errors.length > 0 ? errors : undefined,
        cutoffTime,
        timestamp: payload.timestamp
      };

      if (resetCount > 0) {
        console.log(`[Cleanup] Successfully reset ${resetCount}/${stuckDocuments.length} stuck documents`);
      }

      if (errors.length > 0) {
        console.error(`[Cleanup] Failed to reset ${errors.length} documents:`, errors);
      }

      return result;

    } catch (error) {
      console.error('[Cleanup] Cleanup job failed:', error);
      throw error; // Re-throw for Trigger.dev retry handling
    }
  },
});

/**
 * Manual cleanup trigger - can be called on-demand
 */
export const manualCleanupStuckDocuments = task({
  id: "manual-cleanup-stuck-documents",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
  },
  run: async (payload: { timeoutMinutes?: number }) => {
    console.log('[Manual Cleanup] Starting manual cleanup of stuck documents');

    const timeoutMinutes = payload.timeoutMinutes || 10; // Default 10 minutes for manual cleanup
    const cutoffTime = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();

    // Use same logic as scheduled job but with custom timeout
    const mockSchedulePayload = {
      timestamp: new Date(),
      lastTimestamp: null,
      upcoming: []
    };

    console.log(`[Manual Cleanup] Using ${timeoutMinutes} minute timeout (documents stuck since ${cutoffTime})`);

    // Call the same cleanup logic but with different timeout
    const STUCK_TIMEOUT_MINUTES = timeoutMinutes;
    const stuckCutoffTime = new Date(Date.now() - STUCK_TIMEOUT_MINUTES * 60 * 1000).toISOString();

    try {
      const { data: stuckDocuments, error: queryError } = await supabase
        .from('invoices')
        .select('id, file_name, status, updated_at, created_at')
        .eq('status', 'analyzing')
        .lt('updated_at', stuckCutoffTime)
        .is('deleted_at', null);

      if (queryError) {
        console.error('[Manual Cleanup] Failed to query stuck documents:', queryError);
        throw new Error(`Database query failed: ${queryError.message}`);
      }

      if (!stuckDocuments || stuckDocuments.length === 0) {
        console.log('[Manual Cleanup] No stuck documents found');
        return {
          documentsFound: 0,
          documentsReset: 0,
          timeoutMinutes,
          cutoffTime: stuckCutoffTime
        };
      }

      console.log(`[Manual Cleanup] Found ${stuckDocuments.length} stuck documents`);

      // Reset logic (same as scheduled job)
      let resetCount = 0;
      for (const doc of stuckDocuments) {
        try {
          const { error: updateError } = await supabase
            .from('invoices')
            .update({
              status: 'pending',
              error_message: {
                message: 'Processing was manually reset due to timeout',
                suggestions: [
                  'Click "Reprocess" to try again',
                  'If the issue persists, contact support',
                  'Document may need to be re-uploaded'
                ],
                error_type: 'manual_timeout_reset',
                reset_by: 'manual_cleanup'
              },
              updated_at: new Date().toISOString()
            })
            .eq('id', doc.id)
            .eq('status', 'analyzing');

          if (!updateError) {
            resetCount++;
            console.log(`[Manual Cleanup] Reset document ${doc.id} (${doc.file_name})`);
          }
        } catch (error) {
          console.error(`[Manual Cleanup] Error resetting ${doc.id}:`, error);
        }
      }

      return {
        documentsFound: stuckDocuments.length,
        documentsReset: resetCount,
        timeoutMinutes,
        cutoffTime: stuckCutoffTime
      };

    } catch (error) {
      console.error('[Manual Cleanup] Manual cleanup failed:', error);
      throw error;
    }
  },
});