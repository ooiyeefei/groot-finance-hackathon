# Data Model: Chat Action Cards Expansion

**Feature**: 013-chat-action-cards
**Date**: 2026-02-14

## Action Card Data Schemas

Each action card type defines a TypeScript interface for the `data` field of the `ChatAction` SSE event. The LLM emits these in ```actions``` JSON blocks.

### 1. InvoicePostingData

```typescript
interface InvoicePostingData {
  invoiceId: string                    // Convex invoice._id
  vendorName: string                   // From extractedData.vendor
  amount: number                       // From extractedData.totalAmount
  currency: string                     // From extractedData.currency
  invoiceDate: string                  // From extractedData.invoiceDate
  invoiceNumber?: string               // From extractedData.invoiceNumber
  dueDate?: string                     // From extractedData.dueDate
  confidenceScore: number              // From extractedData.confidenceScore (0-1)
  lineItems?: Array<{
    description: string
    quantity: number
    unitPrice: number
    totalAmount: number
  }>
  status: 'ready' | 'posted' | 'failed'
}
```

**Source**: `invoices` table → `extractedData` field (after OCR processing)
**Write target**: `accountingEntries.create()` mutation

### 2. CashFlowDashboardData

```typescript
interface CashFlowDashboardData {
  runwayDays: number                   // Days until cash depleted
  monthlyBurnRate: number              // Monthly burn rate
  estimatedBalance: number             // Current balance estimate
  totalIncome: number                  // Income in period
  totalExpenses: number                // Expenses in period
  expenseToIncomeRatio: number         // Ratio (0-N)
  currency: string                     // Business home currency
  forecastPeriod?: string              // e.g., "30-day forecast"
  alerts: Array<{
    type: 'low_runway' | 'expense_exceeding_income'
    severity: 'critical' | 'high' | 'medium'
    message: string
  }>
}
```

**Source**: `financialIntelligence.analyzeCashFlow` Convex query
**Write target**: None (read-only display)

### 3. ComplianceAlertData

```typescript
interface ComplianceAlertData {
  country: string                      // e.g., "Singapore", "Malaysia"
  countryCode: string                  // e.g., "SG", "MY"
  authority: string                    // e.g., "IRAS", "LHDN"
  topic: string                        // e.g., "GST Registration Requirements"
  severity: 'action_required' | 'for_information' | 'warning'
  requirements: string[]               // Bullet-point key requirements
  citationIndices: number[]            // References to SSE citation array [1, 2, 3]
  effectiveDate?: string               // When regulation takes effect
  source?: string                      // Source document name
}
```

**Source**: `searchRegulatoryKnowledgeBase` tool (RAG/Qdrant) or `analyze_cross_border_compliance` tool
**Write target**: None (read-only display, citations link to overlay)

### 4. BudgetAlertData

```typescript
interface BudgetAlertData {
  period: string                       // e.g., "February 2026"
  currency: string                     // Business home currency
  categories: Array<{
    name: string                       // Category name
    currentSpend: number               // Current month spending
    averageSpend: number               // Rolling 3-month average
    percentOfAverage: number           // currentSpend / averageSpend * 100
    status: 'on_track' | 'above_average' | 'overspending'
  }>
  totalCurrentSpend: number            // Sum of all categories
  totalAverageSpend: number            // Sum of all averages
  overallStatus: 'on_track' | 'above_average' | 'overspending'
}
```

**Source**: `get_transactions` tool (fetches 4 months, LLM aggregates by category)
**Write target**: None (read-only display)

### 5. SpendingTimeSeriesData (extends existing spending_chart)

```typescript
interface SpendingTimeSeriesData {
  chartType: 'time_series'             // Distinguishes from static spending_chart
  title: string
  currency: string
  periods: Array<{
    label: string                      // e.g., "Jan 2026"
    total: number                      // Total spend for period
    categories?: Array<{
      name: string
      amount: number
    }>
  }>
  trendPercent?: number                // Overall trend: +15 or -8
  trendDirection?: 'up' | 'down' | 'stable'
}
```

**Source**: `get_transactions` tool (multi-month data)
**Write target**: None (read-only display)

## Existing Entities (No Changes Needed)

### ChatAction (SSE Parser)

```typescript
// src/domains/chat/lib/sse-parser.ts — UNCHANGED
interface ChatAction {
  type: string          // Card type identifier
  id?: string           // Unique action ID
  data: Record<string, unknown>
}
```

### ActionCardProps (Registry)

```typescript
// src/domains/chat/components/action-cards/registry.ts — UNCHANGED
interface ActionCardProps {
  action: ChatAction
  isHistorical: boolean
  onActionComplete?: (result: { success: boolean; message?: string }) => void
}
```

## Rich Content Panel Extension

```typescript
// Addition to ChatAction — optional field for expanded view
interface ChatActionWithRichContent extends ChatAction {
  richContent?: {
    type: 'chart' | 'table' | 'dashboard'
    title: string
    data: any               // RichContentData payload
    chartType?: 'bar' | 'line' | 'pie'
  }
}
```

## State Transitions

### Invoice Posting

```
ready → (user clicks "Post") → confirming → (user confirms) → posting → posted
                                           → (user cancels)  → ready
                              → posting → (error) → failed → (retry) → posting
```

### Bulk Action

```
idle → (2+ cards rendered) → selectable → (items selected) → confirming
     → (confirm) → processing → (all done) → completed
     → (some fail) → partial_complete → (retry failed) → processing
```

## Convex Queries & Mutations Used

| Operation | Convex Function | Used By |
|-----------|----------------|---------|
| Fetch completed invoices | `invoices.getByStatus("completed")` | invoice_posting card (via LLM tool) |
| Post to accounting | `accountingEntries.create()` | invoice_posting card (client mutation) |
| Cash flow analysis | `financialIntelligence.analyzeCashFlow()` | cash_flow_dashboard card (via LLM tool) |
| Fetch transactions | `accountingEntries.searchForAI()` | budget_alert, time_series cards (via LLM tool) |
| Approve expense | `expenseSubmissions.approve()` | bulk action (existing) |
| Reject expense | `expenseSubmissions.reject()` | bulk action (existing) |
