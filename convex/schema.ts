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
  expenseSubmissionStatusValidator,
  invoiceStatusValidator,
  messageRoleValidator,
  feedbackTypeValidator,
  feedbackStatusValidator,
  vendorStatusValidator,
  leaveRequestStatusValidator,
  exportModuleValidator,
  exportTemplateTypeValidator,
  exportFrequencyValidator,
  exportHistoryStatusValidator,
  exportTriggerValidator,
  dateRangeTypeValidator,
  thousandSeparatorValidator,
  salesInvoiceStatusValidator,
  paymentTermsValidator,
  customerStatusValidator,
  catalogItemStatusValidator,
  recurringFrequencyValidator,
  paymentTypeValidator,
  paymentMethodValidator,
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
    contactPhone: v.optional(v.string()),
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
    subscriptionPeriodEnd: v.optional(v.number()), // Unix timestamp for subscription period end
    planName: v.optional(v.string()),         // Subscription plan name

    // Trial Period
    trialStartDate: v.optional(v.number()),   // Unix timestamp (ms)
    trialEndDate: v.optional(v.number()),     // Unix timestamp (ms)

    // Onboarding
    onboardingCompletedAt: v.optional(v.number()),  // Unix timestamp

    // Invoice Settings (009-sales-invoice-generation)
    invoiceSettings: v.optional(v.object({
      logoStorageId: v.optional(v.string()),
      companyName: v.optional(v.string()),
      companyAddress: v.optional(v.string()),
      companyPhone: v.optional(v.string()),
      companyEmail: v.optional(v.string()),
      registrationNumber: v.optional(v.string()),
      taxId: v.optional(v.string()),
      defaultCurrency: v.optional(v.string()),
      invoiceNumberPrefix: v.optional(v.string()),
      nextInvoiceNumber: v.optional(v.number()),
      defaultPaymentTerms: v.optional(v.string()),
      defaultPaymentInstructions: v.optional(v.string()),
      selectedTemplate: v.optional(v.string()),
      customNoteTemplates: v.optional(v.array(v.object({ id: v.string(), label: v.string(), text: v.string() }))),
      customPaymentTemplates: v.optional(v.array(v.object({ id: v.string(), label: v.string(), text: v.string() }))),
      // 012-stripe-invoice-ux: Accepted payment methods for invoice display
      acceptedPaymentMethods: v.optional(v.array(v.string())),
    })),

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

    // Leave Management - Custom entitlements per employee
    // Maps leaveTypeId -> entitled days (overrides leave_type.defaultDays)
    // Example: { "k57abc123": 18, "k57def456": 5 }
    leaveEntitlements: v.optional(v.any()),

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

    // Designated Approver & Routing (strict routing feature)
    designatedApproverId: v.optional(v.id("users")),  // Who should approve this claim
    routingHistory: v.optional(v.array(v.object({
      fromUserId: v.id("users"),
      toUserId: v.id("users"),
      routedAt: v.number(),
      reason: v.optional(v.string()),
    }))),

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

    // Batch Submission (009-batch-receipt-submission)
    submissionId: v.optional(v.id("expense_submissions")),  // Parent submission

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
    .index("by_business_reference", ["businessId", "referenceNumber"])
    // Approval routing index
    .index("by_designatedApproverId", ["designatedApproverId"])
    // Batch submission index
    .index("by_submissionId", ["submissionId"]),

  // ============================================
  // EXPENSE SUBMISSIONS DOMAIN (009-batch-receipt-submission)
  // ============================================

  expense_submissions: defineTable({
    // Identity
    businessId: v.id("businesses"),
    userId: v.id("users"),                          // Submitter/owner

    // Submission Details
    title: v.string(),                               // Display name (auto-generated or custom)
    description: v.optional(v.string()),             // Optional notes

    // Status & Workflow
    status: expenseSubmissionStatusValidator,         // draft → submitted → approved/rejected → reimbursed

    // Rejection Details
    rejectionReason: v.optional(v.string()),          // Manager's reason for rejection
    claimNotes: v.optional(v.array(v.object({        // Per-claim notes from manager
      claimId: v.id("expense_claims"),
      note: v.string(),
    }))),

    // Approval Routing
    designatedApproverId: v.optional(v.id("users")), // Target approver (set on submission)
    approvedBy: v.optional(v.id("users")),           // Who approved

    // Timestamps
    submittedAt: v.optional(v.number()),
    approvedAt: v.optional(v.number()),
    rejectedAt: v.optional(v.number()),
    reimbursedAt: v.optional(v.number()),            // Auto-set when all claims reimbursed
    deletedAt: v.optional(v.number()),               // Soft delete
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_userId", ["userId"])
    .index("by_status", ["status"])
    .index("by_designatedApproverId", ["designatedApproverId"])
    .index("by_businessId_status", ["businessId", "status"])
    .index("by_businessId_userId", ["businessId", "userId"]),

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

  // ============================================
  // AI AGENT DOMAIN: Action Center & Memory
  // ============================================

  // Proactive intelligence insights from background analysis engine
  // Stores anomalies, compliance gaps, deadlines, cashflow warnings, etc.
  actionCenterInsights: defineTable({
    // Target user and business for the insight
    userId: v.string(),
    businessId: v.string(),

    // Insight classification
    category: v.union(
      v.literal("anomaly"),        // Statistical outlier detection
      v.literal("compliance"),     // Regulatory gap detection
      v.literal("deadline"),       // Upcoming filing/payment
      v.literal("cashflow"),       // Cash flow warning/forecast
      v.literal("optimization"),   // Cost savings opportunity
      v.literal("categorization")  // Data quality issue
    ),
    priority: v.union(
      v.literal("critical"),  // Compliance violation, negative cash flow <7 days
      v.literal("high"),      // Large anomaly >3σ, deadline <14 days
      v.literal("medium"),    // Moderate anomaly >2σ, deadline <30 days
      v.literal("low")        // Categorization suggestions, minor optimizations
    ),
    status: v.union(
      v.literal("new"),       // Just detected, not yet viewed
      v.literal("reviewed"),  // User viewed the insight
      v.literal("dismissed"), // User dismissed without action
      v.literal("actioned")   // User took recommended action
    ),

    // Insight content
    title: v.string(),              // Short description (max 100 chars)
    description: v.string(),        // Detailed explanation
    affectedEntities: v.array(v.string()), // IDs of related transactions/documents
    recommendedAction: v.string(),  // Suggested next step

    // Timestamps
    detectedAt: v.number(),         // When insight was generated
    reviewedAt: v.optional(v.number()),   // When user viewed
    actionedAt: v.optional(v.number()),   // When user took action
    dismissedAt: v.optional(v.number()),  // When user dismissed
    expiresAt: v.optional(v.number()),    // Auto-expire for time-sensitive insights

    // Category-specific metadata (JSONB equivalent)
    metadata: v.optional(v.any())
  })
    .index("by_user_status", ["userId", "status"])
    .index("by_business_priority", ["businessId", "priority"])
    .index("by_category", ["category"])
    .index("by_detected", ["detectedAt"]),

  // ============================================
  // MCP SERVER DOMAIN: API Keys, Proposals, Rate Limits
  // ============================================

  // API Keys for MCP Server authentication (Category 3 MCP)
  mcp_api_keys: defineTable({
    // Hashed key - never store plaintext
    key: v.string(),
    // First 8 chars for identification (e.g., "fsk_abc1")
    keyPrefix: v.string(),
    // Business this key has access to
    businessId: v.id("businesses"),
    // Human-readable name (e.g., "Zapier Integration")
    name: v.string(),
    // Allowed tools: ["detect_anomalies", "forecast_cash_flow", ...]
    permissions: v.array(v.string()),
    // Requests per minute (default: 60)
    rateLimitPerMinute: v.number(),
    // Optional expiration timestamp
    expiresAt: v.optional(v.number()),
    // Last successful request timestamp
    lastUsedAt: v.optional(v.number()),
    // User who created this key
    createdBy: v.id("users"),
    // Creation timestamp
    createdAt: v.number(),
    // Soft-delete: revocation timestamp
    revokedAt: v.optional(v.number()),
  })
    .index("by_keyPrefix", ["keyPrefix"])
    .index("by_businessId", ["businessId"])
    .index("by_businessId_active", ["businessId", "revokedAt"]),

  // Proposals for human-approved write operations (Clockwise pattern)
  mcp_proposals: defineTable({
    // Business context for this proposal
    businessId: v.string(),
    // Action type: approve_expense, reject_expense, categorize_expense, update_vendor
    actionType: v.string(),
    // Target entity ID (e.g., expense claim ID)
    targetId: v.string(),
    // Action-specific parameters
    parameters: v.optional(v.any()),
    // Human-readable summary
    summary: v.string(),
    // Status: pending, confirmed, cancelled, expired, executed, failed
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("cancelled"),
      v.literal("expired"),
      v.literal("executed"),
      v.literal("failed")
    ),
    // Auto-expire timestamp (created + 15 minutes)
    expiresAt: v.number(),
    // API key that created this proposal
    createdByApiKeyId: v.optional(v.id("mcp_api_keys")),
    // When proposal was confirmed
    confirmedAt: v.optional(v.number()),
    // User who confirmed the proposal
    confirmedByUserId: v.optional(v.id("users")),
    // When proposal was cancelled
    cancelledAt: v.optional(v.number()),
    // User who cancelled the proposal
    cancelledByUserId: v.optional(v.id("users")),
    // Reason for cancellation
    cancellationReason: v.optional(v.string()),
    // When proposal was executed
    executedAt: v.optional(v.number()),
    // Result after execution (success/errors)
    executionResult: v.optional(v.any()),
    // Creation timestamp
    createdAt: v.number(),
  })
    .index("by_businessId", ["businessId"])
    .index("by_status", ["status"])
    .index("by_expiresAt", ["expiresAt"]),

  // Rate limiting for MCP API keys
  mcp_rate_limits: defineTable({
    // Reference to the API key
    apiKeyId: v.id("mcp_api_keys"),
    // Timestamp of window start
    windowStart: v.number(),
    // Requests in current window
    requestCount: v.number(),
  })
    .index("by_apiKeyId", ["apiKeyId"]),

  // ============================================
  // LEAVE MANAGEMENT DOMAIN
  // ============================================

  // Leave requests - formal requests by employees to take time off
  leave_requests: defineTable({
    // Multi-tenant scope
    businessId: v.id("businesses"),
    // Employee requesting leave
    userId: v.id("users"),
    // Type of leave (references leave_types)
    leaveTypeId: v.id("leave_types"),

    // Date range (ISO date strings YYYY-MM-DD)
    startDate: v.string(),
    endDate: v.string(),
    // Business days calculated (excludes weekends and holidays)
    totalDays: v.number(),

    // Workflow status
    status: leaveRequestStatusValidator,

    // Employee notes/reason
    notes: v.optional(v.string()),

    // Approval workflow
    approverId: v.optional(v.id("users")),       // Manager who should approve (auto-set from managerId)
    approverNotes: v.optional(v.string()),       // Approval/rejection notes
    approvedAt: v.optional(v.number()),          // Timestamp of approval decision

    // Cancellation
    cancelledAt: v.optional(v.number()),
    cancelReason: v.optional(v.string()),

    // Timestamps
    submittedAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_userId", ["userId"])
    .index("by_status", ["status"])
    .index("by_businessId_status", ["businessId", "status"])
    .index("by_businessId_userId", ["businessId", "userId"])
    .index("by_approverId_status", ["approverId", "status"]),

  // Leave balances - tracks entitlement and usage per employee per leave type per year
  leave_balances: defineTable({
    // Multi-tenant scope
    businessId: v.id("businesses"),
    // Employee
    userId: v.id("users"),
    // Leave type
    leaveTypeId: v.id("leave_types"),
    // Calendar year
    year: v.number(),

    // Entitlement
    entitled: v.number(),        // Total days entitled for the year
    used: v.number(),            // Days used (approved requests)
    adjustments: v.number(),     // Manual adjustments (+/-)
    carryover: v.optional(v.number()),  // Days carried from previous year

    // Timestamps
    lastUpdated: v.number(),
  })
    .index("by_businessId", ["businessId"])
    .index("by_userId", ["userId"])
    .index("by_userId_year", ["userId", "year"])
    .index("by_businessId_userId_leaveTypeId_year", ["businessId", "userId", "leaveTypeId", "year"]),

  // Leave types - configurable leave categories per organization
  leave_types: defineTable({
    // Multi-tenant scope
    businessId: v.id("businesses"),

    // Display
    name: v.string(),                    // e.g., "Annual Leave"
    code: v.string(),                    // e.g., "ANNUAL" - unique per business
    description: v.optional(v.string()), // Help text for employees
    color: v.optional(v.string()),       // Calendar display color (hex)

    // Configuration
    defaultDays: v.number(),             // Default entitlement
    requiresApproval: v.boolean(),       // Auto-approve if false
    deductsBalance: v.boolean(),         // Affects balance if true

    // Regional
    countryCode: v.optional(v.string()), // Country-specific (ISO 3166-1)

    // Accrual rules (for US9)
    carryoverCap: v.optional(v.number()),           // Max days to carry over
    carryoverPolicy: v.optional(v.union(
      v.literal("none"),       // No carryover
      v.literal("cap"),        // Up to carryoverCap
      v.literal("unlimited")   // Full carryover
    )),
    prorationEnabled: v.optional(v.boolean()),      // Prorate for partial year

    // Status
    isActive: v.boolean(),
    sortOrder: v.number(),

    // Timestamps
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_code", ["businessId", "code"])
    .index("by_businessId_isActive", ["businessId", "isActive"]),

  // Public holidays - non-working days by country
  public_holidays: defineTable({
    // Null businessId = system default (country-wide)
    businessId: v.optional(v.id("businesses")),
    // ISO 3166-1 alpha-2 country code
    countryCode: v.string(),
    // ISO date string YYYY-MM-DD
    date: v.string(),
    // Holiday name
    name: v.string(),
    // Calendar year (for efficient queries)
    year: v.number(),
    // Company-specific if true (businessId must be set)
    isCustom: v.boolean(),

    // Timestamps
    updatedAt: v.optional(v.number()),
  })
    .index("by_countryCode_year", ["countryCode", "year"])
    .index("by_businessId", ["businessId"])
    .index("by_date", ["date"]),

  // ============================================
  // EXPORT TEMPLATES DOMAIN (CSV Template Builder)
  // ============================================

  // Custom export templates - user-created configurations for CSV exports
  export_templates: defineTable({
    // Multi-tenant scope
    businessId: v.id("businesses"),

    // Template identity
    name: v.string(),
    description: v.optional(v.string()),

    // Module - which data to export
    module: exportModuleValidator,

    // Template type
    type: exportTemplateTypeValidator,

    // For cloned templates - reference to pre-built
    clonedFromId: v.optional(v.string()),
    clonedFromVersion: v.optional(v.string()),

    // Field mappings (embedded for Convex optimization)
    fieldMappings: v.array(v.object({
      sourceField: v.string(),
      targetColumn: v.string(),
      order: v.number(),
      dateFormat: v.optional(v.string()),
      decimalPlaces: v.optional(v.number()),
      thousandSeparator: v.optional(thousandSeparatorValidator),
    })),

    // Global format settings (defaults)
    defaultDateFormat: v.optional(v.string()),
    defaultDecimalPlaces: v.optional(v.number()),
    defaultThousandSeparator: v.optional(thousandSeparatorValidator),

    // Ownership & audit
    createdBy: v.id("users"),
    updatedBy: v.optional(v.id("users")),

    // Timestamps
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_module", ["businessId", "module"])
    .index("by_createdBy", ["createdBy"]),

  // Scheduled export configurations
  export_schedules: defineTable({
    // Multi-tenant scope
    businessId: v.id("businesses"),

    // Template reference (one must be set)
    templateId: v.optional(v.id("export_templates")),
    prebuiltTemplateId: v.optional(v.string()),

    // Schedule configuration
    frequency: exportFrequencyValidator,

    // Schedule details
    hourUtc: v.number(),
    minuteUtc: v.optional(v.number()),
    dayOfWeek: v.optional(v.number()),
    dayOfMonth: v.optional(v.number()),

    // Filter configuration
    filters: v.optional(v.object({
      statusFilter: v.optional(v.array(v.string())),
      employeeIds: v.optional(v.array(v.id("users"))),
      dateRangeType: v.optional(dateRangeTypeValidator),
    })),

    // Status
    isEnabled: v.boolean(),

    // Timing
    lastRunAt: v.optional(v.number()),
    nextRunAt: v.number(),

    // Ownership & audit
    createdBy: v.id("users"),

    // Timestamps
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_nextRunAt", ["nextRunAt"])
    .index("by_isEnabled_nextRunAt", ["isEnabled", "nextRunAt"]),

  // Export history - records of completed exports
  export_history: defineTable({
    // Multi-tenant scope
    businessId: v.id("businesses"),

    // Template used
    templateId: v.optional(v.id("export_templates")),
    prebuiltTemplateId: v.optional(v.string()),
    templateName: v.string(),

    // Module
    module: exportModuleValidator,

    // Export details
    recordCount: v.number(),
    fileSize: v.number(),
    storageId: v.optional(v.id("_storage")),

    // Filters used
    filters: v.optional(v.object({
      startDate: v.optional(v.string()),
      endDate: v.optional(v.string()),
      statusFilter: v.optional(v.array(v.string())),
      employeeIds: v.optional(v.array(v.string())),
    })),

    // Status
    status: exportHistoryStatusValidator,
    errorMessage: v.optional(v.string()),

    // Trigger source
    triggeredBy: exportTriggerValidator,
    scheduleId: v.optional(v.id("export_schedules")),

    // Who initiated
    initiatedBy: v.optional(v.id("users")),

    // Timestamps
    completedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_module", ["businessId", "module"])
    .index("by_initiatedBy", ["initiatedBy"])
    .index("by_scheduleId", ["scheduleId"])
    .index("by_expiresAt", ["expiresAt"]),

  // ============================================
  // SALES INVOICES DOMAIN (009-sales-invoice-generation)
  // ============================================

  sales_invoices: defineTable({
    // Identity & Scoping
    businessId: v.id("businesses"),
    userId: v.id("users"),
    invoiceNumber: v.string(),

    // Customer Info (snapshot at creation time)
    customerId: v.optional(v.id("customers")),
    customerSnapshot: v.object({
      businessName: v.string(),
      contactPerson: v.optional(v.string()),
      email: v.string(),
      phone: v.optional(v.string()),
      address: v.optional(v.string()),
      taxId: v.optional(v.string()),
    }),

    // Line Items (embedded)
    lineItems: v.array(v.object({
      lineOrder: v.number(),
      description: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
      taxRate: v.optional(v.number()),
      taxAmount: v.optional(v.number()),
      discountType: v.optional(v.union(v.literal("percentage"), v.literal("fixed"))),
      discountValue: v.optional(v.number()),
      discountAmount: v.optional(v.number()),
      totalAmount: v.number(),
      currency: v.string(),
      itemCode: v.optional(v.string()),
      unitMeasurement: v.optional(v.string()),
      catalogItemId: v.optional(v.string()),
      // 012-stripe-invoice-ux: Advanced item options
      supplyDateStart: v.optional(v.string()),
      supplyDateEnd: v.optional(v.string()),
      isDiscountable: v.optional(v.boolean()),
    })),

    // Financial Totals
    subtotal: v.number(),
    totalDiscount: v.optional(v.number()),
    invoiceDiscountType: v.optional(v.union(v.literal("percentage"), v.literal("fixed"))),
    invoiceDiscountValue: v.optional(v.number()),
    totalTax: v.number(),
    totalAmount: v.number(),
    amountPaid: v.optional(v.number()),
    balanceDue: v.number(),

    // Currency
    currency: v.string(),
    exchangeRate: v.optional(v.number()),
    homeCurrencyAmount: v.optional(v.number()),

    // Tax Mode
    taxMode: v.union(v.literal("exclusive"), v.literal("inclusive")),

    // Dates
    invoiceDate: v.string(),
    dueDate: v.string(),
    sentAt: v.optional(v.number()),
    paidAt: v.optional(v.string()),
    voidedAt: v.optional(v.number()),

    // Payment Terms
    paymentTerms: paymentTermsValidator,

    // Status
    status: salesInvoiceStatusValidator,

    // Content
    notes: v.optional(v.string()),
    paymentInstructions: v.optional(v.string()),
    templateId: v.optional(v.string()),
    signatureName: v.optional(v.string()),

    // 012-stripe-invoice-ux: Additional customization
    footer: v.optional(v.string()),
    customFields: v.optional(v.array(v.object({
      key: v.string(),
      value: v.string(),
    }))),
    showTaxId: v.optional(v.boolean()),

    // Recurring
    recurringScheduleId: v.optional(v.string()),
    isRecurringSource: v.optional(v.boolean()),

    // Accounting
    accountingEntryId: v.optional(v.string()),

    // PDF Storage (generated on save from preview, used for email attachments)
    pdfStorageId: v.optional(v.id("_storage")),

    // Soft Delete & Timestamps
    deletedAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_status", ["businessId", "status"])
    .index("by_businessId_customerId", ["businessId", "customerId"])
    .index("by_businessId_invoiceNumber", ["businessId", "invoiceNumber"])
    .index("by_businessId_dueDate", ["businessId", "dueDate"])
    .index("by_recurringScheduleId", ["recurringScheduleId"]),

  customers: defineTable({
    businessId: v.id("businesses"),
    businessName: v.string(),
    contactPerson: v.optional(v.string()),
    email: v.string(),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    taxId: v.optional(v.string()),
    customerCode: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: customerStatusValidator,

    // Soft Delete & Timestamps
    deletedAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_status", ["businessId", "status"])
    .index("by_businessId_businessName", ["businessId", "businessName"])
    .index("by_businessId_email", ["businessId", "email"]),

  catalog_items: defineTable({
    businessId: v.id("businesses"),
    name: v.string(),
    description: v.optional(v.string()),
    sku: v.optional(v.string()),
    unitPrice: v.number(),
    currency: v.string(),
    unitMeasurement: v.optional(v.string()),
    taxRate: v.optional(v.number()),
    category: v.optional(v.string()),
    status: catalogItemStatusValidator,

    // Soft Delete & Timestamps
    deletedAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_status", ["businessId", "status"])
    .index("by_businessId_name", ["businessId", "name"])
    .index("by_businessId_sku", ["businessId", "sku"]),

  recurring_invoice_schedules: defineTable({
    businessId: v.id("businesses"),
    sourceInvoiceId: v.id("sales_invoices"),
    frequency: recurringFrequencyValidator,
    nextGenerationDate: v.string(),
    endDate: v.optional(v.string()),
    isActive: v.boolean(),
    lastGeneratedAt: v.optional(v.number()),
    generationCount: v.optional(v.number()),

    // Soft Delete & Timestamps
    deletedAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_isActive_nextDate", ["isActive", "nextGenerationDate"])
    .index("by_sourceInvoiceId", ["sourceInvoiceId"]),

  // ============================================
  // PAYMENTS DOMAIN (010-ar-debtor-management)
  // ============================================

  payments: defineTable({
    // Scoping
    businessId: v.id("businesses"),
    customerId: v.id("customers"),
    userId: v.id("users"),

    // Payment Type
    type: paymentTypeValidator,

    // Financial
    amount: v.number(),
    currency: v.string(),
    paymentDate: v.string(),
    paymentMethod: paymentMethodValidator,
    paymentReference: v.optional(v.string()),
    notes: v.optional(v.string()),

    // Reversal reference
    reversesPaymentId: v.optional(v.id("payments")),

    // Allocations (embedded)
    allocations: v.array(v.object({
      invoiceId: v.id("sales_invoices"),
      amount: v.number(),
      allocatedAt: v.number(),
    })),

    // Timestamps
    updatedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_customerId", ["businessId", "customerId"])
    .index("by_businessId_paymentDate", ["businessId", "paymentDate"])
    .index("by_reversesPaymentId", ["reversesPaymentId"]),
});
