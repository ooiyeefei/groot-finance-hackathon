# Data Model: Convex Migration

**Branch**: `002-convex-migration` | **Date**: 2025-12-29

## Schema Optimization Decisions

Based on analysis of the domain and Convex's document-oriented patterns:

| Decision | Rationale |
|----------|-----------|
| **Snapshot Pattern for line_items** | Line items exist in source (expense_claims, invoices) during extraction, then COPIED to accounting_entries on posting. Audit-correct: posted entries are immutable snapshots. |
| **Embed line_items in accounting_entries** | Always accessed together, avg 8 items/entry, atomic operations |
| **Keep expense_claims separate from accounting_entries** | IFRS/GAAP compliance - pending claims ≠ posted transactions |
| **Keep conversations/messages separate** | Scalability - messages can grow unbounded, real-time efficiency |
| **Use v.any() for processing_metadata** | DSPy extraction output varies by model version |
| **Add denormalized fields to conversations** | Efficient list queries without fetching all messages |
| **Polymorphic source document reference** | accounting_entries.sourceDocumentId + sourceDocumentType to track origin (expense_claim, invoice, or manual entry) |

## Entity Mapping: Supabase → Convex

### Schema Overview

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ============================================
  // CORE DOMAIN: User & Business Management
  // ============================================

  users: defineTable({
    // Identity
    legacyId: v.optional(v.string()),      // Supabase UUID (migration)
    clerkUserId: v.string(),                // Clerk external ID
    email: v.string(),
    fullName: v.optional(v.string()),

    // Business Context
    businessId: v.optional(v.id("businesses")),  // Active business

    // Preferences
    homeCurrency: v.optional(v.string()),   // Default: "MYR"
    department: v.optional(v.string()),
    preferences: v.optional(v.object({
      theme: v.optional(v.string()),
      language: v.optional(v.string()),
      notifications: v.optional(v.boolean()),
    })),

    // Timestamps (Convex adds _creationTime automatically)
    updatedAt: v.optional(v.number()),      // Unix timestamp
  })
    .index("by_clerkUserId", ["clerkUserId"])
    .index("by_businessId", ["businessId"])
    .index("by_email", ["email"])
    .index("by_legacyId", ["legacyId"]),

  businesses: defineTable({
    // Identity
    legacyId: v.optional(v.string()),       // Supabase UUID (migration)
    name: v.string(),

    // Business Details
    taxId: v.optional(v.string()),
    address: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    homeCurrency: v.string(),               // Default: "MYR"

    // Branding (S3 path: {businessId}/branding/logo.{ext})
    logoStoragePath: v.optional(v.string()),

    // Stripe Integration
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    subscriptionStatus: v.optional(v.string()),
    subscriptionPlan: v.optional(v.string()),

    // Timestamps
    updatedAt: v.optional(v.number()),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_stripeCustomerId", ["stripeCustomerId"]),

  business_memberships: defineTable({
    // Relationships
    legacyId: v.optional(v.string()),
    userId: v.id("users"),
    businessId: v.id("businesses"),

    // Role & Status
    role: v.union(
      v.literal("owner"),
      v.literal("admin"),
      v.literal("manager"),
      v.literal("employee")
    ),
    status: v.union(
      v.literal("active"),
      v.literal("suspended"),
      v.literal("pending")
    ),

    // Timestamps
    joinedAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_businessId", ["businessId"])
    .index("by_userId_businessId", ["userId", "businessId"])
    .index("by_legacyId", ["legacyId"]),

  // ============================================
  // ACCOUNTING DOMAIN: Transactions & Line Items
  // ============================================

  accounting_entries: defineTable({
    // Identity
    legacyId: v.optional(v.string()),
    businessId: v.id("businesses"),
    userId: v.id("users"),

    // Transaction Type
    transactionType: v.union(
      v.literal("Income"),
      v.literal("Cost of Goods Sold"),
      v.literal("Expense")
    ),

    // Financial Data
    description: v.string(),
    originalAmount: v.number(),
    originalCurrency: v.string(),
    homeCurrency: v.string(),
    homeCurrencyAmount: v.optional(v.number()),
    exchangeRate: v.optional(v.number()),
    transactionDate: v.string(),           // ISO date string

    // Categorization
    category: v.string(),
    vendorName: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    documentType: v.optional(v.string()),

    // Status
    status: v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("cancelled"),
      v.literal("overdue")
    ),
    paymentDate: v.optional(v.string()),
    paymentMethod: v.optional(v.string()),

    // ========================================
    // SOURCE DOCUMENT TRACKING (Snapshot Pattern)
    // Rationale: Track where this entry originated from
    // ========================================
    sourceDocumentId: v.optional(v.string()),    // Legacy UUID of source (expense_claim or invoice)
    sourceDocumentType: v.optional(v.union(
      v.literal("expense_claim"),
      v.literal("invoice"),
      v.literal("manual")                         // Manual entry, no source document
    )),

    // ========================================
    // EMBEDDED LINE ITEMS (Snapshot Pattern)
    // Rationale: COPIED from source on posting, immutable after
    // Always accessed together, avg 8 items/entry
    // ========================================
    lineItems: v.optional(v.array(v.object({
      itemDescription: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
      totalAmount: v.number(),
      currency: v.string(),
      taxAmount: v.optional(v.number()),
      taxRate: v.optional(v.number()),
      itemCategory: v.optional(v.string()),
      lineOrder: v.number(),
      legacyId: v.optional(v.string()),    // For migration tracking
    }))),

    // Timestamps
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_userId", ["userId"])
    .index("by_transactionDate", ["transactionDate"])
    .index("by_category", ["category"])
    .index("by_status", ["status"])
    .index("by_sourceDocument", ["sourceDocumentType", "sourceDocumentId"])
    .index("by_legacyId", ["legacyId"]),

  // NOTE: line_items table REMOVED - embedded in accounting_entries
  // This is a key Convex optimization for 1:N relationships where
  // the child records are always accessed with the parent.

  // ============================================
  // EXPENSE CLAIMS DOMAIN
  // ============================================

  expense_claims: defineTable({
    // Identity
    legacyId: v.optional(v.string()),
    businessId: v.id("businesses"),
    userId: v.id("users"),                  // Submitter

    // Expense Details
    description: v.string(),
    vendorName: v.optional(v.string()),
    totalAmount: v.number(),
    currency: v.string(),
    transactionDate: v.string(),

    // Categorization
    expenseCategoryId: v.optional(v.string()),
    businessPurpose: v.optional(v.string()),

    // Receipt (S3 path: {businessId}/{userId}/expense_receipts/{claimId}/{stage}/{filename})
    receiptStoragePath: v.optional(v.string()),

    // Status & Workflow
    status: v.union(
      v.literal("draft"),
      v.literal("submitted"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("reimbursed")
    ),
    submittedAt: v.optional(v.number()),
    approvalDate: v.optional(v.number()),
    approvedByIds: v.optional(v.array(v.id("users"))),
    rejectionReason: v.optional(v.string()),

    // Linked Accounting Entry (created on approval)
    accountingEntryId: v.optional(v.id("accounting_entries")),

    // Processing Metadata (DSPy extraction results)
    processingMetadata: v.optional(v.object({
      extractionMethod: v.optional(v.string()),
      extractionTimestamp: v.optional(v.string()),
      confidenceScore: v.optional(v.number()),
      processingTimeMs: v.optional(v.number()),
      financialData: v.optional(v.any()),
      lineItems: v.optional(v.array(v.any())),
      rawExtraction: v.optional(v.any()),
    })),

    // Timestamps
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_userId", ["userId"])
    .index("by_status", ["status"])
    .index("by_transactionDate", ["transactionDate"])
    .index("by_accountingEntryId", ["accountingEntryId"])
    .index("by_legacyId", ["legacyId"]),

  // ============================================
  // INVOICES/DOCUMENTS DOMAIN
  // ============================================

  invoices: defineTable({
    // Identity
    legacyId: v.optional(v.string()),
    businessId: v.id("businesses"),
    userId: v.id("users"),

    // Document Info
    documentType: v.union(
      v.literal("invoice"),
      v.literal("receipt"),
      v.literal("contract")
    ),
    description: v.optional(v.string()),

    // File Storage (S3 paths: {businessId}/{userId}/{docType}/{docId}/{stage}/{filename})
    storagePath: v.optional(v.string()),           // Original file path
    annotatedStoragePath: v.optional(v.string()),  // Annotated file path

    // Processing Status
    processingStatus: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    triggerTaskId: v.optional(v.string()),

    // Extracted Data (mutable during processing, becomes snapshot source)
    extractedData: v.optional(v.object({
      vendorName: v.optional(v.string()),
      totalAmount: v.optional(v.number()),
      currency: v.optional(v.string()),
      invoiceDate: v.optional(v.string()),
      invoiceNumber: v.optional(v.string()),
      lineItems: v.optional(v.array(v.any())),    // Source line items (extracted)
      boundingBoxes: v.optional(v.array(v.any())),
    })),

    // Linked Accounting Entry (created when invoice is posted to GL)
    accountingEntryId: v.optional(v.id("accounting_entries")),

    // Timestamps
    processedAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_userId", ["userId"])
    .index("by_processingStatus", ["processingStatus"])
    .index("by_accountingEntryId", ["accountingEntryId"])
    .index("by_legacyId", ["legacyId"]),

  // ============================================
  // CHAT DOMAIN (Real-time enabled)
  // ============================================

  conversations: defineTable({
    // Identity
    legacyId: v.optional(v.string()),
    userId: v.id("users"),
    businessId: v.optional(v.id("businesses")),

    // Conversation Details
    title: v.optional(v.string()),

    // Context
    contextDocumentId: v.optional(v.id("invoices")),
    contextTransactionId: v.optional(v.id("accounting_entries")),

    // ========================================
    // DENORMALIZED FIELDS (Convex optimization)
    // Rationale: Efficient conversation list without fetching messages
    // ========================================
    lastMessageContent: v.optional(v.string()),    // Preview text (truncated)
    lastMessageRole: v.optional(v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system")
    )),
    messageCount: v.optional(v.number()),          // Total messages in conversation

    // Timestamps
    lastMessageAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_businessId", ["businessId"])
    .index("by_lastMessageAt", ["lastMessageAt"])
    .index("by_legacyId", ["legacyId"]),

  messages: defineTable({
    // Identity
    legacyId: v.optional(v.string()),
    conversationId: v.id("conversations"),

    // Message Content
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system")
    ),
    content: v.string(),

    // Tool Calls (for assistant messages)
    toolCalls: v.optional(v.array(v.object({
      toolName: v.string(),
      args: v.any(),
      result: v.optional(v.any()),
    }))),

    // Citations
    citations: v.optional(v.array(v.object({
      sourceType: v.string(),
      sourceId: v.string(),
      content: v.optional(v.string()),
    }))),

    // Timestamps
    updatedAt: v.optional(v.number()),
  })
    .index("by_conversationId", ["conversationId"])
    .index("by_legacyId", ["legacyId"]),

  // ============================================
  // SUPPORTING DOMAIN: Vendors & Billing
  // ============================================

  vendors: defineTable({
    // Identity
    legacyId: v.optional(v.string()),
    businessId: v.id("businesses"),

    // Vendor Details
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    taxId: v.optional(v.string()),

    // Classification
    category: v.optional(v.string()),
    isActive: v.optional(v.boolean()),

    // Timestamps
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_name", ["name"])
    .index("by_legacyId", ["legacyId"]),

  stripe_events: defineTable({
    // Identity
    stripeEventId: v.string(),             // Stripe event ID for idempotency

    // Event Details
    eventType: v.string(),
    payload: v.any(),

    // Processing
    processedAt: v.optional(v.number()),
    processingError: v.optional(v.string()),
  })
    .index("by_stripeEventId", ["stripeEventId"])
    .index("by_eventType", ["eventType"]),

  ocr_usage: defineTable({
    // Identity
    legacyId: v.optional(v.string()),
    businessId: v.id("businesses"),

    // Usage Tracking
    month: v.string(),                      // "2025-01" format
    pagesProcessed: v.number(),
    creditsUsed: v.number(),
    creditsRemaining: v.number(),

    // Plan Limits
    planLimit: v.number(),

    // Timestamps
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_month", ["businessId", "month"])
    .index("by_legacyId", ["legacyId"]),
});
```

---

## Type Definitions

```typescript
// convex/types.ts
import { Doc, Id } from "./_generated/dataModel";

// Re-export generated types for convenience
export type User = Doc<"users">;
export type Business = Doc<"businesses">;
export type BusinessMembership = Doc<"business_memberships">;
export type AccountingEntry = Doc<"accounting_entries">;
export type ExpenseClaim = Doc<"expense_claims">;
export type Invoice = Doc<"invoices">;
export type Conversation = Doc<"conversations">;
export type Message = Doc<"messages">;
export type Vendor = Doc<"vendors">;
export type StripeEvent = Doc<"stripe_events">;
export type OcrUsage = Doc<"ocr_usage">;

// Embedded types (not separate tables)
export type LineItem = NonNullable<AccountingEntry["lineItems"]>[number];

// ID types
export type UserId = Id<"users">;
export type BusinessId = Id<"businesses">;
export type AccountingEntryId = Id<"accounting_entries">;
export type ExpenseClaimId = Id<"expense_claims">;
export type InvoiceId = Id<"invoices">;
export type ConversationId = Id<"conversations">;
export type MessageId = Id<"messages">;
// Storage paths are strings (S3 keys), not Convex storage IDs
export type StoragePath = string;  // e.g., "{businessId}/{userId}/{docType}/{docId}/{stage}/{filename}"

// Enums
export type UserRole = "owner" | "admin" | "manager" | "employee";
export type MembershipStatus = "active" | "suspended" | "pending";
export type TransactionType = "Income" | "Cost of Goods Sold" | "Expense";
export type TransactionStatus = "pending" | "paid" | "cancelled" | "overdue";
export type ExpenseStatus = "draft" | "submitted" | "approved" | "rejected" | "reimbursed";
export type DocumentType = "invoice" | "receipt" | "contract";
export type ProcessingStatus = "pending" | "processing" | "completed" | "failed";
export type MessageRole = "user" | "assistant" | "system";
```

---

## Relationship Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        CORE DOMAIN                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────┐     1:N      ┌─────────────────────┐                │
│  │  users  │◄─────────────│ business_memberships│                │
│  └────┬────┘              └──────────┬──────────┘                │
│       │                              │                            │
│       │ N:1                          │ N:1                        │
│       ▼                              ▼                            │
│  ┌──────────┐                  ┌──────────┐                      │
│  │businesses│◄─────────────────│          │                      │
│  └────┬─────┘                  └──────────┘                      │
│       │                                                           │
└───────┼──────────────────────────────────────────────────────────┘
        │
        │ 1:N (business_id)
        ▼
┌──────────────────────────────────────────────────────────────────┐
│                    ACCOUNTING DOMAIN (Snapshot Pattern)          │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────┐   ┌────────────────────┐                 │
│  │  expense_claims    │   │     invoices       │                 │
│  │  ┌──────────────┐  │   │  ┌──────────────┐  │                 │
│  │  │ processing   │  │   │  │ extractedData│  │                 │
│  │  │ Metadata.    │  │   │  │ .lineItems[] │  │  ← SOURCE       │
│  │  │ lineItems[]  │  │   │  └──────────────┘  │    (extracted)  │
│  │  └──────────────┘  │   │                    │                 │
│  └────────┬───────────┘   └─────────┬──────────┘                 │
│           │                         │                             │
│           │ on approval             │ on posting                  │
│           │ (COPY snapshot)         │ (COPY snapshot)             │
│           ▼                         ▼                             │
│  ┌───────────────────────────────────────────┐                   │
│  │          accounting_entries               │                   │
│  │  ┌─────────────────────────────────────┐  │                   │
│  │  │  lineItems: [...]   ← SNAPSHOT      │  │  ← POSTED         │
│  │  │  sourceDocumentType: expense_claim  │  │    (immutable)    │
│  │  │  sourceDocumentId: <uuid>           │  │                   │
│  │  └─────────────────────────────────────┘  │                   │
│  └───────────────────────────────────────────┘                   │
│                                                                   │
│  Bidirectional links:                                            │
│  - expense_claims.accountingEntryId → accounting_entries._id     │
│  - invoices.accountingEntryId → accounting_entries._id           │
│  - accounting_entries.sourceDocumentId → source UUID (string)    │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    DOCUMENT DOMAIN                                │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────┐                        │
│  │ invoices                             │                        │
│  │ + extractedData.lineItems[] (source) │    ┌─────────────┐     │
│  │ + accountingEntryId (after posting)  │────│  AWS S3     │     │
│  └──────────────────────────────────────┘    └─────────────┘     │
│       │                                            │              │
│       │ storagePath ───────────────────────────────┘              │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    CHAT DOMAIN (Real-time)                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌───────────────────────────────────────┐                       │
│  │ conversations                         │                       │
│  │ + lastMessageContent (denormalized)   │  ← OPTIMIZED          │
│  │ + lastMessageRole (denormalized)      │    for list queries   │
│  │ + messageCount (denormalized)         │                       │
│  └─────────────┬─────────────────────────┘                       │
│                │                                                  │
│                │ 1:N (separate for scalability)                   │
│                ▼                                                  │
│  ┌──────────────────────┐                                        │
│  │      messages        │  ← SEPARATE (can grow unbounded)       │
│  └──────────────────────┘                                        │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    SUPPORTING DOMAIN                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────┐   ┌───────────────┐   ┌───────────┐                 │
│  │ vendors │   │ stripe_events │   │ ocr_usage │                 │
│  └─────────┘   └───────────────┘   └───────────┘                 │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Index Strategy

| Table | Index Name | Fields | Purpose |
|-------|------------|--------|---------|
| users | by_clerkUserId | [clerkUserId] | Auth lookup |
| users | by_businessId | [businessId] | Business context |
| users | by_email | [email] | Email lookup |
| users | by_legacyId | [legacyId] | Migration compatibility |
| businesses | by_stripeCustomerId | [stripeCustomerId] | Billing lookup |
| business_memberships | by_userId_businessId | [userId, businessId] | Unique membership |
| accounting_entries | by_transactionDate | [transactionDate] | Date filtering |
| accounting_entries | by_category | [category] | Category reports |
| accounting_entries | by_sourceDocument | [sourceDocumentType, sourceDocumentId] | Find entry by source |
| expense_claims | by_status | [status] | Workflow queries |
| expense_claims | by_accountingEntryId | [accountingEntryId] | Find claim by posted entry |
| invoices | by_accountingEntryId | [accountingEntryId] | Find invoice by posted entry |
| conversations | by_lastMessageAt | [lastMessageAt] | Recent chats |
| messages | by_conversationId | [conversationId] | Chat history |
| stripe_events | by_stripeEventId | [stripeEventId] | Idempotency |

**Note**: `line_items` table removed - items embedded in `accounting_entries.lineItems` array.
Line items are COPIED from source documents on posting (Snapshot Pattern).

---

## Migration Notes

### Schema Optimizations (Convex-specific)

| Change | Supabase | Convex | Rationale |
|--------|----------|--------|-----------|
| **Snapshot Pattern for line_items** | `line_items` table with FK | Embedded in sources + COPIED to `accounting_entries` | Audit-correct: posted entries are immutable snapshots |
| **Embed line_items in accounting_entries** | Separate `line_items` table | `accounting_entries.lineItems[]` | Always accessed together, atomic reads |
| **Source document tracking** | Polymorphic via `source_record_id` | `sourceDocumentId` + `sourceDocumentType` | Track where accounting entry came from |
| **Bidirectional links** | expense_claims.accounting_entry_id | Both directions + by_accountingEntryId indexes | Navigate both ways efficiently |
| **Denormalize conversations** | Requires JOIN for preview | `lastMessageContent`, `messageCount` | Efficient list rendering |
| **Keep expense_claims separate** | Separate table | Separate table | IFRS/GAAP compliance |
| **Keep messages separate** | Separate table | Separate table | Scalability, real-time |

### Snapshot Pattern Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  EXTRACTION STAGE (mutable)                                     │
│                                                                 │
│  expense_claims.processingMetadata.lineItems[]  ← DSPy extracts │
│  invoices.extractedData.lineItems[]             ← OCR extracts  │
│                                                                 │
│  Line items can be edited/corrected during this stage           │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          │ Approval (expense_claims)
                          │ Posting (invoices)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  POSTING STAGE (immutable snapshot)                             │
│                                                                 │
│  accounting_entries.lineItems[] ← COPIED from source            │
│                                                                 │
│  Line items are frozen. If correction needed, create            │
│  a correcting journal entry (reversing entry).                  │
└─────────────────────────────────────────────────────────────────┘
```

**Correction Workflow** (if source was wrong):
1. Source document line items can still be edited (for reference)
2. Posted `accounting_entries` are NEVER modified
3. Create a reversing entry to correct the GL
4. This maintains audit trail integrity

### Field Naming Changes

| Supabase | Convex | Reason |
|----------|--------|--------|
| `clerk_user_id` | `clerkUserId` | camelCase convention |
| `business_id` | `businessId` | camelCase convention |
| `created_at` | `_creationTime` | Convex built-in |
| `updated_at` | `updatedAt` | Explicit field |
| `transaction_id` | `accountingEntryId` | Clarity |
| `receipt_url` | `receiptStoragePath` | S3 path string |

### Type Changes

| Supabase | Convex | Notes |
|----------|--------|-------|
| `uuid` | `v.id("table")` | Convex native IDs |
| `timestamptz` | `v.number()` | Unix timestamp (ms) |
| `jsonb` | `v.any()` or typed object | Prefer typed when possible |
| `text[]` | `v.array(v.string())` | Typed arrays |
| `boolean` | `v.boolean()` | Same |
| `numeric` | `v.number()` | JS number |

### Data Migration: Line Items

During migration, transform `line_items` rows into embedded arrays:

```typescript
// Transform script will:
// 1. Group line_items by accounting_entry_id
// 2. Embed as lineItems array in each accounting_entry
// 3. No separate line_items import needed

const transformedEntry = {
  ...accountingEntry,
  lineItems: lineItemsForEntry.map(item => ({
    itemDescription: item.item_description,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    totalAmount: item.total_amount,
    currency: item.currency,
    taxAmount: item.tax_amount,
    taxRate: item.tax_rate,
    itemCategory: item.item_category,
    lineOrder: item.line_order,
    legacyId: item.id,  // Preserve for reference
  }))
};
```

### Validation Rules

```typescript
// Built into schema via validators
// Example: expense_claims.status must be one of the enum values
status: v.union(
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("reimbursed")
),
```

---

## State Transitions

### Expense Claim Workflow

```
draft ──► submitted ──► approved ──► reimbursed
              │              │
              └──► rejected  │
                             │
              (creates accounting_entry)
```

### Document Processing Workflow

```
pending ──► processing ──► completed
                │
                └──► failed
```
