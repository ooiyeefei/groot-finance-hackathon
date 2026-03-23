# Quickstart: Aging Payable & Receivable Reports

## Prerequisites

- Node.js 20+
- `npx convex dev` running (from main working directory only)
- AWS credentials configured (for S3 + SES)
- `.env.local` with Convex, Clerk, AWS, Gemini keys

## Development Order

### Phase 1: Schema + Core Generation (P1)
```bash
# 1. Add new tables to Convex schema
# Edit convex/schema.ts — add generated_reports, debtor_statement_sends tables
# Add reportSettings to businesses table

# 2. Deploy schema
npx convex deploy --yes

# 3. Create report functions
# convex/functions/reports.ts — queries + mutations
# convex/functions/reportGeneration.ts — actions (PDF gen + S3 upload)

# 4. Create debtor statement PDF template
# src/lib/reports/templates/debtor-statement-template.tsx

# 5. Test on-demand generation
# Verify PDF output matches spec aging buckets
```

### Phase 2: Reports Page + UI (P1-P2)
```bash
# 1. Add sidebar entry
# Edit src/lib/navigation/nav-items.ts

# 2. Create Reports page
# src/app/[locale]/reports/page.tsx (server component)
# src/domains/reports/components/reports-client.tsx

# 3. Create Statements Review page
# src/app/[locale]/reports/statements-review/page.tsx
# src/domains/reports/components/statements-review-client.tsx

# 4. Create AP aging interactive page (mirrors AR)
# src/app/[locale]/payables/aging-report/page.tsx

# 5. Verify: npm run build
```

### Phase 3: Email + Notifications (P2)
```bash
# 1. Add statement email to email service
# Edit src/lib/services/email-service.ts

# 2. Add Action Center notification creation
# In convex/functions/reportGeneration.ts

# 3. Test email sending with PDF attachment
```

### Phase 4: EventBridge Monthly Automation (P1)
```bash
# 1. Add Lambda handler module
# src/lambda/scheduled-intelligence/modules/monthly-aging-reports.ts

# 2. Add EventBridge rule to CDK
# Edit infra/lib/scheduled-intelligence-stack.ts

# 3. Deploy infrastructure
cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2

# 4. Test: manually trigger via AWS Console or CLI
```

### Phase 5: Reconciliation Check + AI Insights (P2-P3)
```bash
# 1. Implement recon check action (calls existing bank recon matching)
# 2. Implement AI insights generation (Gemini Flash-Lite)
# 3. Wire into monthly generation flow
```

### Phase 6: Auto-Send + Settings (P3)
```bash
# 1. Add report settings UI to business settings
# 2. Implement auto-send toggle per debtor
# 3. Wire auto-send into monthly generation
```

## Verification

```bash
# Build check
npm run build

# Convex deploy
npx convex deploy --yes

# CDK deploy (after EventBridge changes)
cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2

# UAT on finance.hellogroot.com
# - Generate on-demand AP/AR aging report
# - Verify PDF content and download
# - Check Action Center notification
# - Verify debtor statement email delivery
```

## Key Files Reference

| Component | Path |
|-----------|------|
| Convex schema | `convex/schema.ts` |
| Report functions | `convex/functions/reports.ts` |
| Report generation actions | `convex/functions/reportGeneration.ts` |
| PDF templates | `src/lib/reports/templates/` |
| Report generator | `src/lib/reports/report-generator.ts` |
| Aging calculations | `src/domains/sales-invoices/lib/aging-calculations.ts` |
| Email service | `src/lib/services/email-service.ts` |
| S3 utilities | `src/lib/aws-s3.ts` |
| Navigation | `src/lib/navigation/nav-items.ts` |
| EventBridge stack | `infra/lib/scheduled-intelligence-stack.ts` |
| Lambda handler | `src/lambda/scheduled-intelligence/modules/monthly-aging-reports.ts` |
