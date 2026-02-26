# Implementation Plan: LHDN e-Invoice Flow 2 — Expense Claim E-Invoice Retrieval

**Branch**: `019-lhdn-einv-flow-2` | **Date**: 2026-02-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/019-lhdn-einv-flow-2/spec.md`

## Summary

Add buyer-side e-invoice retrieval to expense claims. When employees upload receipts, the system (1) detects merchant QR codes from receipt images, (2) auto-fills buyer-info forms via an AI browser agent (Stagehand + Browserbase), and (3) matches received LHDN e-invoices back to expense claims through dual channels — a system email inbox for fast deterministic matching and LHDN polling for authoritative compliance records.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (Next.js + Convex), Python 3.11 (Lambda)
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, @browserbasehq/stagehand, pyzbar (Python), AWS SES
**Storage**: Convex (document database), AWS S3 (file storage), SES S3 (email storage)
**Testing**: Manual testing with LHDN sandbox, receipt image samples, merchant form URLs
**Target Platform**: Web (desktop + mobile responsive)
**Project Type**: Web application (Next.js + Convex + AWS Lambda)
**Performance Goals**: QR detection <5s per image, form fill <60s, LHDN matching <24h
**Constraints**: Browserbase free tier (1 concurrent session), LHDN API rate limits (60 RPM), SES receiving (us-east-1 only)
**Scale/Scope**: ~100 expense claims/month per business initially, growing to ~1000

## Constitution Check

*GATE: No project-specific constitution defined. Using CLAUDE.md guidelines as governance.*

| Gate | Status | Notes |
|------|--------|-------|
| Build must pass | PASS | `npm run build` required before completion |
| Convex deploy required | PASS | `npx convex deploy --yes` after schema/function changes |
| AWS CDK for infra | PASS | Email receiving stack via CDK |
| No new files without approval | ACKNOWLEDGED | New files listed in quickstart.md |
| Semantic design tokens | PASS | UI components will use existing design system |
| Git author `grootdev-ai` | PASS | All commits use `grootdev-ai` identity |

## Project Structure

### Documentation (this feature)

```text
specs/019-lhdn-einv-flow-2/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file
├── research.md          # Phase 0: Technology decisions & patterns
├── data-model.md        # Phase 1: Schema extensions & new tables
├── quickstart.md        # Phase 1: Implementation guide
├── contracts/
│   └── api-contracts.md # Phase 1: API endpoints & Convex functions
├── checklists/
│   └── requirements.md  # Spec quality checklist (all passing)
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
# Schema & Database
convex/
├── schema.ts                          # MODIFY: Add e-invoice fields + new tables
├── crons.ts                           # MODIFY: Add LHDN polling cron
└── functions/
    ├── expenseClaims.ts               # MODIFY: Add e-invoice queries/mutations
    ├── einvoiceJobs.ts                # CREATE: Polling, email processing, form-fill actions
    └── einvoiceReceivedDocuments.ts   # CREATE: Received documents CRUD

# Python Lambda (QR Detection)
src/lambda/document-processor-python/
├── handler.py                         # MODIFY: Add QR detection step
├── requirements.txt                   # MODIFY: Add pyzbar
├── Dockerfile                         # MODIFY: Add libzbar0
└── steps/
    └── detect_qr.py                   # CREATE: QR detection logic

# Next.js API Routes
src/app/api/v1/expense-claims/[id]/
├── request-einvoice/route.ts          # CREATE: Trigger AI agent
├── upload-einvoice/route.ts           # CREATE: Manual upload
└── resolve-match/route.ts             # CREATE: Resolve ambiguous match

# UI Components
src/domains/expense-claims/components/
├── einvoice-status-badge.tsx          # CREATE: List view badge
├── einvoice-section.tsx               # CREATE: Detail view section
├── einvoice-match-review.tsx          # CREATE: Match review UI
├── submission-detail-page.tsx         # MODIFY: Add e-invoice section
└── personal-expense-dashboard.tsx     # MODIFY: Add badge to cards

# AWS Infrastructure
infra/lib/
├── email-receiving-stack.ts           # CREATE: SES receiving + Lambda
└── document-processing-stack.ts       # MODIFY: Add libzbar0 to Docker
```

**Structure Decision**: Follows existing codebase patterns — domain components in `src/domains/expense-claims/`, Convex functions in `convex/functions/`, API routes in `src/app/api/v1/`, infrastructure in `infra/lib/`.

## Complexity Tracking

| Decision | Why Needed | Simpler Alternative Rejected Because |
|----------|------------|-------------------------------------|
| New `einvoice_received_documents` table | Need to track ALL received LHDN docs (matched + unmatched) for audit and retry matching | Storing only on expense_claims loses unmatched documents and prevents re-matching |
| New `einvoice_request_logs` table | Need audit trail of AI agent attempts for debugging and analytics | Storing on expense_claims would lose history of failed attempts |
| Dual-channel retrieval (email + LHDN) | Email is fast + deterministic; LHDN is authoritative. Together they provide best UX + compliance | Single-channel LHDN polling would mean 15+ minute delay for all matches |
| AWS SES receiving (new infra) | Need to receive emails programmatically. SES is already in the stack for sending | Gmail API adds Google Workspace dependency and OAuth complexity |
