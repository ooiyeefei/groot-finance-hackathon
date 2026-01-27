// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  membershipRoleValidator,
  membershipStatusValidator,
  transactionTypeValidator,
  accountingEntryStatusValidator,
  createdByMethodValidator,
  sourceDocumentTypeValidator,
  expenseClaimStatusValidator,
  invoiceStatusValidator,
  messageRoleValidator,
  feedbackTypeValidator,
  feedbackStatusValidator,
  vendorStatusValidator,
} from "./lib/validators";

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
      timezone: v.optional(v.string()),   // e.g., "Asia/Singapore", "Asia/Kuala_Lumpur"
    })),
    // Email Preferences (stored directly on user for simpler lookups)
    // Note: Transactional emails (security, payment) always send regardless
    emailPreferences: v.optional(v.object({
      marketingEnabled: v.optional(v.boolean()),        // Default: true
      productUpdatesEnabled: v.optional(v.boolean()),   // Default: true
      onboardingTipsEnabled: v.optional(v.boolean()),   // Default: true
      globalUnsubscribe: v.optional(v.boolean()),       // Default: false (CAN-SPAM)
      unsubscribedAt: v.optional(v.number()),           // Unix timestamp
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
    slug: v.optional(v.string()),           // URL-friendly business identifier

    // Business Details
    taxId: v.optional(v.string()),
    address: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    homeCurrency: v.string(),               // Default: "MYR"
    countryCode: v.optional(v.string()),    // ISO country code
    businessType: v.optional(v.string()),   // e.g., "sole_proprietor", "llc"

    // Multi-currency Support
    allowedCurrencies: v.optional(v.array(v.string())),

    // Custom Categories (JSONB in Supabase)
    customExpenseCategories: v.optional(v.any()),
    customCogsCategories: v.optional(v.any()),

    // Branding
    logoStoragePath: v.optional(v.string()),  // S3 path: {businessId}/branding/logo.{ext}
    logoUrl: v.optional(v.string()),          // Direct URL (legacy)
    logoFallbackColor: v.optional(v.string()),

    // Stripe Integration
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    stripeProductId: v.optional(v.string()),
    subscriptionStatus: v.optional(v.string()),
    planName: v.optional(v.string()),         // Subscription plan name

    // Trial Period
    trialStartDate: v.optional(v.number()),   // Unix timestamp
    trialEndDate: v.optional(v.number()),     // Unix timestamp

    // Onboarding
    onboardingCompletedAt: v.optional(v.number()),  // Unix timestamp

    // Timestamps
    updatedAt: v.optional(v.number()),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_stripeCustomerId", ["stripeCustomerId"])
    .index("by_slug", ["slug"]),

  business_memberships: defineTable({
    // Relationships
    legacyId: v.optional(v.string()),
    userId: v.id("users"),
    businessId: v.id("businesses"),
    managerId: v.optional(v.id("users")),    // Manager for this employee

    // Role & Status (validators from src/lib/constants/statuses.ts)
    role: membershipRoleValidator,
    status: membershipStatusValidator,

    // Timestamps
    invitedAt: v.optional(v.number()),
    joinedAt: v.optional(v.number()),
    lastAccessedAt: v.optional(v.number()),
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
    businessId: v.optional(v.id("businesses")),   // Optional for migration
    userId: v.id("users"),
    vendorId: v.optional(v.id("vendors")),        // Link to vendors table

    // Transaction Type (validator from src/lib/constants/statuses.ts)
    transactionType: transactionTypeValidator,

    // Financial Data
    description: v.optional(v.string()),          // Optional for migration
    originalAmount: v.number(),
    originalCurrency: v.string(),
    homeCurrency: v.optional(v.string()),         // Optional for migration
    homeCurrencyAmount: v.optional(v.number()),
    exchangeRate: v.optional(v.number()),
    exchangeRateDate: v.optional(v.string()),     // Date when rate was fetched
    transactionDate: v.string(),                  // ISO date string

    // Categorization
    category: v.optional(v.string()),             // Optional for migration
    subcategory: v.optional(v.string()),
    vendorName: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    notes: v.optional(v.string()),

    // Status (validator from src/lib/constants/statuses.ts)
    status: accountingEntryStatusValidator,
    dueDate: v.optional(v.string()),
    paymentDate: v.optional(v.string()),
    paymentMethod: v.optional(v.string()),

    // Creation Method (validator from src/lib/constants/statuses.ts)
    createdByMethod: v.optional(createdByMethodValidator),

    // Source Document Tracking
    sourceRecordId: v.optional(v.string()),       // Legacy UUID of source
    sourceDocumentType: v.optional(sourceDocumentTypeValidator),

    // Processing Metadata (JSONB from Supabase)
    processingMetadata: v.optional(v.any()),
    documentMetadata: v.optional(v.any()),
    complianceAnalysis: v.optional(v.any()),    // Cross-border tax compliance results

    // Soft Delete
    deletedAt: v.optional(v.number()),

    // Embedded Line Items (Convex optimization)
    lineItems: v.optional(v.array(v.object({
      itemDescription: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
      totalAmount: v.number(),
      currency: v.string(),
      taxAmount: v.optional(v.number()),
      taxRate: v.optional(v.number()),
      itemCategory: v.optional(v.string()),
      itemCode: v.optional(v.string()),
      unitMeasurement: v.optional(v.string()),
      lineOrder: v.number(),
      legacyId: v.optional(v.string()),
    }))),

    // Timestamps
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_userId", ["userId"])
    .index("by_vendorId", ["vendorId"])
    .index("by_transactionDate", ["transactionDate"])
    .index("by_category", ["category"])
    .index("by_status", ["status"])
    .index("by_sourceDocument", ["sourceDocumentType", "sourceRecordId"])
    .index("by_legacyId", ["legacyId"]),

  // Line Items table (for migration - will be embedded later)
  line_items: defineTable({
    legacyId: v.optional(v.string()),
    accountingEntryId: v.id("accounting_entries"),
    itemDescription: v.string(),
    quantity: v.number(),
    unitPrice: v.number(),
    totalAmount: v.number(),
    currency: v.string(),
    taxAmount: v.optional(v.number()),
    taxRate: v.optional(v.number()),
    discountAmount: v.optional(v.number()),
    lineOrder: v.optional(v.number()),
    itemCode: v.optional(v.string()),
    unitMeasurement: v.optional(v.string()),
    deletedAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_accountingEntryId", ["accountingEntryId"])
    .index("by_legacyId", ["legacyId"]),

  // ============================================
  // EXPENSE CLAIMS DOMAIN
  // ============================================

  expense_claims: defineTable({
    // Identity
    legacyId: v.optional(v.string()),
    businessId: v.id("businesses"),
    userId: v.id("users"),                  // Submitter

    // Expense Details
    businessPurpose: v.string(),            // Required - the main purpose/description
    description: v.optional(v.string()),    // Additional description
    vendorName: v.optional(v.string()),
    totalAmount: v.optional(v.number()),
    currency: v.optional(v.string()),
    homeCurrency: v.optional(v.string()),
    homeCurrencyAmount: v.optional(v.number()),
    exchangeRate: v.optional(v.number()),
    transactionDate: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),

    // Categorization
    expenseCategory: v.optional(v.string()),

    // File Storage
    storagePath: v.optional(v.string()),          // Original file path
    convertedImagePath: v.optional(v.string()),   // Converted image path
    fileName: v.optional(v.string()),
    fileType: v.optional(v.string()),
    fileSize: v.optional(v.number()),

    // Status & Workflow (validator from src/lib/constants/statuses.ts)
    // NOTE: Includes both workflow states (draft, submitted, approved, etc.)
    // AND processing states (classifying, analyzing, etc.) used by Trigger.dev
    status: expenseClaimStatusValidator,

    // Processing
    confidenceScore: v.optional(v.number()),
    processingMetadata: v.optional(v.any()),      // JSONB from Supabase
    errorMessage: v.optional(v.any()),
    lineItemsStatus: v.optional(v.union(
      v.literal("pending"),     // Phase 1 complete, Phase 2 not started
      v.literal("extracting"),  // Phase 2 in progress
      v.literal("complete"),    // Line items extracted
      v.literal("skipped")      // Line items extraction skipped
    )),

    // Approval Workflow
    reviewerNotes: v.optional(v.string()),
    reviewedBy: v.optional(v.id("users")),
    approvedBy: v.optional(v.id("users")),

    // Timestamps
    submittedAt: v.optional(v.number()),
    approvedAt: v.optional(v.number()),
    rejectedAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    processingStartedAt: v.optional(v.number()),
    processedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),

    // Linked Accounting Entry (created on approval)
    accountingEntryId: v.optional(v.id("accounting_entries")),

    // ============================================
    // DUPLICATE DETECTION FIELDS (007-duplicate-expense-detection)
    // ============================================

    // Duplicate detection status
    duplicateStatus: v.optional(v.union(
      v.literal("none"),
      v.literal("potential"),
      v.literal("confirmed"),
      v.literal("dismissed")
    )),
    duplicateGroupId: v.optional(v.string()),           // Groups claims identified as duplicates
    duplicateOverrideReason: v.optional(v.string()),    // User justification when overriding
    duplicateOverrideAt: v.optional(v.number()),        // Timestamp of override
    isSplitExpense: v.optional(v.boolean()),            // User acknowledged split expense

    // Resubmission tracking (for "Correct & Resubmit" flow)
    resubmittedFromId: v.optional(v.id("expense_claims")),  // Reference to rejected claim
    resubmittedToId: v.optional(v.id("expense_claims")),    // Reference to new claim

    // Timestamps
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_userId", ["userId"])
    .index("by_status", ["status"])
    .index("by_transactionDate", ["transactionDate"])
    .index("by_accountingEntryId", ["accountingEntryId"])
    .index("by_legacyId", ["legacyId"])
    // Duplicate detection indexes
    .index("by_business_vendor_date", ["businessId", "vendorName", "transactionDate"])
    .index("by_business_reference", ["businessId", "referenceNumber"]),

  // ============================================
  // DUPLICATE MATCHES TABLE (007-duplicate-expense-detection)
  // ============================================

  duplicate_matches: defineTable({
    // Relationships
    businessId: v.id("businesses"),
    sourceClaimId: v.id("expense_claims"),    // The claim being submitted
    matchedClaimId: v.id("expense_claims"),   // The existing claim matched against

    // Match details
    matchTier: v.union(
      v.literal("exact"),   // Receipt/reference number match
      v.literal("strong"),  // Vendor + Date + Amount match
      v.literal("fuzzy")    // Normalized vendor + Date ±1 day + Amount ±1%
    ),
    matchedFields: v.array(v.string()),       // e.g., ['referenceNumber'] or ['vendorName', 'transactionDate', 'totalAmount']
    confidenceScore: v.number(),              // 0.0-1.0
    isCrossUser: v.boolean(),                 // Different users in same business

    // Resolution status
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed_duplicate"),
      v.literal("dismissed")
    ),
    overrideReason: v.optional(v.string()),   // User justification if dismissed
    resolvedBy: v.optional(v.id("users")),    // Who resolved
    resolvedAt: v.optional(v.number()),       // Resolution timestamp
  })
    .index("by_source_claim", ["sourceClaimId"])
    .index("by_matched_claim", ["matchedClaimId"])
    .index("by_business_status", ["businessId", "status"]),

  // ============================================
  // INVOICES/DOCUMENTS DOMAIN
  // ============================================

  invoices: defineTable({
    // Identity
    legacyId: v.optional(v.string()),
    businessId: v.optional(v.id("businesses")),   // Optional for migration
    userId: v.id("users"),

    // File Info
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
    storagePath: v.string(),
    convertedImagePath: v.optional(v.string()),
    convertedImageWidth: v.optional(v.number()),
    convertedImageHeight: v.optional(v.number()),

    // Processing Status (validator from src/lib/constants/statuses.ts)
    status: invoiceStatusValidator,

    // Processing Details
    processingMethod: v.optional(v.string()),
    processingTier: v.optional(v.number()),
    confidenceScore: v.optional(v.number()),
    documentClassificationConfidence: v.optional(v.number()),
    classificationMethod: v.optional(v.string()),
    classificationTaskId: v.optional(v.string()),
    extractionTaskId: v.optional(v.string()),

    // Extracted Data (JSONB from Supabase)
    extractedData: v.optional(v.any()),
    processingMetadata: v.optional(v.any()),
    documentMetadata: v.optional(v.any()),

    // Error Handling
    errorMessage: v.optional(v.any()),
    requiresReview: v.optional(v.boolean()),

    // Two-Phase Extraction: Line items status
    // Phase 1 extracts core fields (~3-4s), Phase 2 extracts line items (~3-4s)
    lineItemsStatus: v.optional(v.union(
      v.literal("pending"),     // Phase 1 complete, Phase 2 not started
      v.literal("extracting"),  // Phase 2 in progress
      v.literal("complete"),    // Line items extracted
      v.literal("skipped")      // Line items extraction skipped
    )),

    // Timestamps
    processingStartedAt: v.optional(v.number()),
    processedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_userId", ["userId"])
    .index("by_status", ["status"])
    .index("by_legacyId", ["legacyId"]),

  // ============================================
  // CHAT DOMAIN (Real-time enabled)
  // ============================================

  conversations: defineTable({
    // Identity
    legacyId: v.optional(v.string()),
    userId: v.optional(v.id("users")),            // Optional for migration (resolved via Clerk ID)
    businessId: v.optional(v.id("businesses")),

    // Conversation Details
    title: v.optional(v.string()),
    language: v.optional(v.string()),             // "en", "th", "id", "zh"
    isActive: v.optional(v.boolean()),            // Whether conversation is active

    // Context
    contextDocumentId: v.optional(v.id("invoices")),
    contextTransactionId: v.optional(v.id("accounting_entries")),

    // Denormalized Fields (Convex optimization)
    lastMessageContent: v.optional(v.string()),
    lastMessageRole: v.optional(messageRoleValidator),
    messageCount: v.optional(v.number()),

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
    userId: v.optional(v.id("users")),            // Optional for migration

    // Message Content (validator from src/lib/constants/statuses.ts)
    role: messageRoleValidator,
    content: v.string(),

    // Metadata (JSONB from Supabase)
    metadata: v.optional(v.any()),

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

    // Business-Specific Codes
    supplierCode: v.optional(v.string()),  // Business's internal vendor/supplier code

    // Classification & Status
    category: v.optional(v.string()),
    status: v.optional(vendorStatusValidator),  // prospective → active → inactive

    // Timestamps
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_name", ["businessId", "name"])
    .index("by_businessId_status", ["businessId", "status"])
    .index("by_businessId_supplierCode", ["businessId", "supplierCode"])
    .index("by_name", ["name"])
    .index("by_legacyId", ["legacyId"]),

  // Vendor Price History - Tracks ALL price observations from documents
  // Used for price trend analysis, even for documents that don't become transactions
  vendor_price_history: defineTable({
    // Relationships
    businessId: v.id("businesses"),
    vendorId: v.id("vendors"),

    // Item Identification
    itemDescription: v.string(),
    itemCode: v.optional(v.string()),

    // Price Data
    unitPrice: v.number(),
    currency: v.string(),
    quantity: v.number(),

    // DSPy Extraction Fields (tax and categorization)
    taxAmount: v.optional(v.number()),
    taxRate: v.optional(v.number()),
    itemCategory: v.optional(v.string()),
    normalizedDescription: v.optional(v.string()), // Lowercase for fast case-insensitive search

    // Source Document Tracking
    sourceType: v.union(v.literal("invoice"), v.literal("expense_claim")),
    sourceId: v.string(),              // ID of the source document (invoice or expense_claim)
    observedAt: v.string(),            // Date from the document (ISO date string)

    // Confirmation Status
    isConfirmed: v.boolean(),          // true if linked to an accounting entry
    accountingEntryId: v.optional(v.id("accounting_entries")),

    // Timestamps
    updatedAt: v.optional(v.number()),
  })
    .index("by_vendorId", ["vendorId"])
    .index("by_businessId_item", ["businessId", "itemDescription"])
    .index("by_vendor_item", ["vendorId", "itemDescription"])
    .index("by_source", ["sourceType", "sourceId"])
    .index("by_businessId", ["businessId"])
    .index("by_vendor_normalized", ["vendorId", "normalizedDescription"]),

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

  // ============================================
  // AUDIT DOMAIN: Compliance & Activity Tracking
  // ============================================

  audit_events: defineTable({
    // Identity
    legacyId: v.optional(v.string()),       // Supabase UUID (migration)
    businessId: v.id("businesses"),          // Multi-tenant isolation
    actorUserId: v.id("users"),              // Who performed the action

    // Event Classification
    eventType: v.string(),                   // e.g., "permission_change", "data_access", "deletion"
    targetEntityType: v.string(),            // e.g., "user", "expense_claim", "accounting_entry"
    targetEntityId: v.string(),              // ID of the affected entity

    // Event Details (JSONB from Supabase)
    details: v.optional(v.any()),            // Before/after states, metadata

    // Convex adds _creationTime automatically for created_at
  })
    .index("by_businessId", ["businessId"])
    .index("by_actorUserId", ["actorUserId"])
    .index("by_eventType", ["eventType"])
    .index("by_targetEntityType", ["targetEntityType"])
    .index("by_targetEntity", ["targetEntityType", "targetEntityId"])
    .index("by_legacyId", ["legacyId"]),

  // ============================================
  // EMAIL DOMAIN
  // ============================================
  // Note: Email preferences are stored in users.emailPreferences (embedded)
  // Note: Email suppressions rely on SES Account-Level Suppression List (native)
  // Note: Workflow tracking uses Lambda Durable Functions state (native)

  // ============================================
  // FEEDBACK DOMAIN: User Feedback Collection
  // ============================================

  feedback: defineTable({
    // Feedback Type & Content
    type: feedbackTypeValidator,
    message: v.string(),

    // Screenshot (optional) - S3 URL for permanent hosting
    screenshotUrl: v.optional(v.string()),

    // Context (auto-captured)
    pageUrl: v.string(),
    userAgent: v.string(),

    // User Association
    userId: v.optional(v.id("users")),
    businessId: v.optional(v.id("businesses")),
    isAnonymous: v.boolean(),

    // Status Tracking
    status: feedbackStatusValidator,

    // GitHub Integration
    githubIssueUrl: v.optional(v.string()),
    githubIssueNumber: v.optional(v.number()),

    // Timestamps
    updatedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_type", ["type"])
    .index("by_business", ["businessId"])
    .index("by_user", ["userId"]),
});
