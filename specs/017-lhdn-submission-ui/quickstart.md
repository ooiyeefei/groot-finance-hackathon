# Quickstart: LHDN MyInvois Submission UI

**Branch**: `017-lhdn-submission-ui` | **Date**: 2026-02-20

## Prerequisites

- Node.js 20.x
- Convex dev server running (`npx convex dev`)
- Schema already deployed (PR #203 — 016-e-invoice-schema-change)
- Business with `lhdnTin`, `businessRegistrationNumber`, `msicCode` populated (from #206 or manual DB seed)

## QR Code Library

Install a QR code generation library for both web rendering and PDF data URL generation:

```bash
npm install qrcode @types/qrcode
```

This library supports:
- `toDataURL()` — generates base64 data URL for `@react-pdf/renderer` Image component
- React wrapper or canvas rendering for web display

Alternative: `react-qr-code` for web-only rendering (but `qrcode` works for both web and PDF).

## Key Files to Create

| File | Purpose |
|------|---------|
| `src/domains/sales-invoices/components/lhdn-status-badge.tsx` | LHDN status badge (5 states) |
| `src/domains/sales-invoices/components/lhdn-submit-button.tsx` | Submit/resubmit with confirmation |
| `src/domains/sales-invoices/components/lhdn-validation-errors.tsx` | Error display panel |
| `src/domains/sales-invoices/components/lhdn-submission-timeline.tsx` | Visual lifecycle timeline |
| `src/domains/sales-invoices/components/lhdn-qr-code.tsx` | QR code display + data URL export |
| `src/domains/sales-invoices/components/lhdn-detail-section.tsx` | Orchestrator for detail page |

## Key Files to Modify

| File | Change |
|------|--------|
| `src/domains/sales-invoices/types/index.ts` | Add LHDN fields to SalesInvoice interface |
| `src/domains/sales-invoices/components/sales-invoice-list.tsx` | Add LHDN badge column (desktop + mobile) |
| `src/app/[locale]/sales-invoices/[id]/page.tsx` | Integrate LhdnDetailSection |
| `src/domains/sales-invoices/components/invoice-templates/pdf-document.tsx` | Add QR code to PDF |
| `src/domains/sales-invoices/hooks/use-sales-invoice-mutations.ts` | Add submitToLhdn, resubmitToLhdn |
| `convex/functions/salesInvoices.ts` | Add submitToLhdn, resubmitToLhdn mutations |

## Dev Workflow

1. Start Convex dev: `npx convex dev`
2. Start Next.js dev: `npm run dev`
3. Seed test data: Manually set `lhdnStatus` values on invoices via Convex dashboard for testing badge display
4. Test submission: Create a "sent" invoice, configure business LHDN fields, click "Submit to LHDN"

## Testing Approach

This feature is primarily UI — manual testing via the dev environment:
- Badge rendering: Set various `lhdnStatus` values via Convex dashboard
- Submit flow: Walk through confirmation dialog, loading state, success/error toasts
- Error display: Set `lhdnStatus` to "invalid" with `lhdnValidationErrors` array
- Timeline: Set various timestamp combinations
- QR code: Set `lhdnLongId` and verify QR code renders on detail page and PDF
- RBAC: Log in as different roles and verify submit button visibility
- Mobile: Resize browser to verify responsive layout
