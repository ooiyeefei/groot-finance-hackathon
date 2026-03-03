/**
 * Retention Jobs — PDPA compliance orchestration actions
 *
 * These internalActions coordinate data deletion across multiple systems:
 * - Convex (database records)
 * - Qdrant Cloud (Mem0 conversation memories)
 * - Clerk (user identity)
 *
 * Actions (not mutations) because they need external HTTP calls to Qdrant/Clerk.
 * Each action delegates DB operations to internalMutations/internalQueries
 * in the relevant domain files (conversations.ts, users.ts).
 *
 * Required Convex env vars (set via `npx convex env set`):
 * - QDRANT_URL: Qdrant Cloud REST endpoint
 * - QDRANT_API_KEY: Qdrant Cloud API key
 * - QDRANT_MEMORIES_COLLECTION: Collection name (default: "user_memories")
 * - CLERK_SECRET_KEY: Clerk Backend API secret key
 */

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Delete Qdrant memory vectors by user ID filter
 * Returns true if successful or Qdrant not configured (graceful skip)
 */
async function deleteQdrantMemories(clerkUserId: string): Promise<boolean> {
  const qdrantUrl = process.env.QDRANT_URL;
  const qdrantApiKey = process.env.QDRANT_API_KEY;
  const collection = process.env.QDRANT_MEMORIES_COLLECTION || "user_memories";

  if (!qdrantUrl || !qdrantApiKey) {
    return true; // Not configured — skip gracefully
  }

  try {
    const response = await fetch(
      `${qdrantUrl}/collections/${collection}/points/delete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": qdrantApiKey,
        },
        body: JSON.stringify({
          filter: {
            must: [{ key: "user_id", match: { value: clerkUserId } }],
          },
        }),
      }
    );

    if (response.ok) {
      console.log(
        `[Retention Cleanup] Deleted Qdrant memories for user ${clerkUserId}`
      );
      return true;
    } else {
      console.error(
        `[Retention Cleanup] Qdrant deletion failed for ${clerkUserId}: ${response.status}`
      );
      return false;
    }
  } catch (error) {
    console.error(
      `[Retention Cleanup] Qdrant error for ${clerkUserId}:`,
      error
    );
    return false;
  }
}

// ============================================
// Conversation Cleanup (2-year retention + Mem0)
// ============================================

/**
 * Delete expired conversations + clean up Mem0 memories (PDPA)
 *
 * Called daily by cron at 3:30 AM UTC.
 * 1. Calls conversations.deleteExpiredRecords for DB cleanup
 * 2. For users with no remaining conversations, deletes Mem0/Qdrant memories
 */
export const cleanupExpiredConversations = internalAction({
  args: {},
  handler: async (ctx): Promise<{ deleted: number; messagesDeleted: number; affectedUserIds: string[]; memoriesDeleted: number }> => {
    // Step 1: Delete expired conversations from Convex
    // @ts-ignore - Convex internal API types
    const result = await ctx.runMutation(
      internal.functions.conversations.deleteExpiredRecords
    );

    if (result.deleted === 0) {
      return { ...result, memoriesDeleted: 0 };
    }

    // Step 2: For each affected user, check if they have remaining conversations
    // Only delete Mem0 memories if the user has NO remaining conversations
    let memoriesDeleted = 0;

    for (const clerkUserId of result.affectedUserIds) {
      // @ts-ignore - Convex internal API types
      const hasRemaining = await ctx.runQuery(
        internal.functions.conversations.hasRemainingConversations,
        { clerkUserId }
      );

      if (!hasRemaining) {
        const success = await deleteQdrantMemories(clerkUserId);
        if (success) memoriesDeleted++;
      }
    }

    if (memoriesDeleted > 0) {
      console.log(
        JSON.stringify({
          type: "retention_cleanup_mem0",
          usersWithMemoriesDeleted: memoriesDeleted,
          timestamp: new Date().toISOString(),
        })
      );
    }

    return { ...result, memoriesDeleted };
  },
});

// ============================================
// User Hard-Delete (90-day soft-delete retention + Clerk + Mem0)
// ============================================

/**
 * Hard-delete expired users from all systems (PDPA compliance)
 *
 * Called daily by cron at 5:00 AM UTC.
 * For each user whose soft-delete retention (90 days) has expired:
 * 1. Delete from Clerk (identity provider)
 * 2. Delete Mem0/Qdrant memories
 * 3. Delete from Convex (DB records, conversations, memberships)
 */
export const hardDeleteExpiredUsers = internalAction({
  args: {},
  handler: async (ctx): Promise<{ deleted: number }> => {
    // @ts-ignore - Convex internal API types
    const expiredUsers = await ctx.runQuery(
      internal.functions.users.findExpiredSoftDeletedUsers
    );

    if (expiredUsers.length === 0) {
      console.log(
        JSON.stringify({
          type: "retention_cleanup",
          table: "users",
          deleted: 0,
          timestamp: new Date().toISOString(),
        })
      );
      return { deleted: 0 };
    }

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    let deleted = 0;

    for (const user of expiredUsers) {
      try {
        // Step 1: Delete from Clerk
        if (clerkSecretKey && user.clerkUserId) {
          try {
            const clerkResponse = await fetch(
              `https://api.clerk.com/v1/users/${user.clerkUserId}`,
              {
                method: "DELETE",
                headers: { Authorization: `Bearer ${clerkSecretKey}` },
              }
            );
            if (!clerkResponse.ok && clerkResponse.status !== 404) {
              console.error(
                `[Retention Cleanup] Clerk deletion failed for ${user.clerkUserId}: ${clerkResponse.status}`
              );
              continue; // Don't delete DB records if Clerk fails
            }
          } catch (error) {
            console.error(
              `[Retention Cleanup] Clerk API error for ${user.clerkUserId}:`,
              error
            );
            continue;
          }
        }

        // Step 2: Delete Mem0/Qdrant memories
        if (user.clerkUserId) {
          await deleteQdrantMemories(user.clerkUserId);
        }

        // Step 3: Delete from Convex (user, memberships, conversations, messages)
        // @ts-ignore - Convex internal API types
        await ctx.runMutation(
          internal.functions.users.hardDeleteUserRecords,
          { convexUserId: user.convexId }
        );

        deleted++;
      } catch (error) {
        console.error(
          `[Retention Cleanup] Failed to hard-delete user ${user.convexId}:`,
          error
        );
      }
    }

    console.log(
      JSON.stringify({
        type: "retention_cleanup",
        table: "users",
        deleted,
        total_eligible: expiredUsers.length,
        timestamp: new Date().toISOString(),
      })
    );

    return { deleted };
  },
});
