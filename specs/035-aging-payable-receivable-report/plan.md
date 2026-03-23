# Implementation Plan: Aging Payable & Receivable Reports

**Branch**: `035-aging-payable-receivable-report` | **Date**: 2026-03-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/035-aging-payable-receivable-report/spec.md`

## Summary

Unify and polish existing AP/AR aging report infrastructure into a production feature with: (1) on-demand PDF generation from a Reports page, (2) automated monthly generation via EventBridge, (3) per-debtor/vendor individual statements with review-then-send workflow, (4) pre-generation reconciliation check using existing bank recon matching, and (5) optional AI insights via Gemini Flash-Lite. Most building blocks exist — PDF templates, aging queries, EventBridge stack, SES email, S3 storage, Action Center.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (Next.js 15.5.7, Node.js 20 Lambda, Convex 1.31.3)
**Primary Dependencies**: @react-pdf/renderer (PDF), @aws-sdk/client-ses (email), @aws-sdk/client-s3 (storage), Convex (DB + real-time), Radix UI + Tailwind CSS (UI)
**Storage**: Convex (metadata), S3 `finanseal-bucket` (PDFs at `reports/{businessId}/`), existing Action Center table
**Testing**: Manual UAT on finance.hellogroot.com
**Target Platform**: Web (Vercel) + AWS Lambda (scheduled jobs)
**Project Type**: Web application (Next.js + Convex + AWS Lambda)
**Performance Goals**: PDF generation <30s on-demand, monthly batch <5min per business
**Constraints**: Convex 2GB/month bandwidth limit (use actions not reactive queries for reports), SES sending limits, S3 storage (12-month retention)
**Scale/Scope**: ~50 businesses initially, ~10-50 debtors per business, 2 report types

## Constitution Check

*GATE: Constitution is a blank template — no project-specific gates defined. Proceeding.*

## Project Structure

### Documentation (this feature)

```text
specs/035-aging-payable-receivable-report/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
# New files
src/app/[locale]/reports/
├── page.tsx                              # Server component (Reports page)
└── statements-review/
    └── page.tsx                          # Server component (Statements Review page)

src/domains/reports/
├── components/
│   ├── reports-client.tsx                # Reports page client component
│   ├── statements-review-client.tsx      # Statements Review client component
│   ├── generate-report-dialog.tsx        # On-demand generation modal
│   ├── report-history-table.tsx          # Historical reports list
│   └── how-it-works-drawer.tsx           # Feature info drawer
├── hooks/
│   ├── use-reports.ts                    # Report generation + history hooks
│   └── use-statements.ts                # Statement review + send hooks
└── lib/
    └── types.ts                          # Report domain types

src/domains/payables/
└── components/
    └── ap-aging-report.tsx               # New AP aging interactive page (mirrors AR)

src/app/[locale]/payables/aging-report/
└── page.tsx                              # AP aging interactive page (server component)

# Modified files
src/lib/navigation/nav-items.ts           # Add "Reports" sidebar entry
src/lib/reports/report-generator.ts       # Add individual statement generation
src/lib/reports/templates/
├── debtor-statement-template.tsx         # New: individual debtor statement PDF
└── vendor-statement-template.tsx         # New: individual vendor statement PDF
src/lib/services/email-service.ts         # Add statement email with PDF attachment
convex/schema.ts                          # Add generated_reports, debtor_statements tables + report settings on businesses
convex/functions/reports.ts               # New: report CRUD, statement management, auto-send logic
convex/functions/reportGeneration.ts      # New: actions for PDF generation + S3 upload
infra/lib/scheduled-intelligence-stack.ts # Add monthly-aging-reports EventBridge rule
src/lambda/scheduled-intelligence/modules/
└── monthly-aging-reports.ts              # New: monthly report generation handler
```

**Structure Decision**: Follows existing domain-driven design pattern. Reports is a new business domain (`src/domains/reports/`) since it has its own page, navigation entry, and user workflows. Shared report generation infrastructure stays in `src/lib/reports/`. Convex functions split into queries/mutations (`reports.ts`) and actions (`reportGeneration.ts`) per bandwidth rules.
