# Convex Function Contracts

## convex/functions/reports.ts

### Queries

```typescript
// List generated reports for a business
query listReports({
  businessId: v.string(),
  reportType?: v.optional(v.union(v.literal("ap_aging"), v.literal("ar_aging"))),
  periodMonth?: v.optional(v.string()), // YYYY-MM
  limit?: v.optional(v.number()),
}) → GeneratedReport[]

// List debtor statement sends for a period
query listStatementSends({
  businessId: v.string(),
  periodMonth: v.string(), // YYYY-MM
  sendStatus?: v.optional(v.union(v.literal("pending"), v.literal("sent"), v.literal("auto_sent"), v.literal("failed"), v.literal("no_email"))),
}) → DebtorStatementSend[]

// Get report settings for a business
query getReportSettings({
  businessId: v.string(),
}) → ReportSettings | null
```

### Mutations

```typescript
// Create a generated report record
internalMutation createReport({
  businessId: v.string(),
  reportType: v.string(),
  reportScope: v.string(),
  asOfDate: v.string(),
  periodMonth: v.string(),
  generationMethod: v.string(),
  generatedBy: v.string(),
  s3Key: v.string(),
  s3Bucket: v.string(),
  fileSizeBytes?: v.optional(v.number()),
  entityId?: v.optional(v.string()),
  entityName?: v.optional(v.string()),
  totalOutstanding: v.number(),
  currency: v.string(),
  hasWarnings: v.boolean(),
  aiInsightsSummary?: v.optional(v.string()),
}) → Id<"generated_reports">

// Create a debtor statement send record
internalMutation createStatementSend({
  businessId: v.string(),
  reportId: v.string(),
  customerId: v.string(),
  customerName: v.string(),
  customerEmail?: v.optional(v.string()),
  totalOutstanding: v.number(),
  invoiceCount: v.number(),
  sendStatus: v.string(),
  periodMonth: v.string(),
  hasDisclaimer: v.boolean(),
  autoSendEnabled: v.boolean(),
}) → Id<"debtor_statement_sends">

// Update statement send status (after email sent)
mutation updateStatementStatus({
  statementId: v.string(),
  sendStatus: v.string(),
  sentAt?: v.optional(v.number()),
  emailDeliveryStatus?: v.optional(v.string()),
}) → void

// Update report settings for a business
mutation updateReportSettings({
  businessId: v.string(),
  autoGenerateMonthly?: v.optional(v.boolean()),
  autoSendGlobal?: v.optional(v.boolean()),
  autoSendDebtors?: v.optional(v.array(v.string())),
  notifyEmail?: v.optional(v.boolean()),
}) → void

// Delete expired reports (12-month retention cleanup)
internalMutation deleteExpiredReports({
  before: v.number(), // timestamp
}) → { deleted: number }
```

## convex/functions/reportGeneration.ts

### Actions

```typescript
// Generate consolidated aging report (AP or AR)
action generateAgingReport({
  businessId: v.string(),
  reportType: v.union(v.literal("ap_aging"), v.literal("ar_aging")),
  asOfDate: v.string(), // YYYY-MM-DD
  generatedBy: v.string(), // userId or "system"
}) → { reportId: string, downloadUrl: string }

// Generate all individual debtor statements for a business
action generateDebtorStatements({
  businessId: v.string(),
  asOfDate: v.string(),
  hasWarnings: v.boolean(),
}) → { statementCount: number, reportIds: string[] }

// Send debtor statement emails (batch)
action sendStatementEmails({
  businessId: v.string(),
  statementIds: v.array(v.string()),
}) → { sent: number, failed: number }

// Run pre-generation reconciliation check
action checkUnreconciledTransactions({
  businessId: v.string(),
}) → { matchCount: number, matches: ReconMatch[] }

// Generate AI insights for consolidated report
action generateAiInsights({
  businessId: v.string(),
  reportType: v.string(),
  agingData: v.any(), // aging bucket data
}) → { insights: string } | null

// Full monthly generation orchestration
action runMonthlyReportGeneration({
  businessId: v.string(),
}) → { reportsGenerated: number, statementsPending: number, autoSent: number }

// Get presigned download URL for a report
action getReportDownloadUrl({
  reportId: v.string(),
}) → { url: string }
```

## Lambda Handler

### src/lambda/scheduled-intelligence/modules/monthly-aging-reports.ts

```typescript
// EventBridge handler — iterates all active businesses and triggers report generation
export async function handler(event: ScheduledEvent): Promise<void>
// 1. Query Convex for all active businesses with autoGenerateMonthly enabled
// 2. For each business:
//    a. Call checkUnreconciledTransactions
//    b. If matches found and no auto-skip: create Action Center notification, set 48h timer
//    c. If no matches or past timeout: call runMonthlyReportGeneration
//    d. Send owner notification email
// 3. Handle errors per-business (don't let one failure block others)
```
