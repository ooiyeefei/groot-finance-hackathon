# Contract: E-Invoice Compliance Dashboard

## Convex Query: getEinvoiceAnalytics

**Input**:
```typescript
{
  businessId: Id<"businesses">
  dateFrom?: number  // timestamp, optional
  dateTo?: number    // timestamp, optional
}
```

**Output**:
```typescript
{
  totalSubmitted: number
  validated: number
  rejected: number
  cancelled: number
  invalid: number
  pending: number
  avgValidationTimeMs: number | null
  complianceScore: number  // 0-100, submitted / total eligible
  totalEligible: number    // invoices with status sent/paid/overdue
  monthlyBreakdown: Array<{
    month: string  // "2026-03"
    submitted: number
    validated: number
    rejected: number
    cancelled: number
    invalid: number
  }>
  topErrors: Array<{
    code: string
    message: string
    count: number
  }>
  recentActivity: Array<{
    invoiceNumber: string
    event: string  // "validated", "rejected", "submitted", "failed"
    timestamp: number
    details?: string
  }>
}
```

## UI Component: einvoice-dashboard.tsx

**Location**: Embedded as tab in sales invoices page
**Tab label**: "E-Invoice Compliance"

**Layout**:
1. **Metric cards row**: Total Submitted, Validation Rate %, Rejection Rate %, Compliance Score %
2. **Charts row**: Monthly volume bar chart + Status breakdown donut chart
3. **Top Errors table**: Code | Message | Count
4. **Recent Activity feed**: Last 20 status changes
5. **Export button**: CSV download

## CSV Export

**Fields**: Invoice Number, Date, Amount, Currency, LHDN Status, Document UUID, Submitted At, Validated At, Errors
**Trigger**: "Export CSV" button
**Method**: Client-side generation from query results (no API route needed)

## Date Range Filter

- Presets: "This Month", "Last 3 Months", "Last 6 Months", "All Time"
- Custom: Date picker for from/to
- Default: "Last 3 Months"
