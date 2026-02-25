# Implementation Plan: LHDN e-Invoice Submission Pipeline

**Branch**: `001-lhdn-einvoice-submission` | **Date**: 2026-02-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-lhdn-einvoice-submission/spec.md`

## Summary

Build the LHDN MyInvois e-invoice submission pipeline for FinanSEAL, operating as an intermediary (hybrid model). The pipeline handles two flows sharing the same infrastructure: (1) sales invoice submission to LHDN, and (2) self-billed e-invoice generation from expense claims and AP/vendor invoices for exempt vendor purchases. The approach mirrors the existing Peppol/Storecove integration pattern — dedicated library module, typed API client, data mapper, Convex mutations, and Next.js API routes.

## Technical Context

**Language/Version**: TypeScript 5.9.3 / Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, AWS SDK (Lambda invocation), Clerk 6.30.0, Zod 3.23.8, qrcode (npm)
**Storage**: Convex (document database), AWS SSM Parameter Store (credentials)
**Testing**: LHDN sandbox environment (`preprod-api.myinvois.hasil.gov.my`)
**Target Platform**: Vercel (Next.js) + Convex Cloud + AWS Lambda (signing)
**Project Type**: Web application (Next.js + Convex)
**Performance Goals**: Submission queued in < 2s, validation result within 5 min (typical), 30 min (worst case)
**Constraints**: LHDN rate limits (12 RPM token, 100 RPM submit, 300 RPM poll), 300KB per document, 100 docs per batch
**Scale/Scope**: 100 e-invoices/month (Starter plan), unlimited (Pro/Enterprise)

## Constitution Check

*GATE: Constitution template is not populated for this project. Proceeding without gates.*

No project-specific constitution defined. Following CLAUDE.md rules as the governing constraints:
- Build must pass (`npm run build`)
- Convex must be deployed (`npx convex deploy --yes`) after schema/function changes
- Git author: `grootdev-ai` / `dev@hellogroot.com`
- Use semantic design tokens for UI
- Follow existing patterns (Peppol flow as reference)
- IAM: Lambda invocation via existing Vercel OIDC role

## Project Structure

### Documentation (this feature)

```text
specs/001-lhdn-einvoice-submission/
├── plan.md              # This file
├── spec.md              # Feature specification (complete)
├── research.md          # Phase 0 research decisions
├── data-model.md        # Schema changes and entity relationships
├── quickstart.md        # Build sequence and setup guide
├── contracts/
│   └── api-contracts.md # API route and mutation contracts
└── checklists/
    └── requirements.md  # Spec quality validation checklist
```

### Source Code (repository root)

```text
src/lib/lhdn/                          # NEW — LHDN library module
├── client.ts                           # LHDN MyInvois API client
├── invoice-mapper.ts                   # Sales invoice → UBL 2.1 JSON
├── self-bill-mapper.ts                 # Expense/AP → self-billed UBL 2.1 JSON
├── types.ts                            # API request/response types
├── decimal.ts                          # LHDN decimal formatting
└── constants.ts                        # Document type codes, TIN constants

src/app/api/v1/
├── sales-invoices/
│   ├── [invoiceId]/lhdn/
│   │   ├── submit/route.ts             # NEW — single invoice submission
│   │   └── cancel/route.ts             # NEW — cancel validated e-invoice
│   └── batch/lhdn/submit/route.ts      # NEW — batch submission
├── expense-claims/
│   └── [claimId]/lhdn/
│       └── self-bill/route.ts          # NEW — self-bill from expense claim
└── invoices/
    └── [invoiceId]/lhdn/
        └── self-bill/route.ts          # NEW — self-bill from AP invoice

convex/functions/
├── lhdnTokens.ts                       # NEW — token cache
├── lhdnJobs.ts                         # NEW — submission jobs + polling
├── salesInvoices.ts                     # MODIFIED — add LHDN mutations
├── expenseClaims.ts                     # MODIFIED — add self-bill mutation
├── invoices.ts                          # MODIFIED — add self-bill mutation
└── notifications.ts                     # MODIFIED — add LHDN notification types

convex/schema.ts                         # MODIFIED — new tables + new fields

src/domains/sales-invoices/components/
├── lhdn-submit-button.tsx               # MODIFIED — wire up real submission
└── (existing components already deployed: lhdn-status-badge, lhdn-qr-code, etc.)

src/domains/expense-claims/components/
└── self-bill-prompt.tsx                  # NEW — self-billing suggestion UI

src/domains/account-management/components/
└── business-profile-settings.tsx         # MODIFIED — add auto-trigger setting
```

**Structure Decision**: Follows existing domain-driven structure. New LHDN library module mirrors `src/lib/peppol/` pattern. API routes follow existing `[invoiceId]/peppol/transmit` convention. Convex functions added alongside existing ones.

## Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Spec | `specs/001-lhdn-einvoice-submission/spec.md` | Complete |
| Research | `specs/001-lhdn-einvoice-submission/research.md` | Complete |
| Data Model | `specs/001-lhdn-einvoice-submission/data-model.md` | Complete |
| API Contracts | `specs/001-lhdn-einvoice-submission/contracts/api-contracts.md` | Complete |
| Quickstart | `specs/001-lhdn-einvoice-submission/quickstart.md` | Complete |
| Tasks | `specs/001-lhdn-einvoice-submission/tasks.md` | Complete |
