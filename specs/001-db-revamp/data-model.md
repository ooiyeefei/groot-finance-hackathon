# Data Model: Database Revamp - Migration to Convex

**Branch**: `001-db-revamp` | **Date**: 2024-12-29 | **Spec**: [spec.md](./spec.md)

## Overview

This document defines the Convex schema that will replace the current Supabase PostgreSQL tables. The schema follows Convex conventions while maintaining functional equivalence with the existing data model.

**Tables**: 13 (1 table dropped: audit_events - see optimizations below)
**Total Rows**: ~73 (from Supabase MCP: 3 users, 1 business, 24 expense_claims, 24 line_items, 3 accounting_entries, 2 invoices, 1 conversation, 2 messages, 13 audit_events)

### Schema Optimizations Applied

Based on pre-migration audit (see `schema-optimization.md`):

**Tables DROPPED** (-1):
- `audit_events` → redundant with existing data:
  - WORKFLOW events (submitted/approved/rejected/reimbursed) already tracked in `expense_claims` via `reviewed_by`, timestamps (`approved_at`, `rejected_at`, `paid_at`, `submitted_at`), and `reviewer_notes`
  - PROCESSING events (upload_ai, extraction_completed) can be captured in `processing_metadata` JSONB field
  - No UI components consume this table

**Columns DROPPED** (-5 total):
- `users.invitedRole` → redundant with `businessMemberships.role`
- `businessMemberships.lastAccessedAt` → never actively updated
- `accountingEntries.paymentMethod` → never populated
- `lineItems.discountAmount` → always 0, never used
- `expenseClaims.internalNotes` → no code usage found

**Columns KEPT** (code-verified as needed):
- `expenseClaims.reviewedBy` → actively used in workflow routing
- All `converted_image_*` columns → kept as separate fields (not consolidated)

**Tables KEPT** (code-verified as needed):
- `ocrUsage` → billing tracking in `src/lib/stripe/usage.ts`
- `stripeEvents` → webhook idempotency in billing webhooks

---

## Convex Schema Definition

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ============================================
  // CORE IDENTITY TABLES
  // ============================================

  /**
   * Users table - User profiles linked to Clerk
   * RLS Replacement: Filter by clerkUserId from ctx.auth.getUserIdentity()
   */
  users: defineTable({
    clerkUserId: v.optional(v.string()), // Clerk user ID (nullable for invited users)
    email: v.string(),
    fullName: v.optional(v.string()),
    preferredCurrency: v.string(), // Default: "SGD"
    languagePreference: v.optional(v.string()), // Default: "en"
    timezone: v.optional(v.string()), // Default: "Asia/Singapore"
    businessId: v.optional(v.id("businesses")), // Active business context
    invitedBy: v.optional(v.string()),
    joinedAt: v.optional(v.number()), // Unix timestamp ms
    // DROPPED: invitedRole (redundant with businessMemberships.role)
    createdAt: v.number(), // Unix timestamp ms
    updatedAt: v.number(), // Unix timestamp ms
  })
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_email", ["email"])
    .index("by_business_id", ["businessId"]),

  /**
   * Businesses table - Multi-tenant business entities
   * RLS Replacement: Filter by businessId from user context
   */
  businesses: defineTable({
    name: v.string(),
    slug: v.string(), // Unique
    countryCode: v.optional(v.string()), // Default: "SG"
    homeCurrency: v.optional(v.string()), // Default: "SGD"
    ownerId: v.id("users"),
    logoUrl: v.optional(v.string()),
    logoFallbackColor: v.optional(v.string()), // Default: "#3b82f6"
    customExpenseCategories: v.optional(v.any()), // JSONB equivalent
    customCogsCategories: v.optional(v.any()), // JSONB equivalent
    allowedCurrencies: v.optional(v.array(v.string())), // Default: 9 currencies
    // Stripe integration
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    stripeProductId: v.optional(v.string()),
    planName: v.optional(v.union(v.literal("free"), v.literal("pro"), v.literal("enterprise"))),
    subscriptionStatus: v.optional(v.union(
      v.literal("active"),
      v.literal("canceled"),
      v.literal("incomplete"),
      v.literal("incomplete_expired"),
      v.literal("past_due"),
      v.literal("paused"),
      v.literal("trialing"),
      v.literal("unpaid")
    )),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_owner_id", ["ownerId"])
    .index("by_stripe_customer_id", ["stripeCustomerId"]),

  /**
   * Business Memberships - Multi-tenant access control
   * RLS Replacement: Filter by userId and businessId
   */
  businessMemberships: defineTable({
    userId: v.id("users"),
    businessId: v.id("businesses"),
    role: v.union(v.literal("admin"), v.literal("manager"), v.literal("employee")),
    managerId: v.optional(v.id("users")),
    status: v.union(v.literal("active"), v.literal("inactive"), v.literal("suspended"), v.literal("pending")),
    invitedAt: v.optional(v.number()),
    joinedAt: v.optional(v.number()),
    // DROPPED: lastAccessedAt (never actively updated)
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_id", ["userId"])
    .index("by_business_id", ["businessId"])
    .index("by_user_and_business", ["userId", "businessId"]),

  // ============================================
  // FINANCIAL TABLES
  // ============================================

  /**
   * Accounting Entries - General ledger transactions
   * RLS Replacement: Filter by businessId
   */
  accountingEntries: defineTable({
    userId: v.id("users"),
    businessId: v.optional(v.id("businesses")),
    sourceRecordId: v.optional(v.string()), // UUID string reference
    sourceDocumentType: v.optional(v.union(v.literal("invoice"), v.literal("expense_claim"))),
    transactionType: v.string(), // "Income", "Cost of Goods Sold", "Expense"
    description: v.optional(v.string()),
    originalAmount: v.float64(),
    originalCurrency: v.string(),
    homeCurrencyAmount: v.optional(v.float64()),
    homeAmount: v.optional(v.float64()),
    homeCurrency: v.optional(v.string()),
    exchangeRate: v.optional(v.float64()),
    exchangeRateDate: v.optional(v.string()), // ISO date string
    transactionDate: v.string(), // ISO date string
    category: v.optional(v.string()),
    subcategory: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    vendorName: v.optional(v.string()),
    vendorId: v.optional(v.id("vendors")),
    notes: v.optional(v.string()),
    createdByMethod: v.optional(v.string()), // Default: "manual"
    processingMetadata: v.optional(v.any()), // JSONB equivalent
    documentMetadata: v.optional(v.any()), // JSONB equivalent
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("overdue"),
      v.literal("cancelled"),
      v.literal("disputed")
    )),
    dueDate: v.optional(v.string()),
    paymentDate: v.optional(v.string()),
    // DROPPED: paymentMethod (never populated)
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_business_id", ["businessId"])
    .index("by_user_id", ["userId"])
    .index("by_transaction_date", ["transactionDate"])
    .index("by_status", ["status"])
    .index("by_source_record", ["sourceRecordId", "sourceDocumentType"]),

  /**
   * Line Items - Transaction line item details
   * RLS Replacement: Inherit from parent accountingEntry
   */
  lineItems: defineTable({
    accountingEntryId: v.id("accountingEntries"),
    itemDescription: v.string(),
    quantity: v.optional(v.float64()), // Default: 1
    unitPrice: v.float64(),
    totalAmount: v.float64(),
    currency: v.string(),
    taxAmount: v.optional(v.float64()),
    taxRate: v.optional(v.float64()),
    // DROPPED: discountAmount (always 0, never used)
    lineOrder: v.optional(v.number()), // Default: 1
    itemCode: v.optional(v.string()),
    unitMeasurement: v.optional(v.string()),
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_accounting_entry_id", ["accountingEntryId"]),

  /**
   * Vendors - Centralized vendor management
   * RLS Replacement: Filter by businessId
   */
  vendors: defineTable({
    businessId: v.id("businesses"),
    name: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_business_id", ["businessId"])
    .index("by_name", ["name"]),

  // ============================================
  // DOCUMENT PROCESSING TABLES
  // ============================================

  /**
   * Invoices - Supplier invoice documents
   * RLS Replacement: Filter by businessId
   */
  invoices: defineTable({
    userId: v.id("users"),
    businessId: v.optional(v.id("businesses")),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
    storagePath: v.string(), // Will be Convex storage ID after migration
    storageId: v.optional(v.id("_storage")), // Convex file storage reference
    convertedImagePath: v.optional(v.string()),
    convertedImageWidth: v.optional(v.number()),
    convertedImageHeight: v.optional(v.number()),
    status: v.union(
      v.literal("pending"),
      v.literal("uploading"),
      v.literal("analyzing"),
      v.literal("paid"),
      v.literal("overdue"),
      v.literal("disputed"),
      v.literal("failed"),
      v.literal("cancelled"),
      v.literal("classifying"),
      v.literal("classification_failed")
    ),
    processingMethod: v.optional(v.string()),
    confidenceScore: v.optional(v.float64()),
    documentClassificationConfidence: v.optional(v.float64()),
    classificationMethod: v.optional(v.string()),
    classificationTaskId: v.optional(v.string()),
    extractionTaskId: v.optional(v.string()),
    extractedData: v.optional(v.any()), // JSONB equivalent
    processingMetadata: v.optional(v.any()),
    documentMetadata: v.optional(v.any()),
    errorMessage: v.optional(v.any()), // JSONB structured error
    processingTier: v.optional(v.number()), // 1, 2, or 3
    requiresReview: v.optional(v.boolean()), // Default: false
    processedAt: v.optional(v.number()),
    processingStartedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_business_id", ["businessId"])
    .index("by_user_id", ["userId"])
    .index("by_status", ["status"])
    .index("by_created_at", ["createdAt"]),

  /**
   * Expense Claims - Employee expense submissions
   * RLS Replacement: Filter by businessId and userId
   */
  expenseClaims: defineTable({
    userId: v.id("users"),
    businessId: v.id("businesses"),
    accountingEntryId: v.optional(v.id("accountingEntries")), // NULL until approved
    businessPurpose: v.string(),
    expenseCategory: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("uploading"),
      v.literal("analyzing"),
      v.literal("submitted"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("reimbursed"),
      v.literal("failed")
    ),
    // Financial data
    vendorName: v.optional(v.string()),
    totalAmount: v.optional(v.float64()),
    currency: v.optional(v.string()),
    homeCurrency: v.optional(v.string()),
    homeCurrencyAmount: v.optional(v.float64()),
    exchangeRate: v.optional(v.float64()), // Default: 1.0
    transactionDate: v.optional(v.string()), // ISO date
    referenceNumber: v.optional(v.string()),
    description: v.optional(v.string()),
    // File storage
    storagePath: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")), // Convex file storage
    convertedImagePath: v.optional(v.string()),
    fileName: v.optional(v.string()),
    fileType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    // Processing
    confidenceScore: v.optional(v.float64()),
    processingMetadata: v.optional(v.any()),
    errorMessage: v.optional(v.any()),
    // Workflow timestamps
    submittedAt: v.optional(v.number()),
    approvedAt: v.optional(v.number()),
    rejectedAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    processedAt: v.optional(v.number()),
    processingStartedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    // Approval workflow
    reviewedBy: v.optional(v.id("users")), // Used for approver routing + audit trail
    approvedBy: v.optional(v.id("users")),
    reviewerNotes: v.optional(v.string()), // Notes from manager for approve/reject/reimburse
    // DROPPED: internalNotes (no code usage found), rejection_reason renamed to reviewer_notes
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_business_id", ["businessId"])
    .index("by_user_id", ["userId"])
    .index("by_status", ["status"])
    .index("by_user_and_business", ["userId", "businessId"])
    .index("by_accounting_entry_id", ["accountingEntryId"]),

  // ============================================
  // CHAT & AI TABLES
  // ============================================

  /**
   * Conversations - Chat conversation threads
   * RLS Replacement: Filter by businessId
   */
  conversations: defineTable({
    userId: v.string(), // Clerk user ID (not table reference)
    businessId: v.optional(v.id("businesses")),
    title: v.optional(v.string()),
    language: v.optional(v.string()), // Default: "en"
    isActive: v.optional(v.boolean()), // Default: true
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_id", ["userId"])
    .index("by_business_id", ["businessId"])
    .index("by_is_active", ["isActive"]),

  /**
   * Messages - Individual chat messages
   * RLS Replacement: Inherit from parent conversation
   */
  messages: defineTable({
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    role: v.string(), // "user", "assistant", "system"
    content: v.string(),
    metadata: v.optional(v.any()), // Citations, tool calls, etc.
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_conversation_id", ["conversationId"])
    .index("by_user_id", ["userId"]),

  // ============================================
  // SYSTEM TABLES
  // ============================================

  // NOTE: audit_events table DROPPED - see Schema Optimizations section
  // Workflow events redundant with expense_claims columns
  // Processing events captured in processing_metadata JSONB

  /**
   * Stripe Events - Webhook idempotency
   * Note: Service-role only table (no user access)
   */
  stripeEvents: defineTable({
    eventId: v.string(), // Primary key equivalent
    eventType: v.string(),
    processedAt: v.number(),
  })
    .index("by_event_id", ["eventId"]),

  /**
   * OCR Usage - Billing tracking
   * RLS Replacement: Filter by businessId
   */
  ocrUsage: defineTable({
    businessId: v.id("businesses"),
    documentId: v.optional(v.string()), // Reference to invoice or expense claim
    creditsUsed: v.number(), // Default: 1
    periodStart: v.string(), // ISO date for billing period
    tokensUsed: v.optional(v.number()),
    promptTokens: v.optional(v.number()),
    completionTokens: v.optional(v.number()),
    modelUsed: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_business_id", ["businessId"])
    .index("by_period_start", ["periodStart"])
    .index("by_business_and_period", ["businessId", "periodStart"]),
});
```

---

## Schema Design Notes

### Type Mappings (Supabase → Convex)

| Supabase Type | Convex Type | Notes |
|---------------|-------------|-------|
| `uuid` (PK) | `v.id("tableName")` | Auto-generated by Convex |
| `uuid` (FK) | `v.id("refTable")` | Type-safe references |
| `uuid` (external) | `v.string()` | For Trigger.dev task IDs, etc. |
| `timestamptz` | `v.number()` | Unix timestamp in milliseconds |
| `date` | `v.string()` | ISO date string (YYYY-MM-DD) |
| `numeric` | `v.float64()` | Convex native float |
| `integer` | `v.number()` | Convex native number |
| `boolean` | `v.boolean()` | Direct mapping |
| `text` / `varchar` | `v.string()` | Direct mapping |
| `text[]` | `v.array(v.string())` | Direct mapping |
| `jsonb` | `v.any()` | Or structured `v.object()` |

### Index Strategy

Each table has indexes for:
1. **Primary access patterns** (e.g., `by_business_id` for multi-tenant filtering)
2. **Foreign key lookups** (e.g., `by_user_id`)
3. **Common query filters** (e.g., `by_status`, `by_created_at`)
4. **Compound indexes** for common joins (e.g., `by_user_and_business`)

### Naming Convention Changes

| Supabase (snake_case) | Convex (camelCase) |
|-----------------------|---------------------|
| `clerk_user_id` | `clerkUserId` |
| `business_id` | `businessId` |
| `created_at` | `createdAt` |
| `accounting_entry_id` | `accountingEntryId` |
| `home_currency_amount` | `homeCurrencyAmount` |

### Multi-Tenant Security Pattern

Replace RLS with TypeScript business_id filters:

```typescript
// Example: Get expense claims for current user's business
export const listExpenseClaims = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    // Get user's active business
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    if (!user?.businessId) throw new Error("No active business");

    // Filter by business_id (replaces RLS policy)
    return await ctx.db
      .query("expenseClaims")
      .withIndex("by_business_id", (q) => q.eq("businessId", user.businessId))
      .collect();
  },
});
```

---

## File Storage Schema

Convex uses `Id<"_storage">` for file references. Migration approach:

```typescript
// Document with file storage reference
invoices: defineTable({
  // ... other fields
  storagePath: v.string(),           // Legacy Supabase path (keep for migration)
  storageId: v.optional(v.id("_storage")),  // Convex storage reference
})
```

**Migration Note**: During migration, both `storagePath` (old Supabase) and `storageId` (new Convex) will exist. Post-migration cleanup will remove `storagePath`.

---

## Relationship Diagram

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   users     │────▶│ businessMemberships │◀───│   businesses    │
└─────────────┘     └──────────────────┘     └─────────────────┘
       │                                              │
       │                                              │
       ▼                                              ▼
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   invoices  │     │  accountingEntries │◀───│    vendors      │
└─────────────┘     └──────────────────┘     └─────────────────┘
       │                    │
       │                    ▼
       │            ┌──────────────────┐
       │            │    lineItems     │
       │            └──────────────────┘
       │
       ▼
┌─────────────────┐
│  expenseClaims  │──────▶ accountingEntries (when approved)
└─────────────────┘

┌─────────────┐     ┌──────────────────┐
│conversations│────▶│     messages     │
└─────────────┘     └──────────────────┘

┌──────────────────┐     ┌─────────────────┐
│   stripeEvents   │     │    ocrUsage     │
└──────────────────┘     └─────────────────┘
(audit_events DROPPED - see optimizations)
```

---

## Search Indexes

For full-text search capabilities (replacing Supabase `ILIKE`):

```typescript
// convex/schema.ts - Search indexes
export default defineSchema({
  vendors: defineTable({
    // ... fields
  })
    .index("by_business_id", ["businessId"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["businessId"],
    }),

  accountingEntries: defineTable({
    // ... fields
  })
    .searchIndex("search_description", {
      searchField: "description",
      filterFields: ["businessId"],
    }),
});
```

Usage:
```typescript
// Full-text search on vendor name
const vendors = await ctx.db
  .query("vendors")
  .withSearchIndex("search_name", (q) =>
    q.search("name", searchTerm)
     .eq("businessId", businessId)
  )
  .collect();
```

---

## Next Steps

1. **Phase 1: Contracts** → Define query/mutation signatures in `contracts/`
2. **Phase 2: Implementation** → Create `convex/schema.ts` from this design
3. **Phase 2: Migration** → Build data transformation script
