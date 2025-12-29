# Convex Mutation Contracts

**Branch**: `001-db-revamp` | **Date**: 2024-12-29

This document defines the Convex mutation function signatures that will replace Supabase RPC functions, triggers, and direct mutations.

---

## Authentication Pattern

All mutations follow this authentication pattern:

```typescript
import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Helper to get authenticated user with business context
async function getAuthenticatedUser(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
    .unique();

  if (!user) throw new Error("User not found");
  return user;
}
```

---

## User Mutations

### `users.createOrUpdate`
**Replaces**: `createMissingUserRecords()` in `supabase-server.ts`

```typescript
export const createOrUpdate = mutation({
  args: {
    email: v.string(),
    fullName: v.optional(v.string()),
    clerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check for existing user
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();

    if (existingUser) {
      // Update existing user
      await ctx.db.patch(existingUser._id, {
        fullName: args.fullName,
        updatedAt: now,
      });
      return existingUser._id;
    }

    // Check for invited user by email
    const invitedUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .unique();

    if (invitedUser && !invitedUser.clerkUserId) {
      // Link Clerk account to invited user
      await ctx.db.patch(invitedUser._id, {
        clerkUserId: args.clerkUserId,
        fullName: args.fullName,
        updatedAt: now,
      });
      return invitedUser._id;
    }

    // Create new user
    return await ctx.db.insert("users", {
      email: args.email.toLowerCase(),
      fullName: args.fullName,
      clerkUserId: args.clerkUserId,
      preferredCurrency: "SGD",
      languagePreference: "en",
      timezone: "Asia/Singapore",
      createdAt: now,
      updatedAt: now,
    });
  },
});
```

### `users.updatePreferences`
```typescript
export const updatePreferences = mutation({
  args: {
    preferredCurrency: v.optional(v.string()),
    languagePreference: v.optional(v.string()),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    await ctx.db.patch(user._id, {
      ...args,
      updatedAt: Date.now(),
    });

    return user._id;
  },
});
```

---

## Business Mutations

### `businesses.create`
```typescript
export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    countryCode: v.optional(v.string()),
    homeCurrency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const now = Date.now();

    // Check slug uniqueness
    const existingBusiness = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (existingBusiness) {
      throw new Error("Business slug already exists");
    }

    // Create business
    const businessId = await ctx.db.insert("businesses", {
      name: args.name,
      slug: args.slug,
      countryCode: args.countryCode ?? "SG",
      homeCurrency: args.homeCurrency ?? "SGD",
      ownerId: user._id,
      allowedCurrencies: ["USD", "SGD", "MYR", "THB", "IDR", "VND", "PHP", "CNY", "EUR"],
      planName: "free",
      subscriptionStatus: "active",
      createdAt: now,
      updatedAt: now,
    });

    // Update user's active business
    await ctx.db.patch(user._id, {
      businessId,
      updatedAt: now,
    });

    // Create admin membership
    await ctx.db.insert("businessMemberships", {
      userId: user._id,
      businessId,
      role: "admin",
      status: "active",
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return businessId;
  },
});
```

---

## Expense Claims Mutations

### `expenseClaims.create`
```typescript
export const create = mutation({
  args: {
    businessPurpose: v.string(),
    expenseCategory: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user.businessId) throw new Error("No active business");

    const now = Date.now();

    return await ctx.db.insert("expenseClaims", {
      userId: user._id,
      businessId: user.businessId,
      businessPurpose: args.businessPurpose,
      expenseCategory: args.expenseCategory,
      status: "draft",
      exchangeRate: 1.0,
      createdAt: now,
      updatedAt: now,
    });
  },
});
```

### `expenseClaims.updateStatus`
**Replaces**: Status transition logic + `create_accounting_entry_from_approved_claim` RPC

```typescript
export const updateStatus = mutation({
  args: {
    claimId: v.id("expenseClaims"),
    status: v.string(),
    reviewerNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const claim = await ctx.db.get(args.claimId);

    if (!claim || claim.businessId !== user.businessId) {
      throw new Error("Expense claim not found");
    }

    const now = Date.now();
    const updateData: Partial<Doc<"expenseClaims">> = {
      status: args.status as any,
      updatedAt: now,
    };

    switch (args.status) {
      case "submitted":
        updateData.submittedAt = now;
        break;

      case "approved":
        updateData.approvedAt = now;
        updateData.approvedBy = user._id;
        // Store approval notes if provided (fixes bug where approval notes were lost)
        if (args.reviewerNotes) {
          updateData.reviewerNotes = args.reviewerNotes;
        }

        // Create accounting entry (replaces RPC trigger)
        if (claim.totalAmount && claim.currency) {
          const entryId = await ctx.db.insert("accountingEntries", {
            userId: claim.userId,
            businessId: claim.businessId,
            sourceRecordId: args.claimId,
            sourceDocumentType: "expense_claim",
            transactionType: "Expense",
            description: claim.description ?? claim.businessPurpose,
            originalAmount: claim.totalAmount,
            originalCurrency: claim.currency,
            homeCurrencyAmount: claim.homeCurrencyAmount,
            homeCurrency: claim.homeCurrency,
            exchangeRate: claim.exchangeRate,
            transactionDate: claim.transactionDate ?? new Date().toISOString().split("T")[0],
            category: claim.expenseCategory,
            vendorName: claim.vendorName,
            referenceNumber: claim.referenceNumber,
            createdByMethod: "expense_claim",
            processingMetadata: claim.processingMetadata,
            status: "pending",
            createdAt: now,
            updatedAt: now,
          });

          updateData.accountingEntryId = entryId;

          // Create audit event
          await ctx.db.insert("auditEvents", {
            businessId: claim.businessId,
            actorUserId: user._id,
            eventType: "expense_claim.approved",
            targetEntityType: "expense_claim",
            targetEntityId: args.claimId,
            details: { accountingEntryId: entryId },
            createdAt: now,
          });
        }
        break;

      case "rejected":
        updateData.rejectedAt = now;
        updateData.reviewerNotes = args.reviewerNotes || "No reason provided";
        break;

      case "reimbursed":
        updateData.paidAt = now;

        // Update accounting entry status (replaces trigger)
        if (claim.accountingEntryId) {
          await ctx.db.patch(claim.accountingEntryId, {
            status: "paid",
            paymentDate: new Date().toISOString().split("T")[0],
            updatedAt: now,
          });
        }
        break;
    }

    await ctx.db.patch(args.claimId, updateData);
    return args.claimId;
  },
});
```

### `expenseClaims.updateFromProcessing`
**Called by Trigger.dev task after DSPy extraction**

```typescript
export const updateFromProcessing = mutation({
  args: {
    claimId: v.id("expenseClaims"),
    vendorName: v.optional(v.string()),
    totalAmount: v.optional(v.float64()),
    currency: v.optional(v.string()),
    transactionDate: v.optional(v.string()),
    description: v.optional(v.string()),
    confidenceScore: v.optional(v.float64()),
    processingMetadata: v.optional(v.any()),
    homeCurrency: v.optional(v.string()),
    homeCurrencyAmount: v.optional(v.float64()),
    exchangeRate: v.optional(v.float64()),
    status: v.optional(v.string()),
    errorMessage: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { claimId, ...updateFields } = args;
    const now = Date.now();

    await ctx.db.patch(claimId, {
      ...updateFields,
      processedAt: now,
      updatedAt: now,
    });

    return claimId;
  },
});
```

---

## Invoice Mutations

### `invoices.create`
```typescript
export const create = mutation({
  args: {
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
    storagePath: v.string(),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user.businessId) throw new Error("No active business");

    const now = Date.now();

    return await ctx.db.insert("invoices", {
      userId: user._id,
      businessId: user.businessId,
      fileName: args.fileName,
      fileType: args.fileType,
      fileSize: args.fileSize,
      storagePath: args.storagePath,
      storageId: args.storageId,
      status: "pending",
      processingTier: 1,
      requiresReview: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});
```

### `invoices.updateStatus`
**Includes trigger replacement: `sync_invoice_status_to_accounting`**

```typescript
export const updateStatus = mutation({
  args: {
    invoiceId: v.id("invoices"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const invoice = await ctx.db.get(args.invoiceId);

    if (!invoice || invoice.businessId !== user.businessId) {
      throw new Error("Invoice not found");
    }

    const now = Date.now();
    const updateData: Partial<Doc<"invoices">> = {
      status: args.status as any,
      updatedAt: now,
    };

    // Status-specific updates
    if (args.status === "paid" || args.status === "cancelled") {
      // Sync to linked accounting entry (replaces trigger)
      const linkedEntry = await ctx.db
        .query("accountingEntries")
        .withIndex("by_source_record", (q) =>
          q.eq("sourceRecordId", args.invoiceId).eq("sourceDocumentType", "invoice")
        )
        .unique();

      if (linkedEntry) {
        await ctx.db.patch(linkedEntry._id, {
          status: args.status === "paid" ? "paid" : "cancelled",
          paymentDate: args.status === "paid" ? new Date().toISOString().split("T")[0] : undefined,
          updatedAt: now,
        });
      }
    }

    await ctx.db.patch(args.invoiceId, updateData);
    return args.invoiceId;
  },
});
```

---

## Accounting Entry Mutations

### `accountingEntries.create`
```typescript
export const create = mutation({
  args: {
    transactionType: v.string(),
    description: v.optional(v.string()),
    originalAmount: v.float64(),
    originalCurrency: v.string(),
    transactionDate: v.string(),
    category: v.optional(v.string()),
    vendorName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user.businessId) throw new Error("No active business");

    const now = Date.now();

    return await ctx.db.insert("accountingEntries", {
      userId: user._id,
      businessId: user.businessId,
      ...args,
      createdByMethod: "manual",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});
```

### `accountingEntries.updateStatus`
**Includes trigger replacement: `sync_accounting_entry_status`**

```typescript
export const updateStatus = mutation({
  args: {
    entryId: v.id("accountingEntries"),
    status: v.string(),
    paymentDate: v.optional(v.string()),
    paymentMethod: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const entry = await ctx.db.get(args.entryId);

    if (!entry || entry.businessId !== user.businessId) {
      throw new Error("Accounting entry not found");
    }

    const now = Date.now();

    // Sync to source document (replaces trigger)
    if (entry.sourceRecordId && entry.sourceDocumentType) {
      if (entry.sourceDocumentType === "expense_claim") {
        const claim = await ctx.db
          .query("expenseClaims")
          .filter((q) => q.eq(q.field("_id"), entry.sourceRecordId as any))
          .unique();

        if (claim && args.status === "paid") {
          await ctx.db.patch(claim._id, {
            status: "reimbursed",
            paidAt: now,
            updatedAt: now,
          });
        }
      }
    }

    await ctx.db.patch(args.entryId, {
      status: args.status as any,
      paymentDate: args.paymentDate,
      paymentMethod: args.paymentMethod,
      updatedAt: now,
    });

    return args.entryId;
  },
});
```

---

## Line Items Mutations

### `lineItems.createBatch`
```typescript
export const createBatch = mutation({
  args: {
    accountingEntryId: v.id("accountingEntries"),
    items: v.array(
      v.object({
        itemDescription: v.string(),
        quantity: v.optional(v.float64()),
        unitPrice: v.float64(),
        totalAmount: v.float64(),
        currency: v.string(),
        taxAmount: v.optional(v.float64()),
        taxRate: v.optional(v.float64()),
        lineOrder: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const ids = await Promise.all(
      args.items.map((item, index) =>
        ctx.db.insert("lineItems", {
          accountingEntryId: args.accountingEntryId,
          ...item,
          quantity: item.quantity ?? 1,
          lineOrder: item.lineOrder ?? index + 1,
          discountAmount: 0,
          createdAt: now,
          updatedAt: now,
        })
      )
    );

    return ids;
  },
});
```

---

## Conversation Mutations

### `conversations.create`
```typescript
export const create = mutation({
  args: {
    title: v.optional(v.string()),
    language: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    const now = Date.now();

    return await ctx.db.insert("conversations", {
      userId: identity.subject,
      businessId: user?.businessId,
      title: args.title,
      language: args.language ?? "en",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});
```

### `messages.create`
```typescript
export const create = mutation({
  args: {
    conversationId: v.id("conversations"),
    role: v.string(),
    content: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const now = Date.now();

    // Update conversation timestamp
    await ctx.db.patch(args.conversationId, { updatedAt: now });

    return await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      userId: user._id,
      role: args.role,
      content: args.content,
      metadata: args.metadata,
      createdAt: now,
    });
  },
});
```

---

## Audit Event Mutations

### `auditEvents.create`
```typescript
export const create = mutation({
  args: {
    eventType: v.string(),
    targetEntityType: v.string(),
    targetEntityId: v.string(),
    details: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user.businessId) throw new Error("No active business");

    return await ctx.db.insert("auditEvents", {
      businessId: user.businessId,
      actorUserId: user._id,
      ...args,
      createdAt: Date.now(),
    });
  },
});
```

---

## Stripe Event Mutations (Internal)

### `stripeEvents.recordProcessed`
**Service-only mutation for webhook idempotency**

```typescript
export const recordProcessed = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if already processed
    const existing = await ctx.db
      .query("stripeEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .unique();

    if (existing) {
      return { alreadyProcessed: true };
    }

    await ctx.db.insert("stripeEvents", {
      eventId: args.eventId,
      eventType: args.eventType,
      processedAt: Date.now(),
    });

    return { alreadyProcessed: false };
  },
});
```

---

## File Storage Mutations

### `storage.generateUploadUrl`
```typescript
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await getAuthenticatedUser(ctx); // Verify auth
    return await ctx.storage.generateUploadUrl();
  },
});
```

---

## Summary of Trigger Replacements

| Supabase Trigger | Convex Mutation Hook |
|------------------|---------------------|
| `sync_accounting_entry_status_trigger` | `accountingEntries.updateStatus` |
| `sync_expense_transaction_status_trigger` | Embedded in `expenseClaims.updateStatus` |
| `sync_invoice_status_trigger` | `invoices.updateStatus` |
| `trigger_vendors_updated_at` | Automatic via `updatedAt` field in mutations |

## Summary of RPC Replacements

| Supabase RPC | Convex Mutation |
|--------------|-----------------|
| `create_accounting_entry_from_approved_claim` | Embedded in `expenseClaims.updateStatus` |
