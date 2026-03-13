/**
 * Admin Functions - Internal queries and mutations for debugging and migration fixes
 *
 * These functions are NOT exposed to the public API and can only be called:
 * - From the Convex Dashboard
 * - From internal scripts with proper authorization
 */

import { v } from "convex/values";
import { internalQuery, internalMutation, query, mutation } from "../_generated/server";
import { Id } from "../_generated/dataModel";

// ============================================
// DEBUG QUERIES
// ============================================

/**
 * Debug: Get user by Convex ID to check their clerkUserId
 */
export const debugGetUserById = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    // Try as Convex ID first
    try {
      const user = await ctx.db.get(args.userId as Id<"users">);
      if (user) {
        return {
          found: true,
          source: "convex_id",
          user: {
            _id: user._id,
            clerkUserId: user.clerkUserId,
            email: user.email,
            fullName: user.fullName,
            legacyId: user.legacyId,
            businessId: user.businessId,
          },
        };
      }
    } catch (e) {
      // Not a valid Convex ID, try legacy lookup
    }

    // Try as legacy UUID
    const userByLegacy = await ctx.db
      .query("users")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", args.userId))
      .first();

    if (userByLegacy) {
      return {
        found: true,
        source: "legacy_id",
        user: {
          _id: userByLegacy._id,
          clerkUserId: userByLegacy.clerkUserId,
          email: userByLegacy.email,
          fullName: userByLegacy.fullName,
          legacyId: userByLegacy.legacyId,
          businessId: userByLegacy.businessId,
        },
      };
    }

    return { found: false, source: null, user: null };
  },
});

/**
 * Debug: Get accounting entry by ID to check its userId reference
 */
export const debugGetEntryById = internalQuery({
  args: { entryId: v.string() },
  handler: async (ctx, args) => {
    // Try as Convex ID first
    try {
      const entry = await ctx.db.get(args.entryId as Id<"accounting_entries">);
      if (entry) {
        // Also fetch the associated user
        const user = entry.userId ? await ctx.db.get(entry.userId) : null;

        return {
          found: true,
          source: "convex_id",
          entry: {
            _id: entry._id,
            userId: entry.userId,
            businessId: entry.businessId,
            legacyId: entry.legacyId,
            description: entry.description,
            deletedAt: entry.deletedAt,
          },
          associatedUser: user ? {
            _id: user._id,
            clerkUserId: user.clerkUserId,
            email: user.email,
          } : null,
        };
      }
    } catch (e) {
      // Not a valid Convex ID
    }

    // Try as legacy UUID
    const entryByLegacy = await ctx.db
      .query("accounting_entries")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", args.entryId))
      .first();

    if (entryByLegacy) {
      const user = entryByLegacy.userId ? await ctx.db.get(entryByLegacy.userId) : null;

      return {
        found: true,
        source: "legacy_id",
        entry: {
          _id: entryByLegacy._id,
          userId: entryByLegacy.userId,
          businessId: entryByLegacy.businessId,
          legacyId: entryByLegacy.legacyId,
          description: entryByLegacy.description,
          deletedAt: entryByLegacy.deletedAt,
        },
        associatedUser: user ? {
          _id: user._id,
          clerkUserId: user.clerkUserId,
          email: user.email,
        } : null,
      };
    }

    return { found: false, source: null, entry: null, associatedUser: null };
  },
});

/**
 * Debug: List all users with migrated_ clerkUserId prefix
 */
export const listMigratedUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const allUsers = await ctx.db.query("users").collect();

    const migratedUsers = allUsers.filter(
      (u) => u.clerkUserId?.startsWith("migrated_")
    );

    return {
      total: allUsers.length,
      migratedCount: migratedUsers.length,
      migratedUsers: migratedUsers.map((u) => ({
        _id: u._id,
        clerkUserId: u.clerkUserId,
        email: u.email,
        legacyId: u.legacyId,
      })),
    };
  },
});

/**
 * Debug: Find user by Clerk ID
 */
export const debugFindByClerkId = internalQuery({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();

    if (user) {
      return {
        found: true,
        user: {
          _id: user._id,
          clerkUserId: user.clerkUserId,
          email: user.email,
          legacyId: user.legacyId,
        },
      };
    }

    return { found: false, user: null };
  },
});

// ============================================
// FIX MUTATIONS
// ============================================

/**
 * Fix: Update a migrated user's clerkUserId to their real Clerk ID
 *
 * Call this when a user has clerkUserId = "migrated_xxx" but their
 * real Clerk ID is different.
 */
export const fixMigratedUserClerkId = internalMutation({
  args: {
    userId: v.id("users"),
    newClerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error(`User not found: ${args.userId}`);
    }

    const oldClerkUserId = user.clerkUserId;

    // Verify this is a migrated user
    if (!oldClerkUserId?.startsWith("migrated_")) {
      throw new Error(
        `User ${args.userId} does not have a migrated_ clerkUserId. Current: ${oldClerkUserId}`
      );
    }

    // Check if newClerkUserId is already used by another user
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.newClerkUserId))
      .first();

    if (existingUser && existingUser._id !== args.userId) {
      throw new Error(
        `Clerk ID ${args.newClerkUserId} is already used by user ${existingUser._id}`
      );
    }

    // Update the clerkUserId
    await ctx.db.patch(args.userId, {
      clerkUserId: args.newClerkUserId,
      updatedAt: Date.now(),
    });

    return {
      success: true,
      userId: args.userId,
      oldClerkUserId,
      newClerkUserId: args.newClerkUserId,
    };
  },
});

/**
 * Fix: Batch update migrated users' clerkUserIds
 *
 * Takes a mapping of userId -> newClerkUserId
 */
export const batchFixMigratedUserClerkIds = internalMutation({
  args: {
    updates: v.array(
      v.object({
        userId: v.id("users"),
        newClerkUserId: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const results = [];

    for (const update of args.updates) {
      try {
        const user = await ctx.db.get(update.userId);
        if (!user) {
          results.push({
            userId: update.userId,
            success: false,
            error: "User not found",
          });
          continue;
        }

        const oldClerkUserId = user.clerkUserId;

        // Skip if not a migrated user
        if (!oldClerkUserId?.startsWith("migrated_")) {
          results.push({
            userId: update.userId,
            success: false,
            error: `Not a migrated user. Current clerkUserId: ${oldClerkUserId}`,
          });
          continue;
        }

        // Check if newClerkUserId is already used
        const existingUser = await ctx.db
          .query("users")
          .withIndex("by_clerkUserId", (q) =>
            q.eq("clerkUserId", update.newClerkUserId)
          )
          .first();

        if (existingUser && existingUser._id !== update.userId) {
          results.push({
            userId: update.userId,
            success: false,
            error: `Clerk ID already used by ${existingUser._id}`,
          });
          continue;
        }

        // Update
        await ctx.db.patch(update.userId, {
          clerkUserId: update.newClerkUserId,
          updatedAt: Date.now(),
        });

        results.push({
          userId: update.userId,
          success: true,
          oldClerkUserId,
          newClerkUserId: update.newClerkUserId,
        });
      } catch (error) {
        results.push({
          userId: update.userId,
          success: false,
          error: String(error),
        });
      }
    }

    return {
      total: args.updates.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  },
});

/**
 * Debug: Find all users with a specific email
 */
export const debugFindUsersByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    // Note: This bypasses unique constraint check and finds all matching emails
    const allUsers = await ctx.db.query("users").collect();
    const matchingUsers = allUsers.filter(
      (u) => u.email?.toLowerCase() === args.email.toLowerCase()
    );

    return {
      totalUsers: allUsers.length,
      matchingCount: matchingUsers.length,
      users: matchingUsers.map((u) => ({
        _id: u._id,
        clerkUserId: u.clerkUserId,
        email: u.email,
        legacyId: u.legacyId,
        businessId: u.businessId,
        _creationTime: u._creationTime,
      })),
    };
  },
});

/**
 * Debug: Check membership for user and business
 */
export const debugCheckMembership = internalQuery({
  args: {
    userId: v.id("users"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", args.userId).eq("businessId", args.businessId)
      )
      .first();

    if (membership) {
      return {
        found: true,
        membership: {
          _id: membership._id,
          userId: membership.userId,
          businessId: membership.businessId,
          role: membership.role,
          status: membership.status,
        },
      };
    }

    // Also list all memberships for this user
    const allMemberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    return {
      found: false,
      membership: null,
      allUserMemberships: allMemberships.map((m) => ({
        _id: m._id,
        businessId: m.businessId,
        role: m.role,
        status: m.status,
      })),
    };
  },
});

/**
 * Debug: List all entries for a user (ignoring business filtering)
 */
export const debugListUserEntries = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    return {
      total: entries.length,
      entries: entries.map((e) => ({
        _id: e._id,
        legacyId: e.legacyId,
        businessId: e.businessId,
        description: e.description?.substring(0, 50),
        deletedAt: e.deletedAt,
      })),
    };
  },
});

/**
 * Fix: Merge duplicate users with the same clerkUserId
 *
 * Strategy:
 * 1. Find all users with the same clerkUserId
 * 2. Identify the canonical user (most accounting entries)
 * 3. Update all references to point to canonical user
 * 4. Delete duplicates
 */
export const mergeDuplicateUsers = internalMutation({
  args: { clerkUserId: v.string(), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const isDryRun = args.dryRun ?? true; // Default to dry run for safety

    // Find all users with this clerkUserId
    const users = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .collect();

    if (users.length <= 1) {
      return {
        success: true,
        message: "No duplicates found",
        duplicateCount: 0,
      };
    }

    console.log(`[MergeDuplicateUsers] Found ${users.length} users with clerkUserId ${args.clerkUserId}`);

    // Count entries for each user to find canonical
    const userEntryCounts: Array<{ userId: Id<"users">; entryCount: number }> = [];
    for (const user of users) {
      const entries = await ctx.db
        .query("accounting_entries")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();
      userEntryCounts.push({ userId: user._id, entryCount: entries.length });
    }

    // Sort by entry count (desc) to find canonical user
    userEntryCounts.sort((a, b) => b.entryCount - a.entryCount);
    const canonicalUserId = userEntryCounts[0].userId;
    const duplicateUserIds = userEntryCounts.slice(1).map((u) => u.userId);

    console.log(`[MergeDuplicateUsers] Canonical user: ${canonicalUserId} (${userEntryCounts[0].entryCount} entries)`);
    console.log(`[MergeDuplicateUsers] Duplicate users: ${duplicateUserIds.join(", ")}`);

    // Track changes
    const changes = {
      accountingEntries: 0,
      memberships: 0,
      invoices: 0,
      expenseClaims: 0,
      conversations: 0,
      messages: 0,
      usersDeleted: 0,
    };

    // Update all references for each duplicate user
    for (const duplicateId of duplicateUserIds) {
      // 1. Update accounting_entries
      const entries = await ctx.db
        .query("accounting_entries")
        .withIndex("by_userId", (q) => q.eq("userId", duplicateId))
        .collect();
      for (const entry of entries) {
        if (!isDryRun) {
          await ctx.db.patch(entry._id, { userId: canonicalUserId });
        }
        changes.accountingEntries++;
      }

      // 2. Update business_memberships
      const memberships = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId", (q) => q.eq("userId", duplicateId))
        .collect();
      for (const membership of memberships) {
        // Check if canonical user already has membership for this business
        const existingMembership = await ctx.db
          .query("business_memberships")
          .withIndex("by_userId_businessId", (q) =>
            q.eq("userId", canonicalUserId).eq("businessId", membership.businessId)
          )
          .first();

        if (existingMembership) {
          // Delete the duplicate membership
          if (!isDryRun) {
            await ctx.db.delete(membership._id);
          }
        } else {
          // Migrate membership to canonical user
          if (!isDryRun) {
            await ctx.db.patch(membership._id, { userId: canonicalUserId });
          }
        }
        changes.memberships++;
      }

      // 3. Update invoices
      const invoices = await ctx.db
        .query("invoices")
        .withIndex("by_userId", (q) => q.eq("userId", duplicateId))
        .collect();
      for (const invoice of invoices) {
        if (!isDryRun) {
          await ctx.db.patch(invoice._id, { userId: canonicalUserId });
        }
        changes.invoices++;
      }

      // 4. Update expense_claims
      const claims = await ctx.db
        .query("expense_claims")
        .withIndex("by_userId", (q) => q.eq("userId", duplicateId))
        .collect();
      for (const claim of claims) {
        if (!isDryRun) {
          await ctx.db.patch(claim._id, { userId: canonicalUserId });
        }
        changes.expenseClaims++;
      }

      // 5. Update conversations
      const conversations = await ctx.db
        .query("conversations")
        .withIndex("by_userId", (q) => q.eq("userId", duplicateId))
        .collect();
      for (const conv of conversations) {
        if (!isDryRun) {
          await ctx.db.patch(conv._id, { userId: canonicalUserId });
        }
        changes.conversations++;
      }

      // 6. Delete duplicate user
      if (!isDryRun) {
        await ctx.db.delete(duplicateId);
      }
      changes.usersDeleted++;
    }

    return {
      success: true,
      isDryRun,
      canonicalUserId,
      duplicateUserIds,
      changes,
      message: isDryRun
        ? "Dry run complete - no changes made"
        : `Merged ${duplicateUserIds.length} duplicate users into ${canonicalUserId}`,
    };
  },
});

/**
 * Find all users with duplicate clerkUserIds
 */
export const findAllDuplicateUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const allUsers = await ctx.db.query("users").collect();

    // Group by clerkUserId
    const byClerkId = new Map<string, typeof allUsers>();
    for (const user of allUsers) {
      if (!user.clerkUserId) continue;
      const existing = byClerkId.get(user.clerkUserId) || [];
      existing.push(user);
      byClerkId.set(user.clerkUserId, existing);
    }

    // Find duplicates
    const duplicates: Array<{
      clerkUserId: string;
      count: number;
      users: Array<{ _id: string; email?: string; businessId?: string }>;
    }> = [];

    for (const [clerkUserId, users] of byClerkId.entries()) {
      if (users.length > 1) {
        duplicates.push({
          clerkUserId,
          count: users.length,
          users: users.map((u) => ({
            _id: u._id,
            email: u.email,
            businessId: u.businessId,
          })),
        });
      }
    }

    return {
      totalUsers: allUsers.length,
      duplicateSets: duplicates.length,
      totalDuplicateUsers: duplicates.reduce((sum, d) => sum + d.count, 0),
      duplicates,
    };
  },
});

/**
 * Batch merge ALL duplicate users at once
 * WARNING: This is a destructive operation. Run with dryRun=true first!
 */
export const batchMergeAllDuplicates = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const isDryRun = args.dryRun ?? true;
    const allUsers = await ctx.db.query("users").collect();

    // Group by clerkUserId
    const byClerkId = new Map<string, typeof allUsers>();
    for (const user of allUsers) {
      if (!user.clerkUserId) continue;
      const existing = byClerkId.get(user.clerkUserId) || [];
      existing.push(user);
      byClerkId.set(user.clerkUserId, existing);
    }

    // Find and merge duplicates
    const results: Array<{
      clerkUserId: string;
      canonicalUserId: string;
      duplicatesRemoved: number;
      success: boolean;
      error?: string;
    }> = [];

    for (const [clerkUserId, users] of byClerkId.entries()) {
      if (users.length <= 1) continue;

      try {
        // Count entries for each user to find canonical
        const userEntryCounts: Array<{ userId: typeof users[0]["_id"]; entryCount: number }> = [];
        for (const user of users) {
          const entries = await ctx.db
            .query("accounting_entries")
            .withIndex("by_userId", (q) => q.eq("userId", user._id))
            .collect();
          userEntryCounts.push({ userId: user._id, entryCount: entries.length });
        }

        // Sort by entry count (desc) to find canonical user
        userEntryCounts.sort((a, b) => b.entryCount - a.entryCount);
        const canonicalUserId = userEntryCounts[0].userId;
        const duplicateUserIds = userEntryCounts.slice(1).map((u) => u.userId);

        // Update all references for each duplicate user
        for (const duplicateId of duplicateUserIds) {
          // 1. Update accounting_entries
          const entries = await ctx.db
            .query("accounting_entries")
            .withIndex("by_userId", (q) => q.eq("userId", duplicateId))
            .collect();
          for (const entry of entries) {
            if (!isDryRun) {
              await ctx.db.patch(entry._id, { userId: canonicalUserId });
            }
          }

          // 2. Update business_memberships
          const memberships = await ctx.db
            .query("business_memberships")
            .withIndex("by_userId", (q) => q.eq("userId", duplicateId))
            .collect();
          for (const membership of memberships) {
            const existingMembership = await ctx.db
              .query("business_memberships")
              .withIndex("by_userId_businessId", (q) =>
                q.eq("userId", canonicalUserId).eq("businessId", membership.businessId)
              )
              .first();
            if (existingMembership) {
              if (!isDryRun) await ctx.db.delete(membership._id);
            } else {
              if (!isDryRun) await ctx.db.patch(membership._id, { userId: canonicalUserId });
            }
          }

          // 3. Update invoices
          const invoices = await ctx.db
            .query("invoices")
            .withIndex("by_userId", (q) => q.eq("userId", duplicateId))
            .collect();
          for (const invoice of invoices) {
            if (!isDryRun) await ctx.db.patch(invoice._id, { userId: canonicalUserId });
          }

          // 4. Update expense_claims
          const claims = await ctx.db
            .query("expense_claims")
            .withIndex("by_userId", (q) => q.eq("userId", duplicateId))
            .collect();
          for (const claim of claims) {
            if (!isDryRun) await ctx.db.patch(claim._id, { userId: canonicalUserId });
          }

          // 5. Update conversations
          const conversations = await ctx.db
            .query("conversations")
            .withIndex("by_userId", (q) => q.eq("userId", duplicateId))
            .collect();
          for (const conv of conversations) {
            if (!isDryRun) await ctx.db.patch(conv._id, { userId: canonicalUserId });
          }

          // 6. Delete duplicate user
          if (!isDryRun) await ctx.db.delete(duplicateId);
        }

        results.push({
          clerkUserId,
          canonicalUserId,
          duplicatesRemoved: duplicateUserIds.length,
          success: true,
        });
      } catch (error) {
        results.push({
          clerkUserId,
          canonicalUserId: "",
          duplicatesRemoved: 0,
          success: false,
          error: String(error),
        });
      }
    }

    return {
      isDryRun,
      totalSets: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      totalDuplicatesRemoved: results.reduce((sum, r) => sum + r.duplicatesRemoved, 0),
      results,
    };
  },
});

// ============================================
// PUBLIC DEBUG QUERY (for authenticated admins)
// ============================================

/**
 * Debug query that can be called from the app (requires auth)
 * Useful for running from a debug page or API endpoint
 */
export const debugMigrationStatus = query({
  args: {
    legacyUserId: v.optional(v.string()),
    legacyEntryId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const result: {
      currentClerkId: string;
      userLookup: {
        foundByClerkId: boolean;
        foundByEmail: boolean;
        userData: any;
      } | null;
      entryLookup: any;
      diagnosis: string[];
    } = {
      currentClerkId: identity.subject,
      userLookup: null,
      entryLookup: null,
      diagnosis: [],
    };

    // Check if we can find user by current Clerk ID
    const userByClerkId = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject))
      .first();

    // Also check by email if available
    const email = identity.email;
    const userByEmail = email
      ? await ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", email))
          .first()
      : null;

    result.userLookup = {
      foundByClerkId: !!userByClerkId,
      foundByEmail: !!userByEmail,
      userData: userByClerkId || userByEmail || null,
    };

    // Diagnosis
    if (!userByClerkId && userByEmail) {
      result.diagnosis.push(
        `⚠️ User found by email but NOT by Clerk ID. This indicates a migrated user whose clerkUserId hasn't been updated.`
      );
      result.diagnosis.push(
        `Current clerkUserId in DB: ${userByEmail.clerkUserId}`
      );
      result.diagnosis.push(
        `Expected clerkUserId: ${identity.subject}`
      );

      if (userByEmail.clerkUserId?.startsWith("migrated_")) {
        result.diagnosis.push(
          `✅ User has migrated_ prefix - needs to be updated to real Clerk ID`
        );
      }
    } else if (userByClerkId) {
      result.diagnosis.push(`✅ User correctly found by Clerk ID`);
    } else {
      result.diagnosis.push(`❌ User not found in database at all`);
    }

    // Check entry if provided
    if (args.legacyEntryId) {
      const entry = await ctx.db
        .query("accounting_entries")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", args.legacyEntryId))
        .first();

      if (entry) {
        const entryUser = entry.userId ? await ctx.db.get(entry.userId) : null;
        result.entryLookup = {
          found: true,
          entry: {
            _id: entry._id,
            userId: entry.userId,
            legacyId: entry.legacyId,
          },
          associatedUser: entryUser
            ? {
                _id: entryUser._id,
                clerkUserId: entryUser.clerkUserId,
                email: entryUser.email,
              }
            : null,
        };

        // Check if entry's user matches current user
        if (entryUser) {
          if (entryUser._id === userByClerkId?._id) {
            result.diagnosis.push(`✅ Entry's user matches current user by Clerk ID`);
          } else if (entryUser._id === userByEmail?._id) {
            result.diagnosis.push(
              `⚠️ Entry's user matches current user by email, but Clerk ID doesn't match. This is why the entry is not showing up!`
            );
          } else {
            result.diagnosis.push(
              `❌ Entry belongs to a different user entirely`
            );
          }
        }
      } else {
        result.entryLookup = { found: false };
        result.diagnosis.push(`❌ Entry with legacy ID ${args.legacyEntryId} not found`);
      }
    }

    return result;
  },
});

/**
 * One-time: Add a user to businesses with a specified role.
 * Run via: npx convex run --prod functions/admin:addUserToBusinesses '{...}'
 */
export const addUserToBusinesses = mutation({
  args: {
    userId: v.id("users"),
    businessIds: v.array(v.id("businesses")),
    role: v.string(),
  },
  handler: async (ctx, args) => {
    const results = [];
    for (const bizId of args.businessIds) {
      // Check if membership already exists
      const existing = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", args.userId).eq("businessId", bizId)
        )
        .first();

      if (existing) {
        results.push({ businessId: bizId, status: "already_exists", role: existing.role });
        continue;
      }

      await ctx.db.insert("business_memberships", {
        userId: args.userId,
        businessId: bizId,
        role: args.role as "owner" | "finance_admin" | "manager" | "employee",
        status: "active",
        joinedAt: Date.now(),
        updatedAt: Date.now(),
      });
      results.push({ businessId: bizId, status: "created", role: args.role });
    }
    return results;
  },
});
