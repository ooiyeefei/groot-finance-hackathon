# Data Model: Smart Vendor Intelligence

**Date**: 2026-03-16
**Feature**: 001-smart-vendor-intelligence
**Database**: Convex (document database with real-time subscriptions)

## Overview

This document defines the Convex schema for 6 new tables that implement the Smart Vendor Intelligence feature. All tables follow multi-tenant isolation pattern (businessId field) and use Convex's type-safe schema definition.

---

## Table 1: vendor_price_history

**Purpose**: Stores every observation of an item's price from a vendor invoice. Builds timeline for price tracking and anomaly detection.

**Entity Reference**: Price History Record (from spec.md Key Entities)

**Schema**:
```typescript
vendor_price_history: defineTable({
  // Identification
  businessId: v.id("businesses"),          // Multi-tenant isolation
  vendorId: v.id("vendors"),                // Vendor reference
  invoiceId: v.id("invoices"),              // Source invoice
  itemIdentifier: v.string(),               // Unique ID within vendor (code or description hash)
  itemCode: v.optional(v.string()),         // Item code from invoice (if present)
  itemDescription: v.string(),              // Item description from invoice

  // Pricing
  unitPrice: v.number(),                    // Price per unit
  quantity: v.number(),                     // Quantity purchased
  currency: v.string(),                     // Currency code (MYR, USD, etc.)

  // Timestamps
  invoiceDate: v.string(),                  // Date from invoice (YYYY-MM-DD format, no timezone)
  observationTimestamp: v.number(),         // When record was created (ms since epoch)

  // Matching & Confirmation
  matchConfidenceScore: v.optional(v.number()), // 0-100, for fuzzy-matched items
  userConfirmedFlag: v.boolean(),           // True if user confirmed fuzzy match
  matchedFromItemCode: v.boolean(),         // True if matched via item code (primary key)

  // Archival (2-year retention policy)
  archivedFlag: v.boolean(),                // True if >2 years old
  archivedTimestamp: v.optional(v.number()), // When archived

  // Cross-vendor grouping (optional)
  itemGroupId: v.optional(v.id("cross_vendor_item_groups")), // Link to cross-vendor group
})
.index("by_business_vendor", ["businessId", "vendorId", "archivedFlag", "invoiceDate"])
.index("by_business_item", ["businessId", "itemIdentifier", "archivedFlag", "invoiceDate"])
.index("by_archived_status", ["businessId", "archivedFlag", "invoiceDate"])
.index("by_item_group", ["itemGroupId"])
.index("by_invoice", ["invoiceId"])
```

**Validation Rules**:
- `unitPrice > 0` (enforced in mutation)
- `quantity > 0` (enforced in mutation)
- `matchConfidenceScore` in range [0, 100] if present (enforced in mutation)
- `invoiceDate` format: YYYY-MM-DD (enforced in mutation)
- `currency` in ISO 4217 format (3-letter code) (enforced in mutation)

**Indexes Rationale**:
- `by_business_vendor`: Query price history for a specific vendor (most common use case)
- `by_business_item`: Query price history for a specific item across all vendors
- `by_archived_status`: Efficiently exclude archived records in queries
- `by_item_group`: Fetch all price records for a cross-vendor group
- `by_invoice`: Reverse lookup: given invoice, find all price records

**Retention Policy**:
- Active data: `archivedFlag = false` (included in queries by default)
- Archived data: `archivedFlag = true`, `archivedTimestamp` set (excluded unless `includeArchived: true`)
- Archived after: 2 years from `invoiceDate`
- Never deleted (audit compliance)

---

## Table 2: vendor_price_anomalies

**Purpose**: Stores detected price anomalies and billing pattern changes. Powers alert UI and recommended actions.

**Entity Reference**: Price Anomaly Alert (from spec.md Key Entities)

**Schema**:
```typescript
vendor_price_anomalies: defineTable({
  // Identification
  businessId: v.id("businesses"),          // Multi-tenant isolation
  vendorId: v.id("vendors"),                // Vendor reference
  itemIdentifier: v.optional(v.string()),   // For price changes; null for frequency changes

  // Anomaly Details
  alertType: v.union(
    v.literal("per-invoice"),               // >10% from last invoice
    v.literal("trailing-average"),          // >20% from 6-month avg
    v.literal("new-item"),                  // Item not in historical data
    v.literal("frequency-change")           // Billing pattern changed ≥50%
  ),
  oldValue: v.number(),                     // Previous price or frequency
  newValue: v.number(),                     // Current price or frequency
  percentageChange: v.number(),             // Calculated change percentage
  severityLevel: v.union(
    v.literal("standard"),                  // Standard alert (10-20%)
    v.literal("high-impact")                // High-impact (>20% trailing avg)
  ),

  // Context (for frequency changes)
  potentialIndicators: v.optional(v.array(v.union(
    v.literal("cash-flow-issues"),
    v.literal("billing-errors"),
    v.literal("contract-violations")
  ))),

  // Status & Feedback
  status: v.union(
    v.literal("active"),                    // Not dismissed
    v.literal("dismissed")                  // User dismissed
  ),
  createdTimestamp: v.number(),             // When anomaly detected
  dismissedTimestamp: v.optional(v.number()), // When user dismissed
  userFeedback: v.optional(v.string()),     // Optional feedback when dismissing

  // References
  priceHistoryId: v.optional(v.id("vendor_price_history")), // Source price record
  invoiceId: v.optional(v.id("invoices")),  // Source invoice
})
.index("by_business_vendor_status", ["businessId", "vendorId", "status", "createdTimestamp"])
.index("by_business_severity", ["businessId", "severityLevel", "status", "createdTimestamp"])
.index("by_created_date", ["businessId", "createdTimestamp"])
```

**Validation Rules**:
- `alertType` must be one of 4 defined literals (enforced by Convex union type)
- `severityLevel` must be "standard" or "high-impact" (enforced by Convex union type)
- `percentageChange` required for price anomalies (enforced in mutation)
- `itemIdentifier` required for price changes, null for frequency changes (enforced in mutation)
- `dismissedTimestamp` set only when `status = "dismissed"` (enforced in mutation)

**Indexes Rationale**:
- `by_business_vendor_status`: Query active alerts for a vendor (alerts page)
- `by_business_severity`: Query high-impact alerts across all vendors (Action Center)
- `by_created_date`: Chronological listing, AI Digest email aggregation

**Business Logic**:
- **Dismissal**: User clicks "Dismiss" → mutation sets `status = "dismissed"`, `dismissedTimestamp = now`, optionally records `userFeedback`
- **Learning loop**: Dismissed alerts with `userFeedback` feed into DSPy MIPROv2 training (false positive examples)
- **Auto-dismiss**: Anomalies older than 90 days auto-dismiss (reduce alert fatigue)

---

## Table 3: vendor_scorecards

**Purpose**: Pre-calculated vendor performance metrics. Updated via scheduled cron (nightly) and on-demand.

**Entity Reference**: Vendor Scorecard (from spec.md Key Entities)

**Schema**:
```typescript
vendor_scorecards: defineTable({
  // Identification
  businessId: v.id("businesses"),          // Multi-tenant isolation
  vendorId: v.id("vendors"),                // Vendor reference

  // Financial Metrics
  totalSpendYTD: v.number(),                // Sum of paid invoices (current fiscal year)
  invoiceVolume: v.number(),                // Count of invoices (current fiscal year)

  // Operational Metrics
  averagePaymentCycle: v.number(),          // Mean days (invoice date → payment date)

  // AI & Quality Metrics
  priceStabilityScore: v.number(),          // 0-100 (100 = most stable, based on coefficient of variation)
  aiExtractionAccuracy: v.number(),         // 0-100 (average per-field confidence from invoices)
  anomalyFlagsCount: v.number(),            // Count of active anomaly alerts

  // Timestamps
  lastUpdatedTimestamp: v.number(),         // When scorecard was last calculated
  fiscalYearStart: v.string(),              // Fiscal year boundary (YYYY-MM-DD)
})
.index("by_business_vendor", ["businessId", "vendorId"])
.index("by_business_last_updated", ["businessId", "lastUpdatedTimestamp"])
```

**Validation Rules**:
- `totalSpendYTD >= 0` (enforced in mutation)
- `invoiceVolume >= 0` (enforced in mutation)
- `averagePaymentCycle >= 0` (enforced in mutation)
- `priceStabilityScore` in range [0, 100] (enforced in mutation)
- `aiExtractionAccuracy` in range [0, 100] (enforced in mutation)
- `anomalyFlagsCount >= 0` (enforced in mutation)

**Indexes Rationale**:
- `by_business_vendor`: Direct lookup for vendor detail page (most common)
- `by_business_last_updated`: Find stale scorecards for re-calculation (cron job)

**Calculation Logic**:
```typescript
// Nightly cron job or on-demand API call
async function calculateVendorScorecard(ctx, businessId, vendorId) {
  const fiscalYearStart = getFiscalYearStart(businessId); // From business settings

  // 1. Total Spend YTD
  const paidInvoices = await ctx.db
    .query("invoices")
    .withIndex("by_vendor_payment_status", q =>
      q.eq("vendorId", vendorId).eq("paymentStatus", "paid")
    )
    .filter(q => q.gte(q.field("invoiceDate"), fiscalYearStart))
    .collect();
  const totalSpendYTD = paidInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);

  // 2. Invoice Volume
  const invoiceVolume = paidInvoices.length;

  // 3. Average Payment Cycle
  const paymentCycles = paidInvoices
    .filter(inv => inv.paymentDate) // Only paid invoices
    .map(inv => daysBetween(inv.invoiceDate, inv.paymentDate));
  const averagePaymentCycle = mean(paymentCycles);

  // 4. Price Stability Score (coefficient of variation)
  const priceHistory = await ctx.db
    .query("vendor_price_history")
    .withIndex("by_business_vendor", q =>
      q.eq("businessId", businessId).eq("vendorId", vendorId).eq("archivedFlag", false)
    )
    .collect();
  const priceVariance = calculateCoefficientOfVariation(priceHistory.map(p => p.unitPrice));
  const priceStabilityScore = 100 - Math.min(priceVariance, 100); // Inverse scale

  // 5. AI Extraction Accuracy
  const invoicesWithConfidence = await ctx.db
    .query("invoices")
    .withIndex("by_vendor", q => q.eq("vendorId", vendorId))
    .filter(q => q.isDefined(q.field("aiFieldConfidence")))
    .collect();
  const avgConfidence = mean(
    invoicesWithConfidence.flatMap(inv => Object.values(inv.aiFieldConfidence))
  );
  const aiExtractionAccuracy = avgConfidence * 100; // Convert 0-1 to 0-100

  // 6. Anomaly Flags Count
  const activeAnomalies = await ctx.db
    .query("vendor_price_anomalies")
    .withIndex("by_business_vendor_status", q =>
      q.eq("businessId", businessId).eq("vendorId", vendorId).eq("status", "active")
    )
    .collect();
  const anomalyFlagsCount = activeAnomalies.length;

  return {
    totalSpendYTD,
    invoiceVolume,
    averagePaymentCycle,
    priceStabilityScore,
    aiExtractionAccuracy,
    anomalyFlagsCount,
    lastUpdatedTimestamp: Date.now(),
    fiscalYearStart,
  };
}
```

---

## Table 4: vendor_risk_profiles

**Purpose**: Calculated risk scores for vendor analysis. Updated weekly via cron.

**Entity Reference**: Vendor Risk Profile (from spec.md Key Entities)

**Schema**:
```typescript
vendor_risk_profiles: defineTable({
  // Identification
  businessId: v.id("businesses"),          // Multi-tenant isolation
  vendorId: v.id("vendors"),                // Vendor reference

  // Risk Scores (0-100, where 100 = high risk)
  paymentRiskScore: v.number(),             // Based on invoice quality (missing fields, low confidence)
  concentrationRiskScore: v.number(),       // Based on % of total AP spend
  complianceRiskScore: v.number(),          // Based on missing TIN, e-invoice compliance
  priceRiskScore: v.number(),               // Based on price variance (inverse of stability)

  // Overall Risk Level
  riskLevel: v.union(
    v.literal("low"),                       // All scores <30
    v.literal("medium"),                    // Any score 30-70
    v.literal("high")                       // Any score >70
  ),

  // Timestamps
  lastCalculatedTimestamp: v.number(),      // When risk profile was last calculated
})
.index("by_business_vendor", ["businessId", "vendorId"])
.index("by_business_risk_level", ["businessId", "riskLevel", "lastCalculatedTimestamp"])
```

**Validation Rules**:
- All risk scores in range [0, 100] (enforced in mutation)
- `riskLevel` derived from risk scores (enforced in mutation logic)

**Indexes Rationale**:
- `by_business_vendor`: Direct lookup for vendor detail page
- `by_business_risk_level`: Query high-risk vendors for dashboard

**Calculation Logic**:
```typescript
async function calculateVendorRiskProfile(ctx, businessId, vendorId) {
  // 1. Payment Risk (invoice quality)
  const invoices = await getVendorInvoices(ctx, vendorId);
  const missingFieldsCount = invoices.filter(inv =>
    !inv.vendorTIN || !inv.invoiceNumber || !inv.totalAmount
  ).length;
  const lowConfidenceCount = invoices.filter(inv =>
    inv.aiFieldConfidence && mean(Object.values(inv.aiFieldConfidence)) < 0.7
  ).length;
  const paymentRiskScore = (missingFieldsCount + lowConfidenceCount) / invoices.length * 100;

  // 2. Concentration Risk (% of total spend)
  const vendorSpend = await getTotalSpend(ctx, vendorId);
  const totalAPSpend = await getTotalAPSpend(ctx, businessId);
  const concentrationPercent = (vendorSpend / totalAPSpend) * 100;
  const concentrationRiskScore = Math.min(concentrationPercent * 3, 100); // >30% → high risk

  // 3. Compliance Risk (TIN, e-invoice)
  const vendor = await ctx.db.get(vendorId);
  let complianceRiskScore = 0;
  if (!vendor.taxId) complianceRiskScore += 50;
  if (!vendor.eInvoiceCompliant) complianceRiskScore += 50;

  // 4. Price Risk (variance)
  const priceHistory = await ctx.db
    .query("vendor_price_history")
    .withIndex("by_business_vendor", q =>
      q.eq("businessId", businessId).eq("vendorId", vendorId).eq("archivedFlag", false)
    )
    .collect();
  const priceVariance = calculateCoefficientOfVariation(priceHistory.map(p => p.unitPrice));
  const priceRiskScore = Math.min(priceVariance, 100); // High variance = high risk

  // 5. Overall Risk Level
  const maxScore = Math.max(
    paymentRiskScore,
    concentrationRiskScore,
    complianceRiskScore,
    priceRiskScore
  );
  const riskLevel = maxScore > 70 ? "high" : maxScore > 30 ? "medium" : "low";

  return {
    paymentRiskScore,
    concentrationRiskScore,
    complianceRiskScore,
    priceRiskScore,
    riskLevel,
    lastCalculatedTimestamp: Date.now(),
  };
}
```

---

## Table 5: cross_vendor_item_groups

**Purpose**: Groups equivalent items from different vendors for cross-vendor price comparison.

**Entity Reference**: Cross-Vendor Item Group (from spec.md Key Entities)

**Schema**:
```typescript
cross_vendor_item_groups: defineTable({
  // Identification
  businessId: v.id("businesses"),          // Multi-tenant isolation
  groupId: v.id("cross_vendor_item_groups"), // Auto-generated by Convex
  groupName: v.string(),                    // User-defined or auto-generated (e.g., "M8 Bolt")

  // Group Members
  itemReferences: v.array(v.object({
    vendorId: v.id("vendors"),
    itemIdentifier: v.string(),             // From vendor_price_history
  })),

  // Matching Metadata
  matchSource: v.union(
    v.literal("ai-suggested"),              // DSPy suggested this grouping
    v.literal("user-confirmed"),            // User confirmed AI suggestion
    v.literal("user-created")               // User manually created group
  ),

  // Timestamps
  createdTimestamp: v.number(),             // When group was created
  lastUpdatedTimestamp: v.number(),         // When group was last modified
})
.index("by_business", ["businessId", "createdTimestamp"])
.index("by_match_source", ["businessId", "matchSource"])
```

**Validation Rules**:
- `itemReferences.length >= 2` (enforced in mutation - at least 2 vendors for comparison)
- `groupName.length > 0` (enforced in mutation)
- Unique item per vendor (no duplicate vendorId in itemReferences) (enforced in mutation)

**Indexes Rationale**:
- `by_business`: List all groups for price comparison dashboard
- `by_match_source`: Filter AI-suggested groups for user review

**Workflow**:
1. **AI Suggestion**: DSPy identifies similar items → create group with `matchSource: "ai-suggested"`
2. **User Confirmation**: User reviews suggestion → update `matchSource: "user-confirmed"` + link price records (`itemGroupId`)
3. **User Rejection**: User rejects → delete group, log rejection (prevent re-suggesting)
4. **Manual Creation**: User manually creates group → `matchSource: "user-created"`

---

## Table 6: vendor_recommended_actions

**Purpose**: AI-generated recommended actions for addressing vendor anomalies.

**Entity Reference**: Recommended Action (from spec.md Key Entities)

**Schema**:
```typescript
vendor_recommended_actions: defineTable({
  // Identification
  businessId: v.id("businesses"),          // Multi-tenant isolation
  vendorId: v.id("vendors"),                // Vendor reference
  anomalyAlertId: v.id("vendor_price_anomalies"), // Triggering anomaly

  // Action Details
  actionType: v.union(
    v.literal("request-quotes"),            // Request quotes from alternative vendors
    v.literal("negotiate"),                 // Negotiate pricing with vendor
    v.literal("review-contract")            // Review contract terms
  ),
  actionDescription: v.string(),            // Human-readable description
  priorityLevel: v.union(
    v.literal("low"),
    v.literal("medium"),
    v.literal("high")
  ),

  // Status
  status: v.union(
    v.literal("pending"),                   // Not acted upon
    v.literal("completed"),                 // User marked complete
    v.literal("dismissed")                  // User dismissed action
  ),

  // Timestamps
  createdTimestamp: v.number(),             // When action was created
  completedTimestamp: v.optional(v.number()), // When user completed
  dismissedTimestamp: v.optional(v.number()), // When user dismissed
})
.index("by_business_vendor_status", ["businessId", "vendorId", "status", "createdTimestamp"])
.index("by_anomaly_alert", ["anomalyAlertId"])
```

**Validation Rules**:
- `actionDescription.length > 0` (enforced in mutation)
- `completedTimestamp` set only when `status = "completed"` (enforced in mutation)
- `dismissedTimestamp` set only when `status = "dismissed"` (enforced in mutation)

**Indexes Rationale**:
- `by_business_vendor_status`: Query pending actions for vendor (vendor detail page)
- `by_anomaly_alert`: Reverse lookup: given anomaly, find associated actions

**Generation Logic**:
```typescript
async function generateRecommendedActions(ctx, anomaly: VendorPriceAnomaly) {
  if (anomaly.severityLevel === "high-impact" && anomaly.alertType === "trailing-average") {
    // High-impact price increase → multiple actions
    return [
      {
        actionType: "request-quotes",
        actionDescription: `Request quotes from alternative vendors for ${anomaly.itemDescription}`,
        priorityLevel: "high",
      },
      {
        actionType: "negotiate",
        actionDescription: `Negotiate pricing with ${anomaly.vendorName} — prices increased ${anomaly.percentageChange}% over 6 months`,
        priorityLevel: "medium",
      },
    ];
  } else if (anomaly.alertType === "frequency-change") {
    // Billing pattern change → review contract
    return [
      {
        actionType: "review-contract",
        actionDescription: `Review contract terms — ${anomaly.vendorName} changed billing frequency by ${anomaly.percentageChange}%`,
        priorityLevel: "medium",
      },
    ];
  }
  return [];
}
```

---

## Schema Deployment

**File**: `convex/schema.ts`

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ... existing tables ...

  // NEW: Smart Vendor Intelligence tables
  vendor_price_history: defineTable({
    businessId: v.id("businesses"),
    vendorId: v.id("vendors"),
    invoiceId: v.id("invoices"),
    itemIdentifier: v.string(),
    itemCode: v.optional(v.string()),
    itemDescription: v.string(),
    unitPrice: v.number(),
    quantity: v.number(),
    currency: v.string(),
    invoiceDate: v.string(),
    observationTimestamp: v.number(),
    matchConfidenceScore: v.optional(v.number()),
    userConfirmedFlag: v.boolean(),
    matchedFromItemCode: v.boolean(),
    archivedFlag: v.boolean(),
    archivedTimestamp: v.optional(v.number()),
    itemGroupId: v.optional(v.id("cross_vendor_item_groups")),
  })
  .index("by_business_vendor", ["businessId", "vendorId", "archivedFlag", "invoiceDate"])
  .index("by_business_item", ["businessId", "itemIdentifier", "archivedFlag", "invoiceDate"])
  .index("by_archived_status", ["businessId", "archivedFlag", "invoiceDate"])
  .index("by_item_group", ["itemGroupId"])
  .index("by_invoice", ["invoiceId"]),

  vendor_price_anomalies: defineTable({
    businessId: v.id("businesses"),
    vendorId: v.id("vendors"),
    itemIdentifier: v.optional(v.string()),
    alertType: v.union(
      v.literal("per-invoice"),
      v.literal("trailing-average"),
      v.literal("new-item"),
      v.literal("frequency-change")
    ),
    oldValue: v.number(),
    newValue: v.number(),
    percentageChange: v.number(),
    severityLevel: v.union(v.literal("standard"), v.literal("high-impact")),
    potentialIndicators: v.optional(v.array(v.union(
      v.literal("cash-flow-issues"),
      v.literal("billing-errors"),
      v.literal("contract-violations")
    ))),
    status: v.union(v.literal("active"), v.literal("dismissed")),
    createdTimestamp: v.number(),
    dismissedTimestamp: v.optional(v.number()),
    userFeedback: v.optional(v.string()),
    priceHistoryId: v.optional(v.id("vendor_price_history")),
    invoiceId: v.optional(v.id("invoices")),
  })
  .index("by_business_vendor_status", ["businessId", "vendorId", "status", "createdTimestamp"])
  .index("by_business_severity", ["businessId", "severityLevel", "status", "createdTimestamp"])
  .index("by_created_date", ["businessId", "createdTimestamp"]),

  vendor_scorecards: defineTable({
    businessId: v.id("businesses"),
    vendorId: v.id("vendors"),
    totalSpendYTD: v.number(),
    invoiceVolume: v.number(),
    averagePaymentCycle: v.number(),
    priceStabilityScore: v.number(),
    aiExtractionAccuracy: v.number(),
    anomalyFlagsCount: v.number(),
    lastUpdatedTimestamp: v.number(),
    fiscalYearStart: v.string(),
  })
  .index("by_business_vendor", ["businessId", "vendorId"])
  .index("by_business_last_updated", ["businessId", "lastUpdatedTimestamp"]),

  vendor_risk_profiles: defineTable({
    businessId: v.id("businesses"),
    vendorId: v.id("vendors"),
    paymentRiskScore: v.number(),
    concentrationRiskScore: v.number(),
    complianceRiskScore: v.number(),
    priceRiskScore: v.number(),
    riskLevel: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    lastCalculatedTimestamp: v.number(),
  })
  .index("by_business_vendor", ["businessId", "vendorId"])
  .index("by_business_risk_level", ["businessId", "riskLevel", "lastCalculatedTimestamp"]),

  cross_vendor_item_groups: defineTable({
    businessId: v.id("businesses"),
    groupId: v.id("cross_vendor_item_groups"),
    groupName: v.string(),
    itemReferences: v.array(v.object({
      vendorId: v.id("vendors"),
      itemIdentifier: v.string(),
    })),
    matchSource: v.union(
      v.literal("ai-suggested"),
      v.literal("user-confirmed"),
      v.literal("user-created")
    ),
    createdTimestamp: v.number(),
    lastUpdatedTimestamp: v.number(),
  })
  .index("by_business", ["businessId", "createdTimestamp"])
  .index("by_match_source", ["businessId", "matchSource"]),

  vendor_recommended_actions: defineTable({
    businessId: v.id("businesses"),
    vendorId: v.id("vendors"),
    anomalyAlertId: v.id("vendor_price_anomalies"),
    actionType: v.union(
      v.literal("request-quotes"),
      v.literal("negotiate"),
      v.literal("review-contract")
    ),
    actionDescription: v.string(),
    priorityLevel: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    status: v.union(v.literal("pending"), v.literal("completed"), v.literal("dismissed")),
    createdTimestamp: v.number(),
    completedTimestamp: v.optional(v.number()),
    dismissedTimestamp: v.optional(v.number()),
  })
  .index("by_business_vendor_status", ["businessId", "vendorId", "status", "createdTimestamp"])
  .index("by_anomaly_alert", ["anomalyAlertId"]),
});
```

**Deployment Command**:
```bash
npx convex deploy --yes
```

**Validation**: After deployment, verify in Convex dashboard:
- All 6 tables created
- Indexes created (check "Indexes" tab)
- No schema validation errors

---

## Migration Strategy

**Phase 1**: Deploy empty schema (no data migration needed - new feature)
**Phase 2**: Backfill price history from existing invoices (optional, see below)

**Backfill Script** (optional - populate historical data):
```typescript
// convex/functions/migrations/backfillPriceHistory.ts
export default internalMutation({
  handler: async (ctx) => {
    const invoices = await ctx.db.query("invoices").collect();

    for (const invoice of invoices) {
      if (!invoice.lineItems || invoice.lineItems.length === 0) continue;

      for (const lineItem of invoice.lineItems) {
        await ctx.db.insert("vendor_price_history", {
          businessId: invoice.businessId,
          vendorId: invoice.vendorId,
          invoiceId: invoice._id,
          itemIdentifier: lineItem.itemCode || hashDescription(lineItem.description),
          itemCode: lineItem.itemCode,
          itemDescription: lineItem.description,
          unitPrice: lineItem.unitPrice,
          quantity: lineItem.quantity,
          currency: invoice.currency,
          invoiceDate: invoice.invoiceDate,
          observationTimestamp: invoice.createdAt || Date.now(),
          userConfirmedFlag: false,
          matchedFromItemCode: !!lineItem.itemCode,
          archivedFlag: isOlderThanTwoYears(invoice.invoiceDate),
          archivedTimestamp: isOlderThanTwoYears(invoice.invoiceDate) ? Date.now() : undefined,
        });
      }
    }
  },
});
```

**Note**: Backfill is optional. Feature works without historical data (starts tracking from deployment forward). If historical analysis desired, run backfill once after schema deployment.

---

## Summary

✅ 6 new tables defined with type-safe Convex schema
✅ Multi-tenant isolation via `businessId` field
✅ Optimized indexes for query performance
✅ Validation rules documented
✅ Calculation logic specified
✅ Migration strategy defined
✅ Ready for implementation
