/**
 * Notification Digest Module
 *
 * Calls convex/functions/notificationJobs.ts:runDigest
 * via Convex HTTP API.
 */

import { convexAction } from '../lib/convex-client';
import { JobResult } from '../lib/types';

export async function runNotificationDigest(): Promise<Omit<JobResult, 'durationMs'>> {
  console.log('[NotificationDigest] Calling Convex action...');

  try {
    const result = await convexAction<{
      usersProcessed: number;
      emailsSent: number;
      durationMs: number;
    }>('functions/notificationJobs:runDigest', {});

    console.log(
      `[NotificationDigest] Complete: ${result.usersProcessed} users, ${result.emailsSent} emails sent`
    );

    return {
      module: 'notification-digest',
      status: 'success',
      documentsRead: result.usersProcessed,
      documentsWritten: result.emailsSent,
    };
  } catch (error) {
    console.error('[NotificationDigest] Error:', error);
    return {
      module: 'notification-digest',
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
