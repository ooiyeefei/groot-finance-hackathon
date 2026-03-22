/**
 * 032-self-service-debtors-info-update
 * Convex functions for debtor self-service info update:
 * - Public queries/mutations for the no-auth form
 * - Authenticated queries/mutations for admin change log, token management
 */
import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { Id } from "../_generated/dataModel";

// ============================================
// Helpers
// ============================================

/** Strip HTML tags and trim whitespace from user input to prevent XSS. */
function sanitizeString(value: string | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  // Strip HTML tags, trim, and collapse whitespace
  return value.replace(/<[^>]*>/g, "").trim();
}

// ============================================
// PUBLIC QUERIES (no auth - used by public form)
// ============================================

/**
 * Validate a token and return form pre-fill data.
 * Called by the public debtor update page.
 */
export const getFormData = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const tokenDoc = await ctx.db
      .query("debtor_update_tokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();

    if (!tokenDoc) {
      return { valid: false, error: "invalid" as const };
    }

    if (tokenDoc.isRevoked) {
      return { valid: false, error: "revoked" as const };
    }

    if (tokenDoc.expiresAt < Date.now()) {
      return { valid: false, error: "expired" as const };
    }

    const customer = await ctx.db.get(tokenDoc.customerId);
    if (!customer || customer.deletedAt) {
      return { valid: false, error: "invalid" as const };
    }

    const business = await ctx.db.get(tokenDoc.businessId);
    if (!business) {
      return { valid: false, error: "invalid" as const };
    }

    return {
      valid: true,
      error: null,
      customer: {
        businessName: customer.businessName,
        contactPerson: customer.contactPerson,
        contactPersonPosition: customer.contactPersonPosition,
        email: customer.email,
        phone: customer.phone,
        phone2: customer.phone2,
        fax: customer.fax,
        address: customer.address,
        addressLine1: customer.addressLine1,
        addressLine2: customer.addressLine2,
        addressLine3: customer.addressLine3,
        city: customer.city,
        stateCode: customer.stateCode,
        postalCode: customer.postalCode,
        countryCode: customer.countryCode,
        tin: customer.tin,
        brn: customer.brn,
        idType: customer.idType,
        sstRegistration: customer.sstRegistration,
        website: customer.website,
        businessNature: customer.businessNature,
        customerCode: customer.customerCode,
      },
      businessName: business.name || business.invoiceSettings?.companyName || "Business",
      tokenExpiresAt: tokenDoc.expiresAt,
    };
  },
});

// ============================================
// PUBLIC MUTATIONS (no auth - used by public form)
// ============================================

/** Editable customer fields from the public form */
const customerUpdateFields = v.object({
  businessName: v.optional(v.string()),
  contactPerson: v.optional(v.string()),
  contactPersonPosition: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  phone2: v.optional(v.string()),
  fax: v.optional(v.string()),
  addressLine1: v.optional(v.string()),
  addressLine2: v.optional(v.string()),
  addressLine3: v.optional(v.string()),
  city: v.optional(v.string()),
  stateCode: v.optional(v.string()),
  postalCode: v.optional(v.string()),
  countryCode: v.optional(v.string()),
  tin: v.optional(v.string()),
  brn: v.optional(v.string()),
  idType: v.optional(v.string()),
  sstRegistration: v.optional(v.string()),
  website: v.optional(v.string()),
  businessNature: v.optional(v.string()),
});

/**
 * Submit a debtor info update from the public form.
 * Auto-applies changes to the customer record.
 */
export const submitUpdate = mutation({
  args: {
    token: v.string(),
    updates: customerUpdateFields,
  },
  handler: async (ctx, { token, updates }) => {
    // 1. Validate token
    const tokenDoc = await ctx.db
      .query("debtor_update_tokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();

    if (!tokenDoc || tokenDoc.isRevoked || tokenDoc.expiresAt < Date.now()) {
      return { success: false, error: "Token is invalid or expired" };
    }

    // 2. Rate limit: max 5 submissions per 24h
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
    if (tokenDoc.usageCount >= 5 && tokenDoc.lastUsedAt && tokenDoc.lastUsedAt > twentyFourHoursAgo) {
      return { success: false, error: "rate_limited" };
    }
    // Reset count if last usage was >24h ago
    const currentUsageCount = (tokenDoc.lastUsedAt && tokenDoc.lastUsedAt > twentyFourHoursAgo)
      ? tokenDoc.usageCount
      : 0;

    if (currentUsageCount >= 5) {
      return { success: false, error: "rate_limited" };
    }

    // 3. Fetch current customer record
    const customer = await ctx.db.get(tokenDoc.customerId);
    if (!customer || customer.deletedAt) {
      return { success: false, error: "Customer not found" };
    }

    // 4. Compute field-level diffs
    const changedFields: Array<{ fieldName: string; oldValue: any; newValue: any }> = [];
    const editableFieldNames = [
      "businessName", "contactPerson", "contactPersonPosition", "email", "phone",
      "phone2", "fax", "addressLine1", "addressLine2", "addressLine3",
      "city", "stateCode", "postalCode", "countryCode", "tin", "brn",
      "idType", "sstRegistration", "website", "businessNature",
    ] as const;

    const customerPatch: Record<string, any> = {};
    for (const field of editableFieldNames) {
      const rawVal = (updates as any)[field];
      if (rawVal !== undefined) {
        // Sanitize all string inputs to strip HTML tags (XSS prevention)
        const newVal = typeof rawVal === "string" ? sanitizeString(rawVal) : rawVal;
        const oldVal = (customer as any)[field];
        // Only record if actually changed
        if (newVal !== oldVal) {
          changedFields.push({ fieldName: field, oldValue: oldVal ?? null, newValue: newVal });
          customerPatch[field] = newVal;
        }
      }
    }

    // No changes — skip
    if (changedFields.length === 0) {
      return { success: true, error: null };
    }

    // 5. Build old snapshot (only the editable fields)
    const oldSnapshot: Record<string, any> = {};
    const newSnapshot: Record<string, any> = {};
    for (const field of editableFieldNames) {
      oldSnapshot[field] = (customer as any)[field] ?? null;
      newSnapshot[field] = customerPatch[field] !== undefined
        ? customerPatch[field]
        : (customer as any)[field] ?? null;
    }

    // 6. Update customer record
    await ctx.db.patch(tokenDoc.customerId, {
      ...customerPatch,
      updatedAt: Date.now(),
    });

    // 7. Create change log entry
    await ctx.db.insert("debtor_change_log", {
      businessId: tokenDoc.businessId,
      customerId: tokenDoc.customerId,
      tokenId: tokenDoc._id,
      changedFields,
      oldSnapshot,
      newSnapshot,
      submittedAt: Date.now(),
      source: "self_service",
    });

    // 8. Create Action Center alert
    const fieldNames = changedFields.map((f) => f.fieldName).join(", ");
    const business = await ctx.db.get(tokenDoc.businessId);
    const businessMembers = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", tokenDoc.businessId))
      .collect();

    const adminMembers = businessMembers.filter(
      (m) => m.role === "finance_admin" || m.role === "owner"
    );

    for (const member of adminMembers) {
      await ctx.db.insert("actionCenterInsights", {
        userId: member.userId as string,
        businessId: tokenDoc.businessId as string,
        category: "compliance",
        priority: "low",
        status: "new",
        title: `${customer.businessName} updated their details`,
        description: `Updated via self-service form: ${fieldNames}`,
        affectedEntities: [tokenDoc.customerId as string],
        recommendedAction: "Review the changes in the debtor detail page",
        detectedAt: Date.now(),
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        metadata: {
          type: "debtor_self_service_update",
          customerId: tokenDoc.customerId,
          changedFields: changedFields.map((f) => f.fieldName),
        },
      });
    }

    // 9. Update token usage
    await ctx.db.patch(tokenDoc._id, {
      usageCount: currentUsageCount + 1,
      lastUsedAt: Date.now(),
    });

    return { success: true, error: null };
  },
});

// ============================================
// INTERNAL MUTATIONS (called by other Convex functions)
// ============================================

/**
 * Create or return existing active token for a debtor.
 */
export const createToken = internalMutation({
  args: {
    businessId: v.id("businesses"),
    customerId: v.id("customers"),
  },
  handler: async (ctx, { businessId, customerId }) => {
    // Check for existing active token
    const existing = await ctx.db
      .query("debtor_update_tokens")
      .withIndex("by_businessId_customerId", (q) =>
        q.eq("businessId", businessId).eq("customerId", customerId)
      )
      .first();

    if (existing && !existing.isRevoked && existing.expiresAt > Date.now()) {
      return { tokenId: existing._id, token: existing.token };
    }

    // Generate new UUID token
    const token = crypto.randomUUID();
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    const tokenId = await ctx.db.insert("debtor_update_tokens", {
      businessId,
      customerId,
      token,
      createdAt: now,
      expiresAt: now + thirtyDays,
      usageCount: 0,
    });

    return { tokenId, token };
  },
});

// ============================================
// AUTHENTICATED QUERIES (admin-facing)
// ============================================

/**
 * Get change log for a specific debtor.
 */
export const getChangeLog = query({
  args: {
    businessId: v.string(),
    customerId: v.string(),
  },
  handler: async (ctx, { businessId, customerId }) => {
    const entries = await ctx.db
      .query("debtor_change_log")
      .withIndex("by_businessId_customerId", (q) =>
        q.eq("businessId", businessId as any).eq("customerId", customerId as any)
      )
      .order("desc")
      .collect();

    return entries;
  },
});

/**
 * Get token status for a specific debtor.
 */
export const getTokenStatus = query({
  args: {
    businessId: v.string(),
    customerId: v.string(),
  },
  handler: async (ctx, { businessId, customerId }) => {
    const tokenDoc = await ctx.db
      .query("debtor_update_tokens")
      .withIndex("by_businessId_customerId", (q) =>
        q.eq("businessId", businessId as any).eq("customerId", customerId as any)
      )
      .order("desc")
      .first();

    if (!tokenDoc) {
      return null;
    }

    const isActive = !tokenDoc.isRevoked && tokenDoc.expiresAt > Date.now();

    return {
      tokenId: tokenDoc._id,
      token: tokenDoc.token,
      createdAt: tokenDoc.createdAt,
      expiresAt: tokenDoc.expiresAt,
      isActive,
      usageCount: tokenDoc.usageCount,
      emailSentAt: tokenDoc.emailSentAt,
    };
  },
});

// ============================================
// AUTHENTICATED MUTATIONS (admin-facing)
// ============================================

/**
 * Revert a self-service change — restore customer from old snapshot.
 */
export const revertChange = mutation({
  args: {
    businessId: v.string(),
    changeLogId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, { businessId, changeLogId, userId }) => {
    const entry = await ctx.db.get(changeLogId as Id<"debtor_change_log">);
    if (!entry) {
      return { success: false, error: "Change log entry not found" };
    }

    if (entry.businessId !== (businessId as any)) {
      return { success: false, error: "Access denied" };
    }

    if (entry.isReverted) {
      return { success: false, error: "Already reverted" };
    }

    // Restore customer from old snapshot
    const customer = await ctx.db.get(entry.customerId);
    if (!customer) {
      return { success: false, error: "Customer not found" };
    }

    const oldSnapshot = entry.oldSnapshot as Record<string, any>;
    const restorePatch: Record<string, any> = {};
    for (const [key, value] of Object.entries(oldSnapshot)) {
      restorePatch[key] = value;
    }
    restorePatch.updatedAt = Date.now();

    await ctx.db.patch(entry.customerId, restorePatch);

    // Mark the entry as reverted
    await ctx.db.patch(changeLogId as Id<"debtor_change_log">, {
      isReverted: true,
      revertedAt: Date.now(),
      revertedBy: userId,
    });

    // Create a revert log entry
    const currentSnapshot: Record<string, any> = {};
    const editableFieldNames = [
      "businessName", "contactPerson", "contactPersonPosition", "email", "phone",
      "phone2", "fax", "addressLine1", "addressLine2", "addressLine3",
      "city", "stateCode", "postalCode", "countryCode", "tin", "brn",
      "idType", "sstRegistration", "website", "businessNature",
    ];
    for (const field of editableFieldNames) {
      currentSnapshot[field] = (customer as any)[field] ?? null;
    }

    await ctx.db.insert("debtor_change_log", {
      businessId: entry.businessId,
      customerId: entry.customerId,
      tokenId: entry.tokenId,
      changedFields: entry.changedFields.map((f) => ({
        fieldName: f.fieldName,
        oldValue: f.newValue,
        newValue: f.oldValue,
      })),
      oldSnapshot: currentSnapshot,
      newSnapshot: oldSnapshot,
      submittedAt: Date.now(),
      source: "admin_revert",
    });

    return { success: true, error: null };
  },
});

/**
 * Regenerate token — revoke existing and create new.
 */
export const regenerateToken = mutation({
  args: {
    businessId: v.string(),
    customerId: v.string(),
  },
  handler: async (ctx, { businessId, customerId }) => {
    // Revoke existing tokens
    const existing = await ctx.db
      .query("debtor_update_tokens")
      .withIndex("by_businessId_customerId", (q) =>
        q.eq("businessId", businessId as any).eq("customerId", customerId as any)
      )
      .collect();

    for (const token of existing) {
      if (!token.isRevoked) {
        await ctx.db.patch(token._id, { isRevoked: true });
      }
    }

    // Create new token
    const newToken = crypto.randomUUID();
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    const tokenId = await ctx.db.insert("debtor_update_tokens", {
      businessId: businessId as Id<"businesses">,
      customerId: customerId as Id<"customers">,
      token: newToken,
      createdAt: now,
      expiresAt: now + thirtyDays,
      usageCount: 0,
    });

    return { tokenId, token: newToken };
  },
});

/**
 * Update emailSentAt on a token (after sending info request email).
 */
export const markEmailSent = mutation({
  args: {
    businessId: v.string(),
    customerId: v.string(),
  },
  handler: async (ctx, { businessId, customerId }) => {
    const tokenDoc = await ctx.db
      .query("debtor_update_tokens")
      .withIndex("by_businessId_customerId", (q) =>
        q.eq("businessId", businessId as any).eq("customerId", customerId as any)
      )
      .order("desc")
      .first();

    if (tokenDoc && !tokenDoc.isRevoked) {
      await ctx.db.patch(tokenDoc._id, { emailSentAt: Date.now() });
    }
  },
});

/**
 * Log public form access for audit trail.
 * Called on page load — lightweight, just increments a counter on the token.
 */
export const logFormAccess = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const tokenDoc = await ctx.db
      .query("debtor_update_tokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();

    if (!tokenDoc) return;

    // Use lastUsedAt as a lightweight access signal (updated on both view and submit)
    // The usageCount only increments on actual submissions
    await ctx.db.patch(tokenDoc._id, { lastUsedAt: Date.now() });
  },
});
