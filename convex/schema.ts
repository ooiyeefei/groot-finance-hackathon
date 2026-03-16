// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { accountingSchema } from "../specs/001-accounting-double-entry/contracts/convex-schema";
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
  lhdnStatusValidator,
  peppolStatusValidator,
  einvoiceTypeValidator,
  attendanceRecordStatusValidator,
  attendanceStatusValidator,
  attendanceSourceValidator,
  timesheetStatusValidator,
  timesheetConfirmedByValidator,
  payPeriodFrequencyValidator,
  payrollAdjustmentTypeValidator,
  overtimeCalculationBasisValidator,
  salesOrderMatchStatusValidator,
  salesOrderMatchMethodValidator,
  salesOrderPeriodStatusValidator,
  purchaseOrderStatusValidator,
  poMatchStatusValidator,
  poMatchTypeValidator,
  matchMethodValidator,
  varianceTypeValidator,
  grnLineConditionValidator,
  bankAccountStatusValidator,
  bankTransactionDirectionValidator,
  reconciliationStatusValidator,
  bankTransactionCategoryValidator,
  matchTypeValidator,
  matchStatusValidator,
  confidenceLevelValidator,
} from "./lib/validators";

export default defineSchema({
  // ============================================
  // ACCOUNTING: Double-Entry Bookkeeping
  // ============================================
  ...accountingSchema,

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
    // Notification Preferences (018-app-email-notif)
    notificationPreferences: v.optional(v.object({
      inApp: v.optional(v.object({
        approval: v.optional(v.boolean()),
        anomaly: v.optional(v.boolean()),
        compliance: v.optional(v.boolean()),
        insight: v.optional(v.boolean()),
        invoice_processing: v.optional(v.boolean()),
        lhdn_submission: v.optional(v.boolean()),
      })),
      email: v.optional(v.object({
        approval: v.optional(v.boolean()),
        anomaly: v.optional(v.boolean()),
        compliance: v.optional(v.boolean()),
        insight: v.optional(v.boolean()),
        invoice_processing: v.optional(v.boolean()),
        lhdn_submission: v.optional(v.boolean()),
      })),
      digestFrequency: v.optional(v.union(v.literal("daily"), v.literal("weekly"))),
      digestTime: v.optional(v.number()),
    })),

    // SES Email Verification (019-lhdn-einv-flow-2)
    sesEmailVerified: v.optional(v.boolean()),  // Whether user's email is verified in AWS SES

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
    cancelAtPeriodEnd: v.optional(v.boolean()),    // Whether subscription cancels at period end
    cancelAt: v.optional(v.number()),              // Unix timestamp (ms) when subscription will cancel
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
      defaultFooter: v.optional(v.string()),
      defaultNotes: v.optional(v.string()),
      defaultSignatureName: v.optional(v.string()),
      defaultTaxMode: v.optional(v.string()),
      selectedTemplate: v.optional(v.string()),
      customNoteTemplates: v.optional(v.array(v.object({ id: v.string(), label: v.string(), text: v.string() }))),
      customPaymentTemplates: v.optional(v.array(v.object({ id: v.string(), label: v.string(), text: v.string() }))),
      // 012-stripe-invoice-ux: Accepted payment methods for invoice display
      acceptedPaymentMethods: v.optional(v.array(v.string())),
      // Rich payment method configs with details and QR codes
      paymentMethods: v.optional(v.array(v.object({
        id: v.string(),
        label: v.string(),
        enabled: v.boolean(),
        details: v.optional(v.string()),
        qrCodeStorageId: v.optional(v.string()),
      }))),
      // BCC sender on outgoing invoice emails
      bccOutgoingEmails: v.optional(v.boolean()),
      // Customer fields visibility on invoice
      customerFieldsVisibility: v.optional(v.object({
        contactPerson: v.optional(v.boolean()),
        email: v.optional(v.boolean()),
        phone: v.optional(v.boolean()),
        address: v.optional(v.boolean()),
        tin: v.optional(v.boolean()),
        brn: v.optional(v.boolean()),
        sstRegistration: v.optional(v.boolean()),
        idType: v.optional(v.boolean()),
      })),
    })),

    // 019-country-pricing-lock: Country-based pricing lockdown
    businessRegNumber: v.optional(v.string()),      // UEN (SG) or SSM/ROC (MY) for pricing lockdown
    subscribedCurrency: v.optional(v.string()),     // Locked billing currency: 'SGD' | 'MYR'

    // 016-e-invoice-schema-change: LHDN compliance fields
    msicCode: v.optional(v.string()),
    msicDescription: v.optional(v.string()),
    sstRegistrationNumber: v.optional(v.string()),
    lhdnTin: v.optional(v.string()),
    businessRegistrationNumber: v.optional(v.string()),
    lhdnClientId: v.optional(v.string()),

    // 016-e-invoice-schema-change: Peppol
    peppolParticipantId: v.optional(v.string()),

    // e-inv-ui-forms: Structured address (LHDN supplier address requirement)
    addressLine1: v.optional(v.string()),
    addressLine2: v.optional(v.string()),
    addressLine3: v.optional(v.string()),
    city: v.optional(v.string()),
    stateCode: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    // Note: countryCode already exists on businesses table (line ~92)

    // 001-lhdn-einvoice-submission: Auto self-bill setting
    autoSelfBillExemptVendors: v.optional(v.boolean()),

    // 022-einvoice-lhdn-buyer-flows: Buyer notification settings
    einvoiceAutoDelivery: v.optional(v.boolean()),
    einvoiceBuyerNotifications: v.optional(v.boolean()),
    einvoiceNotifyBuyerOnValidation: v.optional(v.boolean()),
    einvoiceNotifyBuyerOnCancellation: v.optional(v.boolean()),

    // 001-in-app-referral-code: Referral attribution
    referredByCode: v.optional(v.string()),
    referredByUserId: v.optional(v.string()),
    referredByBusinessId: v.optional(v.id("businesses")),
    referralCapturedAt: v.optional(v.number()),

    // Timestamps
    updatedAt: v.optional(v.number()),

    // 001-surface-automation-rate: Milestone tracking
    automationMilestones: v.optional(v.object({
      milestone_90: v.optional(v.number()),  // Unix timestamp (ms) when 90% first achieved
      milestone_95: v.optional(v.number()),  // Unix timestamp (ms) when 95% first achieved
      milestone_99: v.optional(v.number()),  // Unix timestamp (ms) when 99% first achieved
    })),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_stripeCustomerId", ["stripeCustomerId"])
    .index("by_slug", ["slug"])
    .index("by_businessRegNumber", ["businessRegNumber"]),

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

    // Timesheet & Attendance (018-timesheet-attendance)
    isAttendanceTracked: v.optional(v.boolean()),
    workScheduleId: v.optional(v.id("work_schedules")),

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
  // DOUBLE-ENTRY ACCOUNTING: Journal Entries & Lines
  // ============================================

  chart_of_accounts: defineTable({
    businessId: v.id("businesses"),
    accountCode: v.string(),
    accountName: v.string(),
    accountType: v.string(), // Asset, Liability, Equity, Revenue, Expense
    accountSubtype: v.optional(v.string()), // Cash, Bank, AR, AP, Fixed Asset, etc.
    normalBalance: v.string(), // debit or credit
    parentAccountId: v.optional(v.id("chart_of_accounts")),
    level: v.number(), // Hierarchy depth: 0 for top-level, 1 for children, etc.
    description: v.optional(v.string()),
    tags: v.optional(v.array(v.string())), // Custom tags for categorization
    isActive: v.boolean(),
    isSystemAccount: v.boolean(), // true for default accounts, false for user-created
    taxCode: v.optional(v.string()),
    createdBy: v.string(), // User ID who created this account
    createdAt: v.number(),
    updatedBy: v.optional(v.string()), // User ID who last updated this account
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_business_code", ["businessId", "accountCode"])
    .index("by_business_active", ["businessId", "isActive"])
    .index("by_business_type", ["businessId", "accountType", "isActive"]),

  accounting_periods: defineTable({
    businessId: v.id("businesses"),
    periodCode: v.string(), // YYYY-MM format
    periodName: v.string(),
    fiscalYear: v.number(),
    fiscalQuarter: v.optional(v.number()),
    startDate: v.string(),
    endDate: v.string(),
    status: v.string(), // open, closed
    journalEntryCount: v.number(),
    totalDebits: v.number(),
    totalCredits: v.number(),
    closedAt: v.optional(v.number()),
    closedBy: v.optional(v.string()),
    closingNotes: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
  })
    .index("by_business", ["businessId"])
    .index("by_business_period", ["businessId", "fiscalYear", "periodCode"])
    .index("by_business_status", ["businessId", "status"]),

  manual_exchange_rates: defineTable({
    businessId: v.id("businesses"),
    fromCurrency: v.string(),
    toCurrency: v.string(),
    rate: v.number(),
    effectiveDate: v.string(), // YYYY-MM-DD
    reason: v.optional(v.string()), // Why this rate was entered
    source: v.optional(v.string()), // Where the rate came from
    enteredBy: v.string(), // User ID who entered this rate
    createdAt: v.number(),
    updatedBy: v.optional(v.string()), // User ID who last updated this rate
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_pair", ["fromCurrency", "toCurrency"])
    .index("by_business_currencies", ["businessId", "fromCurrency", "toCurrency"])
    .index("by_business_pair_date", ["businessId", "fromCurrency", "toCurrency", "effectiveDate"]),

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
    sentBackAt: v.optional(v.number()),
    sentBackBy: v.optional(v.id("users")),
    sentBackReason: v.optional(v.string()),
    paidAt: v.optional(v.number()),
    paidBy: v.optional(v.id("users")),
    paymentMethod: v.optional(v.string()),
    paymentReference: v.optional(v.string()),
    processingStartedAt: v.optional(v.number()),
    processedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),

    // Linked Accounting Entry (created on approval)
    accountingEntryId: v.optional(v.string()),  // Stores journalEntryId (legacy field name)  // Stores journalEntryId (legacy field name, kept for data compat)

    // Double-entry accounting (new system)
    journalEntryId: v.optional(v.id("journal_entries")),
    paymentJournalEntryId: v.optional(v.id("journal_entries")),

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

    // Optimistic Locking / Version Control (for concurrent edit detection)
    version: v.optional(v.number()),  // Incremented on each update, used for conflict detection

    // 001-lhdn-einvoice-submission: LHDN self-billed e-invoice tracking
    lhdnSubmissionId: v.optional(v.string()),
    lhdnDocumentUuid: v.optional(v.string()),
    lhdnLongId: v.optional(v.string()),
    lhdnStatus: v.optional(lhdnStatusValidator),
    lhdnSubmittedAt: v.optional(v.number()),
    lhdnValidatedAt: v.optional(v.number()),
    lhdnValidationErrors: v.optional(v.array(v.object({
      code: v.string(),
      message: v.string(),
      target: v.optional(v.string()),
    }))),
    lhdnDocumentHash: v.optional(v.string()),
    selfBillRequired: v.optional(v.boolean()),
    receiptQrCodeDetected: v.optional(v.boolean()),

    // ============================================
    // E-INVOICE RETRIEVAL FIELDS (019-lhdn-einv-flow-2)
    // ============================================

    // QR Detection
    merchantFormUrl: v.optional(v.string()),  // URL from receipt QR code — merchant buyer-info form

    // E-Invoice Request Lifecycle
    einvoiceRequestStatus: v.optional(v.union(
      v.literal("none"),
      v.literal("requesting"),
      v.literal("requested"),
      v.literal("received"),
      v.literal("failed"),
    )),
    einvoiceSource: v.optional(v.union(
      v.literal("merchant_issued"),
      v.literal("manual_upload"),
      v.literal("not_applicable"),
    )),
    einvoiceAttached: v.optional(v.boolean()),  // Quick filter flag

    // LHDN Received Document Reference
    lhdnReceivedDocumentUuid: v.optional(v.string()),  // LHDN document UUID
    lhdnReceivedLongId: v.optional(v.string()),        // For verification QR code
    lhdnReceivedStatus: v.optional(v.union(v.literal("valid"), v.literal("cancelled"))),
    lhdnReceivedAt: v.optional(v.number()),            // LHDN validation timestamp

    // Email Matching
    einvoiceEmailRef: v.optional(v.string()),          // Unique 6-char token for + addressing
    einvoiceMerchantSlug: v.optional(v.string()),      // SSM slug (e.g. "vizmyinvoice", "7eleven") — for account-level email matching

    // E-Invoice storage (S3) — used by both SES email pipeline and manual upload
    einvoiceStoragePath: v.optional(v.string()),       // S3 path: {bizId}/{userId}/{claimId}/einvoice/{filename}
    einvoiceRawEmailPath: v.optional(v.string()),      // S3 path: {bizId}/{userId}/{claimId}/einvoice/raw-email.eml

    // 022-einvoice-lhdn-buyer-flows: E-invoice rejection warning
    einvoiceRejectionWarning: v.optional(v.boolean()),

    // Timestamps & Error
    einvoiceRequestedAt: v.optional(v.number()),
    einvoiceReceivedAt: v.optional(v.number()),
    einvoiceAgentError: v.optional(v.string()),        // Error from AI agent failure

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
    .index("by_submissionId", ["submissionId"])
    // LHDN self-bill index
    .index("by_businessId_lhdnStatus", ["businessId", "lhdnStatus"])
    // E-Invoice indexes (019-lhdn-einv-flow-2)
    .index("by_businessId_einvoiceRequestStatus", ["businessId", "einvoiceRequestStatus"])
    .index("by_einvoiceEmailRef", ["einvoiceEmailRef"]),

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
  // E-INVOICE RECEIVED DOCUMENTS (019-lhdn-einv-flow-2)
  // ============================================

  einvoice_received_documents: defineTable({
    businessId: v.id("businesses"),
    lhdnDocumentUuid: v.string(),                      // LHDN document UUID (26-char)
    lhdnSubmissionUid: v.optional(v.string()),
    lhdnLongId: v.optional(v.string()),                // For verification QR code
    lhdnInternalId: v.optional(v.string()),            // Merchant's own invoice reference
    supplierTin: v.optional(v.string()),
    supplierName: v.optional(v.string()),
    buyerTin: v.optional(v.string()),
    buyerEmail: v.optional(v.string()),                // From UBL — may contain + suffix
    total: v.optional(v.number()),
    dateTimeIssued: v.optional(v.string()),            // ISO date-time
    status: v.union(v.literal("valid"), v.literal("cancelled"), v.literal("rejected")),

    // 022-einvoice-lhdn-buyer-flows: Buyer rejection fields
    rejectedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    rejectedByUserId: v.optional(v.string()),
    matchedExpenseClaimId: v.optional(v.id("expense_claims")),
    matchTier: v.optional(v.union(
      v.literal("tier1_email"),
      v.literal("tier1_5_reference"),
      v.literal("tier2_tin_amount"),
      v.literal("tier3_fuzzy"),
      v.literal("manual"),
    )),
    matchConfidence: v.optional(v.number()),           // 0-1 confidence score
    matchCandidateClaimIds: v.optional(v.array(v.id("expense_claims"))),
    processedAt: v.number(),
    rawDocumentSnapshot: v.optional(v.any()),          // Key UBL fields for audit
  })
    .index("by_businessId_status", ["businessId", "status"])
    .index("by_lhdnDocumentUuid", ["lhdnDocumentUuid"])
    .index("by_matchedExpenseClaimId", ["matchedExpenseClaimId"])
    .index("by_businessId_processedAt", ["businessId", "processedAt"]),

  // ============================================
  // MERCHANT E-INVOICE URLS (system-wide, not per-tenant)
  // Known merchant e-invoice form URLs for automated submission.
  // Detection chain: QR scan → OCR URL → this table → Google search agent
  // ============================================

  merchant_einvoice: defineTable({
    merchantName: v.string(),                          // Display name: "FamilyMart"
    matchPatterns: v.array(v.string()),                // Lowercase substrings to match vendor_name: ["familymart", "family mart"]
    einvoiceUrl: v.string(),                           // E-invoice form URL
    country: v.string(),                               // ISO country code: "MY"
    urlType: v.union(
      v.literal("static"),                             // Fixed URL (e.g., MR. D.I.Y. company page)
      v.literal("dynamic"),                            // URL needs receipt params from QR (e.g., FamilyMart)
    ),
    isActive: v.boolean(),                             // Can be disabled without deleting
    source: v.optional(v.union(
      v.literal("manual"),                             // Manually added
      v.literal("agent_discovered"),                   // Found by browser agent Google search
    )),
    lastVerifiedAt: v.optional(v.number()),            // Last time URL was confirmed working
    notes: v.optional(v.string()),                     // E.g., "Bot blocked — manual only"

    // ── Per-merchant form config (learned from successful submissions) ──
    // When present, Playwright fills directly with selectors (Tier 1 — fast, ~5s)
    // When absent, CUA explores visually (Tier 2 — slow, ~120s)
    formConfig: v.optional(v.object({
      // Field mappings: CSS selector → buyer detail key
      fields: v.array(v.object({
        label: v.string(),                             // Human-readable: "Company Industry"
        selector: v.string(),                          // CSS selector: "select[name='industry']"
        type: v.union(
          v.literal("text"),                           // Regular text input
          v.literal("select"),                         // Native <select> dropdown
          v.literal("radix_select"),                   // Radix UI Select (needs keyboard nav)
          v.literal("radio"),                          // Radio button
          v.literal("checkbox"),                       // Checkbox
        ),
        buyerDetailKey: v.optional(v.string()),        // Maps to buyerDetails field: "name", "tin", "brn", etc.
        defaultValue: v.optional(v.string()),          // Fallback when no buyer detail: "Others", "Retail"
        required: v.boolean(),                         // Form requires this field
      })),
      submitSelector: v.optional(v.string()),          // CSS: "button[type='submit']"
      consentSelector: v.optional(v.string()),         // CSS: "input[type='checkbox']#consent"
      cuaHints: v.optional(v.string()),                // Extra CUA instructions for edge cases
      successCount: v.optional(v.number()),            // Times this config worked
      lastFailureReason: v.optional(v.string()),       // Last known failure for troubleshooter
      // ── DSPy optimization tracking (001-dspy-cua-optimization) ──
      tier1FailureCount: v.optional(v.number()),       // Consecutive Tier 1 failures
      lastReconDescription: v.optional(v.string()),    // Most recent successful recon output
      lastOptimizedAt: v.optional(v.number()),         // Timestamp of last MIPROv2 run
      formChangeDetectedAt: v.optional(v.number()),    // When confidence gate detected form change
    })),
  })
    .index("by_country", ["country", "isActive"])
    .index("by_merchantName", ["merchantName"]),

  // DEPRECATED: old table name, kept for migration only — remove after migration complete
  merchant_einvoice_urls: defineTable(v.any()),

  // ============================================
  // E-INVOICE REQUEST LOGS (019-lhdn-einv-flow-2)
  // ============================================

  einvoice_request_logs: defineTable({
    businessId: v.id("businesses"),
    expenseClaimId: v.id("expense_claims"),
    userId: v.id("users"),
    merchantFormUrl: v.string(),
    emailRefToken: v.string(),                         // The + suffix token
    status: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("success"),
      v.literal("failed"),
    ),
    errorMessage: v.optional(v.string()),
    browserbaseSessionId: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),

    // ── Debugging fields (019-lhdn-einv-flow-2, added for observability) ──
    merchantName: v.optional(v.string()),               // Vendor name from receipt
    tierReached: v.optional(v.string()),                // "tier1" | "tier2" | "tier2b" | "tier3"
    browserType: v.optional(v.string()),                // "local" | "browserbase"
    cuaActions: v.optional(v.number()),                 // Number of CUA turns
    verifyEvidence: v.optional(v.string()),             // What Flash saw after submit
    cost: v.optional(v.object({                         // Actual token/cost breakdown
      cuaInputTokens: v.optional(v.number()),
      cuaOutputTokens: v.optional(v.number()),
      cuaCalls: v.optional(v.number()),
      cuaCostUsd: v.optional(v.number()),
      flashInputTokens: v.optional(v.number()),
      flashOutputTokens: v.optional(v.number()),
      flashCalls: v.optional(v.number()),
      flashCostUsd: v.optional(v.number()),
      capsolverSolves: v.optional(v.number()),
      capsolverCostUsd: v.optional(v.number()),
      totalCostUsd: v.optional(v.number()),
    })),

    // ── DSPy self-learning fields (001-dspy-cua-optimization) ──
    reconDescription: v.optional(v.string()),
    generatedHint: v.optional(v.string()),
    hintEffectivenessOutcome: v.optional(v.union(
      v.literal("helped"),
      v.literal("not_helped"),
      v.literal("pending"),
    )),
    confidenceGateScore: v.optional(v.number()),
    confidenceGateDecision: v.optional(v.union(
      v.literal("proceed"),
      v.literal("skip"),
    )),
    failureCategory: v.optional(v.union(
      v.literal("connectivity"),
      v.literal("form_validation"),
      v.literal("session"),
      v.literal("captcha"),
      v.literal("unknown"),
    )),
    perFieldResults: v.optional(v.array(v.object({
      fieldName: v.string(),
      filled: v.boolean(),
      selector: v.optional(v.string()),
      error: v.optional(v.string()),
    }))),
    buyerProfileMatchResult: v.optional(v.object({
      profileSelected: v.optional(v.string()),
      reasoning: v.optional(v.string()),
      matchType: v.optional(v.string()),
    })),
    dspyModuleVersion: v.optional(v.string()),
  })
    .index("by_expenseClaimId", ["expenseClaimId"])
    .index("by_businessId_status", ["businessId", "status"])
    .index("by_merchantName_status", ["merchantName", "status"]),

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

    // Domain: distinguishes AP supplier invoices from expense claim receipts accidentally stored here
    documentDomain: v.optional(v.union(v.literal("invoices"), v.literal("expense_claims"))),

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

    // Double-entry accounting (001-accounting-double-entry)
    journalEntryId: v.optional(v.id("journal_entries")),
    accountingStatus: v.optional(v.union(
      v.literal("draft"),
      v.literal("posted"),
      v.literal("voided")
    )),

    // AP Subledger: Payment tracking (invoices = AP subledger)
    paidAmount: v.optional(v.number()),
    paymentStatus: v.optional(v.union(
      v.literal("unpaid"),
      v.literal("partial"),
      v.literal("paid")
    )),
    dueDate: v.optional(v.string()),
    paymentHistory: v.optional(v.array(v.object({
      amount: v.number(),
      paymentDate: v.string(),
      paymentMethod: v.string(),
      journalEntryId: v.id("journal_entries"),
      notes: v.optional(v.string()),
      recordedBy: v.string(),
      recordedAt: v.number(),
    }))),

    // Timestamps
    processingStartedAt: v.optional(v.number()),
    processedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    // 001-lhdn-einvoice-submission: LHDN self-billed e-invoice tracking
    lhdnSubmissionId: v.optional(v.string()),
    lhdnDocumentUuid: v.optional(v.string()),
    lhdnLongId: v.optional(v.string()),
    lhdnStatus: v.optional(lhdnStatusValidator),
    lhdnSubmittedAt: v.optional(v.number()),
    lhdnValidatedAt: v.optional(v.number()),
    lhdnValidationErrors: v.optional(v.array(v.object({
      code: v.string(),
      message: v.string(),
      target: v.optional(v.string()),
    }))),
    lhdnDocumentHash: v.optional(v.string()),

    deletedAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_userId", ["userId"])
    .index("by_status", ["status"])
    .index("by_legacyId", ["legacyId"])
    // LHDN self-bill index
    .index("by_businessId_lhdnStatus", ["businessId", "lhdnStatus"])
    // AP subledger: payment status queries
    .index("by_business_payment_status", ["businessId", "paymentStatus"]),

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
    contextTransactionId: v.optional(v.string()),

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

    // Payment Terms (013-ap-vendor-management)
    paymentTerms: v.optional(paymentTermsValidator),
    customPaymentDays: v.optional(v.number()),
    defaultCurrency: v.optional(v.string()),

    // Contact & Bank Details (013-ap-vendor-management)
    contactPerson: v.optional(v.string()),
    website: v.optional(v.string()),
    notes: v.optional(v.string()),
    bankDetails: v.optional(v.object({
      bankName: v.optional(v.string()),
      accountNumber: v.optional(v.string()),
      routingCode: v.optional(v.string()),
      accountHolderName: v.optional(v.string()),
    })),

    // 001-lhdn-einvoice-submission: LHDN exempt vendor flag
    isLhdnExempt: v.optional(v.boolean()),

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
    accountingEntryId: v.optional(v.string()),  // Stores journalEntryId (legacy field name)  // Stores journalEntryId (legacy field name, kept for data compat)

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

  ai_message_usage: defineTable({
    businessId: v.id("businesses"),
    month: v.string(),                      // "YYYY-MM" format
    messagesUsed: v.number(),
    planLimit: v.number(),                  // -1 = unlimited
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_month", ["businessId", "month"]),

  einvoice_usage: defineTable({
    businessId: v.id("businesses"),
    month: v.string(),                      // "YYYY-MM" format
    submissionsUsed: v.number(),
    planLimit: v.number(),                  // -1 = unlimited
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_month", ["businessId", "month"]),

  credit_packs: defineTable({
    businessId: v.id("businesses"),
    packType: v.string(),                   // "ai_credits" | "ocr_credits"
    packName: v.string(),                   // "boost" | "power" | "extra_ocr"
    totalCredits: v.number(),
    creditsUsed: v.number(),
    creditsRemaining: v.number(),
    purchasedAt: v.number(),
    expiresAt: v.number(),
    status: v.string(),                     // "active" | "depleted" | "expired"
    stripePaymentIntentId: v.optional(v.string()),
    stripeSessionId: v.optional(v.string()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_packType", ["businessId", "packType"])
    .index("by_businessId_status", ["businessId", "status"])
    .index("by_status_expiresAt", ["status", "expiresAt"]),

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

  // CSV Import Templates — saved column mappings for repeat uploads
  csv_import_templates: defineTable({
    businessId: v.id("businesses"),
    name: v.string(),
    schemaType: v.union(v.literal("sales_statement"), v.literal("bank_statement"), v.literal("purchase_order"), v.literal("goods_received_note")),
    columnMappings: v.array(v.object({
      sourceHeader: v.string(),
      targetField: v.string(),
      confidence: v.optional(v.number()),
      order: v.number(),
    })),
    headerFingerprint: v.string(),
    sourceHeaders: v.array(v.string()),
    createdBy: v.id("users"),
    updatedBy: v.optional(v.id("users")),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_fingerprint", ["businessId", "headerFingerprint"])
    .index("by_businessId_schemaType", ["businessId", "schemaType"]),

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
  // EXPORT CODE MAPPINGS (001-master-accounting-export)
  // ============================================

  export_code_mappings: defineTable({
    businessId: v.id("businesses"),
    targetSystem: v.string(),
    mappingType: v.string(),
    sourceValue: v.string(),
    targetCode: v.string(),
    isDefault: v.optional(v.boolean()),
    createdBy: v.id("users"),
    updatedBy: v.optional(v.id("users")),
    updatedAt: v.optional(v.number()),
  })
    .index("by_business_system", ["businessId", "targetSystem"])
    .index("by_business_type", ["businessId", "targetSystem", "mappingType"])
    .index("by_business_source", [
      "businessId",
      "targetSystem",
      "mappingType",
      "sourceValue",
    ]),

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
      // 016-e-invoice-schema-change: LHDN buyer compliance fields
      tin: v.optional(v.string()),
      brn: v.optional(v.string()),
      addressLine1: v.optional(v.string()),
      addressLine2: v.optional(v.string()),
      addressLine3: v.optional(v.string()),
      city: v.optional(v.string()),
      stateCode: v.optional(v.string()),
      postalCode: v.optional(v.string()),
      countryCode: v.optional(v.string()),
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
      itemNotes: v.optional(v.string()),
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
    accountingEntryId: v.optional(v.string()),  // Stores journalEntryId (legacy field name)

    // Double-entry accounting (new system)
    journalEntryId: v.optional(v.id("journal_entries")),
    paymentJournalEntryId: v.optional(v.id("journal_entries")),

    // PDF Storage (generated on save from preview, used for email attachments)
    pdfStorageId: v.optional(v.id("_storage")),

    // 016-e-invoice-schema-change: LHDN MyInvois tracking
    lhdnSubmissionId: v.optional(v.string()),
    lhdnDocumentUuid: v.optional(v.string()),
    lhdnLongId: v.optional(v.string()),
    lhdnStatus: v.optional(lhdnStatusValidator),
    lhdnSubmittedAt: v.optional(v.number()),
    lhdnValidatedAt: v.optional(v.number()),
    lhdnValidationErrors: v.optional(v.array(v.object({
      code: v.string(),
      message: v.string(),
      target: v.optional(v.string()),
    }))),
    lhdnDocumentHash: v.optional(v.string()),

    // 022-einvoice-lhdn-buyer-flows: Buyer rejection/cancellation tracking
    lhdnRejectedAt: v.optional(v.number()),
    lhdnStatusReason: v.optional(v.string()),
    lhdnReviewRequired: v.optional(v.boolean()),
    lhdnPdfDeliveredAt: v.optional(v.number()),
    lhdnPdfDeliveredTo: v.optional(v.string()),

    // 001-einv-pdf-gen: PDF storage and delivery status tracking
    lhdnPdfS3Path: v.optional(v.string()),  // S3 key: einvoices/{businessId}/{invoiceId}/validated/{filename}
    lhdnPdfDeliveryStatus: v.optional(v.string()),  // "pending" | "delivered" | "failed"
    lhdnPdfDeliveryError: v.optional(v.string()),

    // 023-einv-buyer-notifications: Buyer notification audit log
    buyerNotificationLog: v.optional(v.array(v.object({
      eventType: v.union(
        v.literal("validation"),
        v.literal("cancellation"),
        v.literal("rejection")
      ),
      recipientEmail: v.string(),
      timestamp: v.number(),
      sendStatus: v.union(
        v.literal("sent"),
        v.literal("skipped"),
        v.literal("failed")
      ),
      skipReason: v.optional(v.string()),
      errorMessage: v.optional(v.string()),
      sesMessageId: v.optional(v.string()),
    }))),

    // 016-e-invoice-schema-change: Peppol InvoiceNow tracking
    peppolDocumentId: v.optional(v.string()),
    peppolStatus: v.optional(peppolStatusValidator),
    peppolTransmittedAt: v.optional(v.number()),
    peppolDeliveredAt: v.optional(v.number()),
    peppolErrors: v.optional(v.array(v.object({
      code: v.string(),
      message: v.string(),
    }))),

    // 016-e-invoice-schema-change: e-invoice document type
    einvoiceType: v.optional(einvoiceTypeValidator),

    // 001-peppol-integrate: Credit note linking
    originalInvoiceId: v.optional(v.id("sales_invoices")),
    creditNoteReason: v.optional(v.string()),

    // Soft Delete & Timestamps
    deletedAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_status", ["businessId", "status"])
    .index("by_businessId_customerId", ["businessId", "customerId"])
    .index("by_businessId_invoiceNumber", ["businessId", "invoiceNumber"])
    .index("by_businessId_dueDate", ["businessId", "dueDate"])
    .index("by_recurringScheduleId", ["recurringScheduleId"])
    // 016-e-invoice-schema-change: e-invoice status indexes
    .index("by_businessId_lhdnStatus", ["businessId", "lhdnStatus"])
    .index("by_businessId_peppolStatus", ["businessId", "peppolStatus"])
    // 001-peppol-integrate: Credit note lookup by parent invoice
    .index("by_originalInvoiceId", ["originalInvoiceId"]),

  customers: defineTable({
    businessId: v.id("businesses"),
    businessName: v.string(),
    contactPerson: v.optional(v.string()),
    contactPersonPosition: v.optional(v.string()),
    email: v.string(),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    website: v.optional(v.string()),
    taxId: v.optional(v.string()),
    customerCode: v.optional(v.string()),
    currencyCode: v.optional(v.string()),
    businessNature: v.optional(v.string()),
    notes: v.optional(v.string()),
    creditLimit: v.optional(v.number()),
    paymentTerms: v.optional(v.string()),
    status: customerStatusValidator,

    // 016-e-invoice-schema-change: Tax identifiers
    tin: v.optional(v.string()),
    brn: v.optional(v.string()),
    sstRegistration: v.optional(v.string()),
    idType: v.optional(v.string()), // BRN, NRIC, PASSPORT, ARMY — LHDN e-invoice requirement

    // 016-e-invoice-schema-change: Peppol
    peppolParticipantId: v.optional(v.string()),

    // 016-e-invoice-schema-change: Structured address (LHDN requirement)
    addressLine1: v.optional(v.string()),
    addressLine2: v.optional(v.string()),
    addressLine3: v.optional(v.string()),
    city: v.optional(v.string()),
    stateCode: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    countryCode: v.optional(v.string()),

    // Extended customer particulars
    phone2: v.optional(v.string()),
    fax: v.optional(v.string()),
    email2: v.optional(v.string()),

    // 001-lhdn-einvoice-submission: LHDN exempt customer flag
    isLhdnExempt: v.optional(v.boolean()),

    // Soft Delete & Timestamps
    deletedAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_status", ["businessId", "status"])
    .index("by_businessId_businessName", ["businessId", "businessName"])
    .index("by_businessId_email", ["businessId", "email"])
    // 016-e-invoice-schema-change: TIN lookup index
    .index("by_businessId_tin", ["businessId", "tin"]),

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
    glCode: v.optional(v.string()),
    status: catalogItemStatusValidator,

    // Stripe sync fields (014-stripe-catalog-sync)
    source: v.optional(v.string()), // "manual" | "stripe" — undefined treated as "manual"
    stripeProductId: v.optional(v.string()),
    stripePriceId: v.optional(v.string()),
    billingInterval: v.optional(v.string()), // "monthly" | "yearly" | "weekly" | "daily" | "one_time"
    lastSyncedAt: v.optional(v.number()),
    locallyDeactivated: v.optional(v.boolean()),

    // Soft Delete & Timestamps
    deletedAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_status", ["businessId", "status"])
    .index("by_businessId_name", ["businessId", "name"])
    .index("by_businessId_sku", ["businessId", "sku"])
    .index("by_businessId_stripeProductId", ["businessId", "stripeProductId"])
    .index("by_businessId_stripePriceId", ["businessId", "stripePriceId"])
    .index("by_businessId_source", ["businessId", "source"]),

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

  // ── Stripe Integration (014-stripe-catalog-sync) ──────────────────────
  stripe_integrations: defineTable({
    businessId: v.id("businesses"),
    stripeAccountId: v.string(),
    stripeAccountName: v.optional(v.string()),
    stripeWebhookEndpointId: v.optional(v.string()),
    stripeSecretKey: v.optional(v.string()), // Legacy field — kept for dev data compat
    status: v.string(), // "connected" | "disconnected"
    connectedAt: v.number(),
    disconnectedAt: v.optional(v.number()),
    lastSyncAt: v.optional(v.number()),
    createdBy: v.string(), // Clerk user ID
  })
    .index("by_businessId", ["businessId"]),

  sync_logs: defineTable({
    businessId: v.id("businesses"),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    status: v.string(), // "running" | "completed" | "partial" | "failed"
    productsCreated: v.number(),
    productsUpdated: v.number(),
    productsDeactivated: v.number(),
    productsSkipped: v.number(),
    totalStripeProducts: v.number(),
    errors: v.optional(v.array(v.string())),
    triggeredBy: v.string(), // Clerk user ID
  })
    .index("by_businessId", ["businessId"]),

  // ── Notifications (018-app-email-notif) ─────────────────────────────
  notifications: defineTable({
    recipientUserId: v.id("users"),
    businessId: v.id("businesses"),
    type: v.union(
      v.literal("approval"),
      v.literal("anomaly"),
      v.literal("compliance"),
      v.literal("insight"),
      v.literal("invoice_processing"),
      v.literal("lhdn_submission")
    ),
    severity: v.union(
      v.literal("info"),
      v.literal("warning"),
      v.literal("critical")
    ),
    status: v.union(
      v.literal("unread"),
      v.literal("read"),
      v.literal("dismissed")
    ),
    title: v.string(),
    body: v.string(),
    resourceType: v.optional(v.union(
      v.literal("expense_claim"),
      v.literal("invoice"),
      v.literal("sales_invoice"),
      v.literal("insight"),
      v.literal("dashboard")
    )),
    resourceId: v.optional(v.string()),
    resourceUrl: v.optional(v.string()),
    sourceEvent: v.optional(v.string()),
    emailSent: v.optional(v.boolean()),
    emailMessageId: v.optional(v.string()),
    createdAt: v.number(),
    readAt: v.optional(v.number()),
    dismissedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  })
    .index("by_recipient_business_status", ["recipientUserId", "businessId", "status"])
    .index("by_recipient_business_created", ["recipientUserId", "businessId", "createdAt"])
    .index("by_business_type", ["businessId", "type"])
    .index("by_createdAt", ["createdAt"])
    .index("by_sourceEvent", ["sourceEvent"]),

  notification_digests: defineTable({
    userId: v.id("users"),
    businessId: v.id("businesses"),
    lastDigestSentAt: v.number(),
    lastDigestEmailMessageId: v.optional(v.string()),
    notificationCount: v.number(),
  })
    .index("by_userId_businessId", ["userId", "businessId"]),

  // ============================================
  // TIMESHEET & ATTENDANCE DOMAIN (018-timesheet-attendance)
  // ============================================

  // Daily check-in/check-out records for tracked employees
  attendance_records: defineTable({
    businessId: v.id("businesses"),
    userId: v.id("users"),
    date: v.string(), // ISO date YYYY-MM-DD
    checkInTime: v.number(), // Unix timestamp
    checkOutTime: v.optional(v.number()), // Unix timestamp (null = incomplete)
    totalMinutes: v.optional(v.number()), // checkOut - checkIn - breakMinutes
    breakMinutes: v.number(), // From work schedule config
    status: attendanceRecordStatusValidator,
    attendanceStatus: attendanceStatusValidator,
    latenessMinutes: v.optional(v.number()),
    earlyDepartureMinutes: v.optional(v.number()),
    hoursDeducted: v.optional(v.number()),
    deductionWaived: v.optional(v.boolean()),
    waivedBy: v.optional(v.id("users")),
    waivedReason: v.optional(v.string()),
    source: attendanceSourceValidator,
    manualEditReason: v.optional(v.string()),
    location: v.optional(v.object({
      lat: v.number(),
      lng: v.number(),
      accuracy: v.number(),
    })),
    locationFlagged: v.optional(v.boolean()),
    notes: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_userId", ["userId"])
    .index("by_businessId_userId_date", ["businessId", "userId", "date"])
    .index("by_businessId_date", ["businessId", "date"])
    .index("by_businessId_status", ["businessId", "status"]),

  // Configurable work schedule profiles
  work_schedules: defineTable({
    businessId: v.id("businesses"),
    name: v.string(),
    startTime: v.string(), // HH:MM format
    endTime: v.string(), // HH:MM format
    workDays: v.array(v.number()), // 0=Sun, 1=Mon, ..., 6=Sat
    breakMinutes: v.number(),
    graceMinutes: v.number(), // Grace period for lateness
    regularHoursPerDay: v.number(), // Calculated: endTime - startTime - breakMinutes
    overtimeRuleId: v.optional(v.id("overtime_rules")),
    isDefault: v.boolean(),
    isActive: v.boolean(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_isDefault", ["businessId", "isDefault"])
    .index("by_businessId_isActive", ["businessId", "isActive"]),

  // Configurable overtime rate tiers
  overtime_rules: defineTable({
    businessId: v.id("businesses"),
    name: v.string(),
    calculationBasis: overtimeCalculationBasisValidator,
    dailyThresholdHours: v.optional(v.number()),
    weeklyThresholdHours: v.optional(v.number()),
    requiresPreApproval: v.boolean(),
    rateTiers: v.array(v.object({
      label: v.string(), // e.g., "Standard OT", "Rest Day", "Public Holiday"
      multiplier: v.number(), // e.g., 1.5, 2.0, 3.0
      applicableOn: v.string(), // "weekday_ot", "rest_day", "public_holiday"
    })),
    isActive: v.boolean(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_isActive", ["businessId", "isActive"]),

  // Periodic summary of employee work hours for a pay period
  timesheets: defineTable({
    businessId: v.id("businesses"),
    userId: v.id("users"),
    payPeriodConfigId: v.id("pay_period_configs"),
    periodStartDate: v.string(), // ISO date YYYY-MM-DD
    periodEndDate: v.string(), // ISO date YYYY-MM-DD
    dailyEntries: v.array(v.object({
      date: v.string(),
      attendanceRecordId: v.optional(v.string()),
      dayType: v.string(), // workday, rest_day, public_holiday, leave
      leaveType: v.optional(v.string()),
      checkInTime: v.optional(v.number()),
      checkOutTime: v.optional(v.number()),
      regularMinutes: v.number(),
      overtimeMinutes: v.number(),
      overtimeTier: v.optional(v.string()),
      attendanceStatus: v.string(),
      latenessMinutes: v.number(),
      earlyDepartureMinutes: v.number(),
      hoursDeducted: v.number(),
      deductionWaived: v.boolean(),
      flags: v.array(v.string()),
    })),
    totalRegularMinutes: v.number(),
    totalOvertimeMinutes: v.number(),
    overtimeByTier: v.array(v.object({
      tierLabel: v.string(),
      multiplier: v.number(),
      minutes: v.number(),
    })),
    leaveDays: v.array(v.object({
      leaveType: v.string(),
      days: v.number(),
    })),
    publicHolidayDays: v.number(),
    attendanceDeductionMinutes: v.number(),
    netPayableMinutes: v.number(),
    hasAnomalies: v.boolean(),
    anomalySummary: v.optional(v.array(v.string())),
    status: timesheetStatusValidator,
    confirmedAt: v.optional(v.number()),
    confirmedBy: v.optional(timesheetConfirmedByValidator),
    approverId: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    approverNotes: v.optional(v.string()),
    finalizedAt: v.optional(v.number()),
    lockedAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_userId", ["userId"])
    .index("by_businessId_status", ["businessId", "status"])
    .index("by_businessId_userId_periodStartDate", ["businessId", "userId", "periodStartDate"])
    .index("by_approverId_status", ["approverId", "status"]),

  // Corrections for locked pay periods, applied forward
  payroll_adjustments: defineTable({
    businessId: v.id("businesses"),
    userId: v.id("users"),
    originalTimesheetId: v.id("timesheets"),
    originalPeriodStartDate: v.string(),
    adjustmentType: payrollAdjustmentTypeValidator,
    minutes: v.number(),
    overtimeTier: v.optional(v.string()),
    reason: v.string(),
    createdBy: v.id("users"),
    appliedToTimesheetId: v.optional(v.id("timesheets")),
    appliedAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_userId", ["userId"])
    .index("by_originalTimesheetId", ["originalTimesheetId"])
    .index("by_businessId_appliedToTimesheetId", ["businessId", "appliedToTimesheetId"]),

  // Business-level payroll cycle configuration
  pay_period_configs: defineTable({
    businessId: v.id("businesses"),
    frequency: payPeriodFrequencyValidator,
    startDay: v.number(), // 0-6 for weekly/biweekly, 1-28 for monthly
    confirmationDeadlineDays: v.number(), // Business days after period close
    isActive: v.boolean(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_isActive", ["businessId", "isActive"]),

  // ============================================
  // MOBILE APP: Push Notifications & App Versions
  // ============================================

  push_subscriptions: defineTable({
    userId: v.id("users"),
    businessId: v.id("businesses"),
    platform: v.union(v.literal("ios"), v.literal("android")),
    deviceToken: v.string(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_deviceToken", ["deviceToken"])
    .index("by_userId_platform", ["userId", "platform"]),

  app_versions: defineTable({
    platform: v.union(v.literal("ios"), v.literal("android")),
    minimumVersion: v.string(),
    latestVersion: v.string(),
    forceUpdateMessage: v.string(),
    softUpdateMessage: v.string(),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
  })
    .index("by_platform", ["platform"]),

  // ============================================
  // LHDN E-INVOICE SUBMISSION (001-lhdn-einvoice-submission)
  // ============================================

  lhdn_tokens: defineTable({
    businessId: v.id("businesses"),
    tenantTin: v.string(),
    accessToken: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_businessId", ["businessId"]),

  lhdn_submission_jobs: defineTable({
    businessId: v.id("businesses"),
    sourceType: v.string(),
    sourceId: v.string(),
    documentType: v.string(),
    status: v.string(),
    submissionUid: v.optional(v.string()),
    pollAttempts: v.number(),
    retryCount: v.number(),
    lastPollAt: v.optional(v.number()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_businessId_status", ["businessId", "status"])
    .index("by_status", ["status"]),

  // ============================================
  // COMPLIANCE: PDPA Consent Records
  // ============================================

  consent_records: defineTable({
    userId: v.id("users"),
    businessId: v.optional(v.id("businesses")),
    policyType: v.union(v.literal("privacy_policy"), v.literal("terms_of_service")),
    policyVersion: v.string(),
    acceptedAt: v.number(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    source: v.union(
      v.literal("onboarding"),
      v.literal("invitation"),
      v.literal("banner"),
      v.literal("settings")
    ),
    revokedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_policyType", ["userId", "policyType"])
    .index("by_userId_policyType_policyVersion", ["userId", "policyType", "policyVersion"])
    .index("by_businessId", ["businessId"]),

  // ============================================
  // ACCOUNT DELETION DATA EXPORTS
  // ============================================

  // ============================================
  // REFERRAL PROGRAM (001-in-app-referral-code)
  // ============================================

  referral_codes: defineTable({
    code: v.string(),
    userId: v.string(),                          // Clerk user ID
    businessId: v.id("businesses"),               // Business at time of creation
    stripePromotionCodeId: v.optional(v.string()),
    stripeCouponId: v.optional(v.string()),
    type: v.union(
      v.literal("customer"),
      v.literal("partner_referrer"),
      v.literal("partner_reseller")
    ),
    isActive: v.boolean(),
    totalReferrals: v.number(),
    totalConversions: v.number(),
    totalEarnings: v.number(),
    createdAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_userId", ["userId"])
    .index("by_businessId", ["businessId"])
    .index("by_stripePromotionCodeId", ["stripePromotionCodeId"]),

  referrals: defineTable({
    referralCodeId: v.id("referral_codes"),
    referralCode: v.string(),
    referrerUserId: v.string(),                   // Clerk user ID
    referrerBusinessId: v.id("businesses"),
    referredBusinessId: v.optional(v.id("businesses")),
    referredBusinessName: v.optional(v.string()),
    status: v.union(
      v.literal("signed_up"),
      v.literal("trial"),
      v.literal("paid"),
      v.literal("upgraded"),
      v.literal("downgraded"),
      v.literal("churned"),
      v.literal("cancelled"),
      v.literal("expired")
    ),
    capturedAt: v.number(),
    convertedAt: v.optional(v.number()),
    planAtConversion: v.optional(v.string()),
    currentPlan: v.optional(v.string()),
    estimatedEarning: v.optional(v.number()),
    attributionExpiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_referralCodeId", ["referralCodeId"])
    .index("by_referrerUserId", ["referrerUserId"])
    .index("by_referredBusinessId", ["referredBusinessId"])
    .index("by_status", ["status"]),

  // ============================================
  // AR RECONCILIATION: Sales Orders (imported from platform statements)
  // ============================================
  sales_orders: defineTable({
    businessId: v.id("businesses"),
    sourcePlatform: v.optional(v.string()),
    sourceFileName: v.string(),
    importBatchId: v.string(),
    orderReference: v.string(),
    orderDate: v.string(),
    customerName: v.optional(v.string()),

    // Top-level product fields (for single-item orders or summary)
    productName: v.optional(v.string()),
    productCode: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unitPrice: v.optional(v.number()),

    // Embedded line items (for multi-item orders from CSV)
    lineItems: v.optional(v.array(v.object({
      lineOrder: v.number(),
      productName: v.optional(v.string()),
      productCode: v.optional(v.string()),
      quantity: v.number(),
      unitPrice: v.number(),
      totalAmount: v.number(),
      description: v.optional(v.string()),
    }))),

    // Amounts
    grossAmount: v.number(),
    platformFee: v.optional(v.number()),
    netAmount: v.optional(v.number()),
    currency: v.string(),
    paymentMethod: v.optional(v.string()),

    // Fee breakdown (commission, shipping, marketing, refund, other) — legacy fixed structure
    feeBreakdown: v.optional(v.object({
      commissionFee: v.optional(v.number()),
      shippingFee: v.optional(v.number()),
      marketingFee: v.optional(v.number()),
      refundAmount: v.optional(v.number()),
      otherFee: v.optional(v.number()),
    })),

    // Classified fees — dynamic array with confidence scores (hybrid fee detection)
    classifiedFees: v.optional(v.array(v.object({
      feeName: v.string(),
      amount: v.number(),
      accountCode: v.string(),
      accountName: v.string(),
      confidence: v.number(),
      tier: v.number(),       // 1 = rules-based, 2 = AI-classified
      isNew: v.boolean(),     // true if fee name never seen before
    }))),
    feeClassificationStatus: v.optional(v.string()), // "classified" | "partial" | "unclassified" | "reviewed"
    balanceValidationStatus: v.optional(v.string()), // "balanced" | "unbalanced"
    balanceDiscrepancy: v.optional(v.number()),

    // Matching
    matchStatus: salesOrderMatchStatusValidator,
    matchedInvoiceId: v.optional(v.id("sales_invoices")),
    matchConfidence: v.optional(v.number()),
    matchMethod: v.optional(salesOrderMatchMethodValidator),
    varianceAmount: v.optional(v.number()),
    varianceReason: v.optional(v.string()),

    // Structured variance details (replaces free-text varianceReason for rich display)
    matchVariances: v.optional(v.array(v.object({
      field: v.string(),           // e.g. "grossAmount", "quantity", "productName"
      orderValue: v.string(),      // stringified for uniform display
      invoiceValue: v.string(),
      difference: v.optional(v.number()), // numeric diff for amounts
      severity: v.union(v.literal("info"), v.literal("warning"), v.literal("error")),
    }))),

    // Period-based reconciliation
    periodStatus: v.optional(salesOrderPeriodStatusValidator),
    periodClosedAt: v.optional(v.number()),
    periodClosedBy: v.optional(v.string()),

    // Document linkage
    sourceDocumentId: v.optional(v.id("invoices")),

    // Accounting integration
    journalEntryIds: v.optional(v.array(v.id("journal_entries"))),
    reconciledAt: v.optional(v.number()),

    // AI Matching (Tier 2 DSPy Smart Matcher)
    aiMatchSuggestions: v.optional(v.array(v.object({
      invoiceId: v.string(),
      invoiceNumber: v.string(),
      allocatedAmount: v.number(),
      confidence: v.number(),
      reasoning: v.string(),
      matchType: v.string(),  // "single" | "split"
    }))),
    aiMatchModelVersion: v.optional(v.string()),
    aiMatchTier: v.optional(v.number()),  // 0 = unprocessed, 1 = Tier 1, 2 = Tier 2
    aiMatchStatus: v.optional(v.string()),  // "pending_review" | "approved" | "rejected" | "corrected"

    isRefund: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_matchStatus", ["businessId", "matchStatus"])
    .index("by_businessId_orderDate", ["businessId", "orderDate"])
    .index("by_businessId_importBatchId", ["businessId", "importBatchId"])
    .index("by_businessId_orderReference", ["businessId", "orderReference"])
    .index("by_businessId_periodStatus", ["businessId", "periodStatus"]),

  bank_accounts: defineTable({
    businessId: v.id("businesses"),
    bankName: v.string(),
    accountNumber: v.string(),
    accountNumberLast4: v.string(),
    currency: v.string(),
    nickname: v.optional(v.string()),
    status: bankAccountStatusValidator,
    lastImportDate: v.optional(v.string()),
    transactionCount: v.number(),
    createdBy: v.id("users"),
    deletedAt: v.optional(v.number()),
    // bank-recon: Link to Chart of Accounts (Cash at Bank GL account)
    glAccountId: v.optional(v.id("chart_of_accounts")),
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_status", ["businessId", "status"]),

  bank_transactions: defineTable({
    businessId: v.id("businesses"),
    bankAccountId: v.id("bank_accounts"),
    importSessionId: v.id("bank_import_sessions"),
    transactionDate: v.string(),
    description: v.string(),
    debitAmount: v.optional(v.number()),
    creditAmount: v.optional(v.number()),
    balance: v.optional(v.number()),
    reference: v.optional(v.string()),
    transactionType: v.optional(v.string()),
    amount: v.number(),
    direction: bankTransactionDirectionValidator,
    deduplicationHash: v.string(),
    reconciliationStatus: reconciliationStatusValidator,
    category: v.optional(bankTransactionCategoryValidator),
    deletedAt: v.optional(v.number()),
    // bank-recon: DSPy classification fields
    suggestedDebitAccountId: v.optional(v.id("chart_of_accounts")),
    suggestedCreditAccountId: v.optional(v.id("chart_of_accounts")),
    classificationConfidence: v.optional(v.number()),
    classificationTier: v.optional(v.number()),
    classificationReasoning: v.optional(v.string()),
    journalEntryId: v.optional(v.id("journal_entries")),
    classifiedAt: v.optional(v.number()),
    classifiedBy: v.optional(v.string()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_bankAccountId", ["bankAccountId"])
    .index("by_importSessionId", ["importSessionId"])
    .index("by_bankAccountId_status", ["bankAccountId", "reconciliationStatus"])
    .index("by_deduplicationHash", ["deduplicationHash"])
    .index("by_bankAccountId_date", ["bankAccountId", "transactionDate"]),

  bank_import_sessions: defineTable({
    businessId: v.id("businesses"),
    bankAccountId: v.id("bank_accounts"),
    fileName: v.string(),
    rowCount: v.number(),
    duplicatesSkipped: v.number(),
    dateRange: v.object({
      from: v.string(),
      to: v.string(),
    }),
    importedBy: v.id("users"),
    importedAt: v.number(),
  })
    .index("by_businessId", ["businessId"])
    .index("by_bankAccountId", ["bankAccountId"]),

  reconciliation_matches: defineTable({
    businessId: v.id("businesses"),
    bankTransactionId: v.id("bank_transactions"),
    accountingEntryId: v.optional(v.string()),  // Stores journalEntryId (legacy field name)  // Stores journalEntryId (legacy field name, kept for data compat)
    matchType: matchTypeValidator,
    confidenceScore: v.number(),
    confidenceLevel: confidenceLevelValidator,
    matchReason: v.string(),
    status: matchStatusValidator,
    confirmedBy: v.optional(v.id("users")),
    confirmedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_bankTransactionId", ["bankTransactionId"])
    .index("by_accountingEntryId", ["accountingEntryId"])
    .index("by_bankTransactionId_status", ["bankTransactionId", "status"]),

  // ============================================
  // FEE CLASSIFICATION (Hybrid Fee Detection)
  // ============================================

  fee_classification_rules: defineTable({
    businessId: v.id("businesses"),
    platform: v.string(),       // "shopee", "lazada", "tiktok_shop", "stripe", "grabpay", "all", or custom
    keyword: v.string(),        // Case-insensitive keyword pattern
    accountCode: v.string(),    // GL account code e.g. "5801"
    accountName: v.string(),    // Human-readable e.g. "Commission Fees"
    priority: v.optional(v.number()),  // Higher = preferred when multiple match
    isActive: v.boolean(),
    createdBy: v.optional(v.string()),
    deletedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_platform", ["businessId", "platform"]),

  fee_classification_corrections: defineTable({
    businessId: v.id("businesses"),
    originalFeeName: v.string(),
    originalAccountCode: v.string(),
    correctedAccountCode: v.string(),
    platform: v.string(),
    salesOrderId: v.optional(v.id("sales_orders")),
    correctedBy: v.string(),
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_platform", ["businessId", "platform"]),

  // ============================================
  // DSPY MODEL VERSIONS (Fee Classification AI)
  // ============================================

  dspy_model_versions: defineTable({
    platform: v.string(),
    version: v.number(),
    s3Key: v.string(),
    status: v.string(),           // "active" | "inactive" | "failed"
    trainingExamples: v.number(),
    accuracy: v.number(),
    previousVersion: v.optional(v.number()),
    optimizerType: v.string(),    // "bootstrap_fewshot" | "miprov2"
    trainedAt: v.number(),
    lastCorrectionId: v.optional(v.string()),  // _id of last correction consumed — prevents re-optimizing same data
    domain: v.optional(v.string()),            // "fee_classification" | "bank_recon" — distinguishes model types
  })
    .index("by_platform_status", ["platform", "status"])
    .index("by_platform_version", ["platform", "version"]),

  dspy_optimization_logs: defineTable({
    platform: v.string(),
    optimizerType: v.string(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    status: v.string(),           // "running" | "completed" | "failed"
    beforeAccuracy: v.optional(v.number()),
    afterAccuracy: v.optional(v.number()),
    trainingExamples: v.optional(v.number()),
    testSetSize: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    modelVersionId: v.optional(v.id("dspy_model_versions")),
  })
    .index("by_platform", ["platform"])
    .index("by_status", ["status"]),


  purchase_orders: defineTable({
    businessId: v.id("businesses"),
    vendorId: v.id("vendors"),
    poNumber: v.string(),
    poDate: v.string(),                          // ISO date
    requiredDeliveryDate: v.optional(v.string()), // Expected delivery date
    status: purchaseOrderStatusValidator,

    // Embedded line items
    lineItems: v.array(v.object({
      itemCode: v.optional(v.string()),
      description: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
      totalAmount: v.number(),
      currency: v.string(),
      unitMeasurement: v.optional(v.string()),
      receivedQuantity: v.optional(v.number()),   // Cumulative received (updated from GRNs)
      invoicedQuantity: v.optional(v.number()),   // Cumulative invoiced (updated from matches)
    })),

    totalAmount: v.number(),
    currency: v.string(),
    notes: v.optional(v.string()),
    sourceDocumentId: v.optional(v.id("_storage")),
    sourceInvoiceId: v.optional(v.id("invoices")),

    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_status", ["businessId", "status"])
    .index("by_businessId_vendorId", ["businessId", "vendorId"])
    .index("by_businessId_poNumber", ["businessId", "poNumber"]),

  goods_received_notes: defineTable({
    businessId: v.id("businesses"),
    vendorId: v.id("vendors"),
    grnNumber: v.string(),
    purchaseOrderId: v.optional(v.id("purchase_orders")),
    grnDate: v.string(),                          // ISO date
    receivedBy: v.optional(v.id("users")),

    // Embedded line items
    lineItems: v.array(v.object({
      poLineItemIndex: v.optional(v.number()),
      itemCode: v.optional(v.string()),
      description: v.string(),
      quantityOrdered: v.optional(v.number()),    // From PO (for reference)
      quantityReceived: v.number(),
      quantityRejected: v.optional(v.number()),
      condition: v.optional(grnLineConditionValidator),
      notes: v.optional(v.string()),
    })),

    sourceDocumentId: v.optional(v.id("_storage")),
    sourceInvoiceId: v.optional(v.id("invoices")),
    notes: v.optional(v.string()),

    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_businessId", ["businessId"])
    .index("by_purchaseOrderId", ["purchaseOrderId"])
    .index("by_businessId_vendorId", ["businessId", "vendorId"]),

  po_matches: defineTable({
    businessId: v.id("businesses"),
    purchaseOrderId: v.id("purchase_orders"),
    accountingEntryId: v.optional(v.string()),  // Stores journalEntryId (legacy field name)  // Stores journalEntryId (legacy field name, kept for data compat)
    invoiceId: v.optional(v.id("invoices")),
    grnIds: v.optional(v.array(v.id("goods_received_notes"))),
    matchType: poMatchTypeValidator,
    status: poMatchStatusValidator,

    // Embedded line item pairings
    lineItemPairings: v.array(v.object({
      poLineIndex: v.number(),
      invoiceLineIndex: v.optional(v.number()),
      grnLineIndex: v.optional(v.number()),
      matchConfidence: v.number(),                // 0-1 confidence score
      matchMethod: matchMethodValidator,
      poQuantity: v.number(),
      grnQuantity: v.optional(v.number()),
      invoiceQuantity: v.optional(v.number()),
      poUnitPrice: v.number(),
      invoiceUnitPrice: v.optional(v.number()),
      variances: v.optional(v.array(v.object({
        type: varianceTypeValidator,
        expectedValue: v.number(),
        actualValue: v.number(),
        absoluteDifference: v.number(),
        percentageDifference: v.number(),
        exceedsTolerance: v.boolean(),
      }))),
    })),

    // Aggregated variance summary
    overallVarianceSummary: v.optional(v.object({
      totalVariances: v.number(),
      exceedsToleranceCount: v.number(),
      maxPriceVariancePercent: v.optional(v.number()),
      maxQuantityVariancePercent: v.optional(v.number()),
    })),

    reviewedBy: v.optional(v.id("users")),
    reviewNotes: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),

    // AI matching metadata (Tier 2 DSPy)
    aiMatchTier: v.optional(v.number()),              // 1 = deterministic only, 2 = AI-enhanced
    aiModelVersion: v.optional(v.string()),            // S3 key or "baseline"
    aiReasoningTrace: v.optional(v.string()),          // Human-readable reasoning from ChainOfThought
    aiVarianceDiagnosis: v.optional(v.string()),       // AI explanation of variance causes
    aiMatchedAt: v.optional(v.number()),               // Timestamp of Tier 2 AI completion
    aiConfidenceOverall: v.optional(v.number()),       // Average confidence across all AI pairings

    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_status", ["businessId", "status"])
    .index("by_purchaseOrderId", ["purchaseOrderId"])
    .index("by_invoiceId", ["invoiceId"]),

  matching_settings: defineTable({
    businessId: v.id("businesses"),
    quantityTolerancePercent: v.number(),         // Default: 10
    priceTolerancePercent: v.number(),             // Default: 5
    poNumberPrefix: v.string(),                    // Default: "PO"
    grnNumberPrefix: v.string(),                   // Default: "GRN"
    autoMatchEnabled: v.boolean(),                 // Default: true
    aiEnabled: v.optional(v.boolean()),              // Master toggle for Tier 2 AI (default true)
    aiCallsThisMonth: v.optional(v.number()),        // Counter for monthly AI call usage
    aiCallsResetAt: v.optional(v.number()),          // Timestamp of last counter reset
    // Auto-Approval Configuration (003-conditional-auto-approval)
    enableAutoApprove: v.optional(v.boolean()),
    autoApproveThreshold: v.optional(v.number()),      // 0.90-1.00, default 0.98
    minLearningCycles: v.optional(v.number()),          // 1-50, default 5
    autoApproveDisabledReason: v.optional(v.string()),  // "critical_failures_exceeded"
    autoApproveDisabledAt: v.optional(v.number()),
    updatedBy: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"]),

  // PO Match Corrections — training data for DSPy self-improving matching
  po_match_corrections: defineTable({
    businessId: v.id("businesses"),
    matchId: v.optional(v.id("po_matches")),
    vendorName: v.string(),
    originalPoLineDescription: v.string(),
    originalInvoiceLineDescription: v.string(),
    originalConfidence: v.number(),
    correctedPoLineDescription: v.string(),
    correctedInvoiceLineDescription: v.string(),
    correctionType: v.string(),                      // "rejection" | "override" | "approval"
    createdBy: v.string(),                           // Clerk user ID
    createdAt: v.number(),
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_vendor", ["businessId", "vendorName"]),

  deletion_data_exports: defineTable({
    businessId: v.id("businesses"),
    deletedUserEmail: v.string(),
    deletedUserName: v.string(),
    s3Key: v.string(),
    downloadToken: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    downloadedAt: v.optional(v.number()),
  })
    .index("by_downloadToken", ["downloadToken"])
    .index("by_businessId", ["businessId"]),

  // ============================================
  // E-INVOICE ERROR PATTERNS (self-improving monitoring)
  // ============================================

  einvoice_error_patterns: defineTable({
    // Pattern identification
    category: v.string(),                              // "captcha_blocked", "bot_blocked", "rate_limited", "form_validation", "infra_bug", "browserbase_limit", "network_error", "merchant_logic", "unknown"
    merchantDomain: v.string(),                        // "einvoice.7eleven.com.my" or "*" for cross-merchant
    errorFingerprint: v.string(),                      // Normalized error substring for dedup (e.g., "CAPTCHA", "429", "402")

    // Aggregation
    occurrenceCount: v.number(),                       // How many times this pattern has occurred
    firstSeenAt: v.number(),                           // Timestamp of first occurrence
    lastSeenAt: v.number(),                            // Timestamp of most recent occurrence
    sampleErrorMessages: v.array(v.string()),          // Up to 3 sample error messages for context
    affectedClaimIds: v.array(v.string()),             // Up to 10 recent claim IDs

    // Resolution tracking
    status: v.union(
      v.literal("new"),                                // Just detected, not yet investigated
      v.literal("investigating"),                      // Dev is looking into it
      v.literal("resolved"),                           // Fix deployed
      v.literal("wont_fix"),                           // Accepted limitation (e.g., manual-only merchant)
    ),
    resolution: v.optional(v.string()),                // How it was resolved: "marked manual-only", "fixed captcha solver", etc.
    resolvedAt: v.optional(v.number()),
    notifiedAt: v.optional(v.number()),                // When dev@hellogroot.com was emailed

    // Metadata
    lastAnalyzedLogId: v.optional(v.string()),         // Bookmark for incremental processing
  })
    .index("by_status", ["status"])
    .index("by_category_domain", ["category", "merchantDomain"])
    .index("by_fingerprint", ["errorFingerprint", "merchantDomain"]),

  // ============================================
  // DOUBLE-ENTRY ACCOUNTING (001-accounting-double-entry)
  // ============================================

  journal_entries: defineTable({
    businessId: v.id("businesses"),
    entryNumber: v.string(),                          // JE-2026-00001
    transactionDate: v.string(),                      // Date of transaction (YYYY-MM-DD)
    postingDate: v.string(),                          // Date when entry was posted
    description: v.string(),
    memo: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("posted"),
      v.literal("reversed"),
      v.literal("voided")
    ),
    sourceType: v.optional(v.union(
      v.literal("manual"),
      v.literal("sales_invoice"),
      v.literal("expense_claim"),
      v.literal("vendor_invoice"),
      v.literal("payment"),
      v.literal("ar_reconciliation"),
      v.literal("bank_reconciliation"),
      v.literal("migrated"),
      v.literal("auto_agent"),
      v.literal("auto_agent_reversal")
    )),
    sourceId: v.optional(v.string()),                 // ID of source document
    fiscalYear: v.number(),
    fiscalPeriod: v.string(),                         // 2026-01, 2026-02, etc.
    accountingPeriodId: v.optional(v.id("accounting_periods")),
    homeCurrency: v.string(),
    totalDebit: v.number(),
    totalCredit: v.number(),
    lineCount: v.number(),
    isPeriodLocked: v.boolean(),
    reversalOf: v.optional(v.id("journal_entries")),  // If this is a reversal
    reversedBy: v.optional(v.id("journal_entries")),  // If reversed
    createdBy: v.string(),
    createdAt: v.number(),
    postedBy: v.optional(v.string()),
    postedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"])
    .index("by_business_entry_number", ["businessId", "entryNumber"])
    .index("by_business_date", ["businessId", "transactionDate"])
    .index("by_business_period", ["businessId", "fiscalPeriod", "status"])
    .index("by_source", ["sourceType", "sourceId"])
    .index("by_status", ["businessId", "status"]),

  journal_entry_lines: defineTable({
    journalEntryId: v.id("journal_entries"),
    businessId: v.id("businesses"),
    lineOrder: v.number(),
    accountId: v.id("chart_of_accounts"),
    accountCode: v.string(),
    accountName: v.string(),
    accountType: v.string(),
    debitAmount: v.number(),
    creditAmount: v.number(),
    homeCurrencyAmount: v.number(),
    lineDescription: v.optional(v.string()),
    entityType: v.optional(v.union(
      v.literal("customer"),
      v.literal("vendor"),
      v.literal("employee")
    )),
    entityId: v.optional(v.string()),
    entityName: v.optional(v.string()),
    bankReconciled: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_journal_entry", ["journalEntryId"])
    .index("by_account_date", ["accountId", "createdAt"])
    .index("by_business_account", ["businessId", "accountCode"])
    .index("by_entity", ["entityType", "entityId"])
    .index("by_bank_reconciled", ["businessId", "bankReconciled"]),

  // ============================================
  // BANK RECON CORRECTIONS (DSPy Bank Recon)
  // ============================================

  bank_recon_corrections: defineTable({
    businessId: v.id("businesses"),
    bankTransactionDescription: v.string(),
    bankName: v.string(),
    originalDebitAccountCode: v.string(),
    originalCreditAccountCode: v.string(),
    correctedDebitAccountCode: v.string(),
    correctedCreditAccountCode: v.string(),
    correctionType: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_createdAt", ["businessId", "createdAt"]),

  // ============================================
  // ORDER MATCHING CORRECTIONS (DSPy AR Matching)
  // ============================================

  order_matching_corrections: defineTable({
    businessId: v.id("businesses"),
    orderReference: v.string(),
    orderCustomerName: v.string(),
    orderAmount: v.number(),
    orderDate: v.string(),
    originalSuggestedInvoiceId: v.optional(v.id("sales_invoices")),
    originalConfidence: v.optional(v.number()),
    originalReasoning: v.optional(v.string()),
    correctedInvoiceId: v.id("sales_invoices"),
    correctedInvoiceNumber: v.string(),
    correctedInvoiceCustomerName: v.string(),
    correctedInvoiceAmount: v.number(),
    correctionType: v.string(),  // "wrong_match" | "missed_match" | "false_positive" | "critical_failure"
    weight: v.optional(v.number()),
    createdBy: v.string(),
    createdAt: v.number(),
  })
    .index("by_businessId_createdAt", ["businessId", "createdAt"])
    .index("by_businessId_orderReference", ["businessId", "orderReference"]),

  // ============================================
  // BANK RECON CLASSIFICATION RULES (DSPy Bank Recon)
  // ============================================

  bank_recon_classification_rules: defineTable({
    businessId: v.id("businesses"),
    keyword: v.string(),
    debitAccountId: v.id("chart_of_accounts"),
    creditAccountId: v.id("chart_of_accounts"),
    platform: v.string(),
    priority: v.optional(v.number()),
    isActive: v.boolean(),
    createdBy: v.string(),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_businessId", ["businessId"]),

});
