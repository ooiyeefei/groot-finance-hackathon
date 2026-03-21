# MCP Tool Contracts: CFO Copilot

## Tool 1: `forecast_cash_flow` (EXTEND existing)

**Changes**: Add `forecast_months` param, `granularity` param, AR/AP awareness.

### Input Schema (Zod)
```typescript
export const ForecastCashFlowInputSchema = z.object({
  business_id: z.string().optional(),
  horizon_days: z.number().min(1).max(365).default(30),
  forecast_months: z.number().min(1).max(12).optional(),  // NEW
  granularity: z.enum(['daily', 'monthly']).default('daily'),  // NEW
  scenario: z.enum(['conservative', 'moderate', 'optimistic']).default('moderate'),
  include_known_ar_ap: z.boolean().default(true),  // NEW
})
```

### Output Interface
```typescript
// Existing daily output preserved for backward compat
// NEW monthly output when granularity = 'monthly'
export interface MonthlyForecastOutput {
  months: MonthlyBucket[]
  summary: MonthlyForecastSummary
  risk_alerts: ForecastRiskAlert[]
  currency: string
}

export interface MonthlyBucket {
  month: string
  projected_income: number
  projected_expenses: number
  known_ar_due: number
  known_ap_due: number
  net_balance: number
  confidence: 'high' | 'medium' | 'low'
}

export interface MonthlyForecastSummary {
  current_balance: number
  runway_months: number
  scenario_used: string
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  total_known_ar: number
  total_known_ap: number
  avg_monthly_expenses: number
}

export interface ForecastRiskAlert {
  type: 'low_runway' | 'negative_balance' | 'ar_concentration'
  severity: 'critical' | 'warning' | 'info'
  month: string
  message: string
  recommendation: string
}
```

## Tool 2: `generate_report_pdf` (NEW)

### Input Schema (Zod)
```typescript
export const GenerateReportPdfInputSchema = z.object({
  business_id: z.string().optional(),
  report_type: z.enum(['board_report']).default('board_report'),
  date_range: z.object({
    start: z.string(),  // YYYY-MM-DD
    end: z.string(),
  }),
  sections: z.array(z.enum([
    'pnl', 'cash_flow', 'ar_aging', 'ap_aging', 'top_vendors', 'trends'
  ])).optional(),  // defaults to all sections
})
```

### Output Interface
```typescript
export interface GenerateReportPdfOutput {
  report_url: string
  filename: string
  sections_included: string[]
  date_range: { start: string; end: string }
  generated_at: string
  page_count: number
}
```

### Error Cases
- `INSUFFICIENT_DATA`: No transactions in date range
- `INVALID_INPUT`: Invalid date range (end before start)
- `INTERNAL_ERROR`: PDF generation or S3 upload failure

## Chat Agent Integration

### New Action Card: `forecast_card`

```typescript
// Agent emits in actions block:
{
  "type": "forecast_card",
  "id": "fc-1",
  "data": {
    "months": [
      { "month": "Apr 2026", "income": 35000, "expenses": 28000, "balance": 52000, "arDue": 5000, "apDue": 3000 },
      // ... up to 12 months
    ],
    "runwayMonths": 7,
    "riskLevel": "low",
    "currency": "MYR",
    "riskAlerts": [],
    "knownAR": 15000,
    "knownAP": 8000
  }
}
```

### Report Download Card: `report_download`

```typescript
// Agent emits after PDF generation:
{
  "type": "report_download",
  "id": "rd-1",
  "data": {
    "reportUrl": "https://cdn.hellogroot.com/reports/...",
    "filename": "Board-Report-Q1-2026.pdf",
    "reportType": "Board Report",
    "period": "Q1 2026",
    "sections": ["P&L", "Cash Flow", "AR Aging", "AP Aging", "Top Vendors", "Trends"],
    "generatedAt": "2026-03-21T09:30:00Z"
  }
}
```

### Tax Reference: Uses existing `compliance_alert` card

No new card needed — tax reference results rendered via existing `compliance_alert` action card with `severity: 'for_information'`.
