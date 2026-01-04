/**
 * ID Resolution Utilities for Convex Migration
 *
 * During migration from Supabase to Convex, we need to support lookups by:
 * 1. Convex IDs (new records) - e.g., "jd72k3n4..."
 * 2. Legacy UUIDs (migrated records) - e.g., "550e8400-e29b-41d4-a716-446655440000"
 *
 * Tables with `legacyId` field and index:
 * - users, businesses, business_memberships
 * - accounting_entries, expense_claims, invoices
 * - conversations, messages, vendors, ocr_usage
 *
 * NOT included (no legacy IDs): stripe_events
 */

import { DatabaseReader } from "../_generated/server";
import { Id, Doc } from "../_generated/dataModel";

/**
 * Tables that have legacyId field and by_legacyId index
 * These are the tables that were migrated from Supabase
 */
export type MigratableTable =
  | "users"
  | "businesses"
  | "business_memberships"
  | "accounting_entries"
  | "expense_claims"
  | "invoices"
  | "conversations"
  | "messages"
  | "vendors"
  | "ocr_usage"
  | "audit_events";

/**
 * Check if a string looks like a UUID (legacy Supabase ID)
 * UUIDs are 36 chars: 8-4-4-4-12 hexadecimal pattern
 */
export function isLegacyUuid(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Check if a string looks like a Convex ID
 * Convex IDs don't match UUID pattern and are typically shorter
 */
export function isConvexId(id: string): boolean {
  return !isLegacyUuid(id) && id.length > 0 && id.length < 36;
}

/**
 * Resolve a document by either Convex ID or legacy UUID
 *
 * @param db - Database reader from ctx.db
 * @param table - Table name to query (must have legacyId field)
 * @param id - Either a Convex ID or legacy UUID
 * @returns The document or null if not found
 *
 * @example
 * const user = await resolveById(ctx.db, "users", someId);
 * if (!user) throw new Error("User not found");
 */
export async function resolveById<T extends MigratableTable>(
  db: DatabaseReader,
  table: T,
  id: string
): Promise<Doc<T> | null> {
  // First, try as a Convex ID (if it doesn't look like a UUID)
  if (!isLegacyUuid(id)) {
    try {
      const doc = await db.get(id as Id<T>);
      if (doc) return doc;
    } catch {
      // Invalid Convex ID format, fall through to legacy lookup
    }
  }

  // Try legacy UUID lookup using the legacyId index
  // Each migratable table has this index
  const doc = await db
    .query(table)
    .withIndex("by_legacyId", (q) => q.eq("legacyId" as never, id as never))
    .first();

  return doc as Doc<T> | null;
}

/**
 * Resolve multiple documents by their IDs (mixed Convex/legacy)
 *
 * @param db - Database reader from ctx.db
 * @param table - Table name to query
 * @param ids - Array of Convex IDs or legacy UUIDs
 * @returns Array of documents (nulls for not found)
 */
export async function resolveByIds<T extends MigratableTable>(
  db: DatabaseReader,
  table: T,
  ids: string[]
): Promise<(Doc<T> | null)[]> {
  return Promise.all(ids.map((id) => resolveById(db, table, id)));
}

/**
 * Get the canonical ID for a document (Convex ID)
 * Useful when you have a legacy UUID and need the Convex ID
 *
 * @param db - Database reader from ctx.db
 * @param table - Table name to query
 * @param id - Either a Convex ID or legacy UUID
 * @returns The Convex ID or null if not found
 */
export async function getCanonicalId<T extends MigratableTable>(
  db: DatabaseReader,
  table: T,
  id: string
): Promise<Id<T> | null> {
  const doc = await resolveById(db, table, id);
  return doc?._id ?? null;
}

/**
 * Resolve user by Clerk ID (subject from auth)
 *
 * @param db - Database reader from ctx.db
 * @param clerkUserId - Clerk user ID (subject from ctx.auth.getUserIdentity())
 * @returns The user document or null if not found
 *
 * @example
 * const identity = await ctx.auth.getUserIdentity();
 * if (!identity) throw new Error("Not authenticated");
 * const user = await resolveUserByClerkId(ctx.db, identity.subject);
 */
export async function resolveUserByClerkId(
  db: DatabaseReader,
  clerkUserId: string
): Promise<Doc<"users"> | null> {
  return await db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
    .first();
}

/**
 * Resolve business by ID with optional user membership check
 *
 * @param db - Database reader from ctx.db
 * @param businessId - Business ID (Convex or legacy)
 * @param userId - Optional user ID to verify membership
 * @returns The business document or null if not found/not a member
 */
export async function resolveBusinessWithAccess(
  db: DatabaseReader,
  businessId: string,
  userId?: string
): Promise<Doc<"businesses"> | null> {
  const business = await resolveById(db, "businesses", businessId);
  if (!business) return null;

  // If userId provided, verify membership
  if (userId) {
    const userDoc = await resolveById(db, "users", userId);
    if (!userDoc) return null;

    const membership = await db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", userDoc._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }
  }

  return business;
}

/**
 * Get authenticated user from Convex context
 * Combines auth check with user lookup
 *
 * @param ctx - Convex query/mutation context with auth and db
 * @returns User document or null if not authenticated/not found
 *
 * @example
 * const user = await getAuthenticatedUser(ctx);
 * if (!user) throw new Error("Not authenticated");
 */
export async function getAuthenticatedUser(
  ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> }; db: DatabaseReader }
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  return resolveUserByClerkId(ctx.db, identity.subject);
}
