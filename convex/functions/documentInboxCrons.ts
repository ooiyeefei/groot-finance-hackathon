/**
 * Document Inbox Cron Jobs (001-doc-email-forward)
 *
 * Data retention and cleanup crons for document inbox.
 * Implements 30-day archive + 7-year deletion per Malaysian tax requirements.
 */

import { internalMutation } from "../_generated/server";

/**
 * Archive documents after 30 days in "needs_review" status
 * Runs daily at 5:30 AM UTC
 */
export const archiveOldDocuments = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    // Find documents in needs_review status older than 30 days
    const oldDocuments = await ctx.db
      .query("document_inbox_entries")
      .withIndex("by_status", (q) => q.eq("status", "needs_review"))
      .filter((q) => q.lt(q.field("_creationTime"), thirtyDaysAgo))
      .collect();

    let archivedCount = 0;

    for (const doc of oldDocuments) {
      await ctx.db.patch(doc._id, {
        status: "archived",
        updatedAt: now,
      });
      archivedCount++;
    }

    console.log(`[DocumentInboxCron] Archived ${archivedCount} documents older than 30 days`);

    return {
      archivedCount,
      timestamp: now,
    };
  },
});

/**
 * Delete documents after 7-year retention period
 * Runs monthly on the 1st at 6:00 AM UTC
 */
export const deleteExpiredDocuments = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const sevenYearsAgo = now - 7 * 365 * 24 * 60 * 60 * 1000;

    // Find documents older than 7 years (any status)
    const expiredDocuments = await ctx.db
      .query("document_inbox_entries")
      .filter((q) => q.lt(q.field("_creationTime"), sevenYearsAgo))
      .collect();

    let deletedCount = 0;
    let filesDeleted = 0;

    for (const doc of expiredDocuments) {
      try {
        // Delete file from Convex storage
        await ctx.storage.delete(doc.fileStorageId);
        filesDeleted++;
      } catch (error) {
        console.log(`[DocumentInboxCron] Failed to delete file ${doc.fileStorageId}: ${error}`);
      }

      // Delete inbox entry
      await ctx.db.delete(doc._id);
      deletedCount++;
    }

    console.log(
      `[DocumentInboxCron] Deleted ${deletedCount} documents and ${filesDeleted} files older than 7 years`
    );

    return {
      deletedCount,
      filesDeleted,
      timestamp: now,
    };
  },
});
