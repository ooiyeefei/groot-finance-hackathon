# Data Model: AI Performance Widget

## Existing Tables Used (Read-Only)

No new tables are created. All metrics are derived from existing tables.

### sales_orders (AR Matching + Fee Classification)

**AI matching fields**:
- `aiMatchTier`: number (1 = rule-based, 2 = DSPy AI)
- `aiMatchStatus`: string ("pending_review" | "approved" | "auto_approved" | "corrected" | "rejected")
- `aiMatchSuggestions`: array of `{ invoiceId, confidence, reasoning }`
- `matchMethod`: string ("exact_match" | "fuzzy_ai" | "manual" | "groot_ai_agent")
- `matchConfidence`: number (0-1)

**Fee classification fields** (nested in `classifiedFees` array):
- `classifiedFees[].tier`: number (1 = rules, 2 = AI)
- `classifiedFees[].confidence`: number (0-1)
- `classifiedFees[].feeName`: string
- `classifiedFees[].accountCode`: string

**Indexes used**: `by_businessId`

### bank_transactions (Bank Reconciliation)

- `classificationTier`: number (1 = rules, 2 = AI)
- `classificationConfidence`: number (0-1)
- `classificationMethod`: string
- `classificationSource`: string
- `suggestedDebitAccountCode`: string (presence indicates classified)
- `confirmedAt`: number (timestamp — presence indicates user-accepted)

**Indexes used**: `by_businessId`

### order_matching_corrections (AR Corrections)

- `correctionType`: string ("rejected_match" | "manual_match" | "corrected_customer")
- `weight`: number (1 = normal, 5 = critical failure)
- `createdAt`: number (timestamp)

**Indexes used**: `by_businessId_createdAt`

### bank_recon_corrections (Bank Corrections)

- `correctionType`: string
- `createdAt`: number (timestamp)

**Indexes used**: `by_businessId`

### fee_classification_corrections (Fee Corrections)

- `correctionType`: string
- `createdAt`: number (timestamp)

**Indexes used**: `by_businessId`

### matching_settings (Auto-Approval Config)

- `enableAutoApprove`: boolean
- `autoApproveThreshold`: number (0-1)
- `minLearningCycles`: number

**Indexes used**: `by_businessId`

## Derived Data Shape (Query Output)

```typescript
interface AIPerformanceMetrics {
  // Core metrics (percentages displayed as 0-100)
  overallConfidence: number;       // Volume-weighted avg confidence across all features
  editRate: number;                // corrections / total AI decisions
  noEditRate: number;              // 1 - editRate
  automationRate: number;          // auto-approved / total eligible
  missingFieldsRate: number;       // OCR fields missing / total fields

  // Hero metric
  totalAiDecisions: number;        // All AI decisions in period
  decisionsRequiringReview: number; // Human-reviewed decisions
  estimatedHoursSaved: number;     // (decisions * manual_time - reviewed * review_time) / 3600

  // Donut chart segments
  distribution: {
    noEdit: number;     // Count of accepted-as-is decisions
    edited: number;     // Count of corrected decisions
    missing: number;    // Count of missing field instances
  };

  // Feature breakdown
  featureBreakdown: {
    ar: { total: number; confidence: number; corrections: number };
    bank: { total: number; confidence: number; corrections: number };
    fee: { total: number; confidence: number; corrections: number };
  };

  // Trend comparison (null if no previous period)
  trends: {
    confidenceDelta: number | null;    // Current - previous (percentage points)
    editRateDelta: number | null;
    automationRateDelta: number | null;
    hoursSavedDelta: number | null;
  } | null;

  // Metadata
  periodLabel: string;             // "This Month", "Last 3 Months", "All Time"
  isEmpty: boolean;                // true if zero AI decisions in period
}
```

## State Transitions

N/A — This feature is read-only aggregation. No state changes to existing records.

## Relationships

```
sales_orders ──< order_matching_corrections    (1:N, via businessId + orderId)
sales_orders ──< classifiedFees[]              (embedded array, no separate table)
bank_transactions ──< bank_recon_corrections   (1:N, via businessId)
sales_orders.classifiedFees ──< fee_classification_corrections (1:N, via businessId)
matching_settings ──1 business                  (1:1, auto-approval config)
```
