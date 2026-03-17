# Implementation Plan: LHDN-Validated E-Invoice PDF Generation & Buyer Delivery

**Branch**: `001-einv-pdf-gen` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-einv-pdf-gen/spec.md`

## Summary

Most building blocks already exist from feature `022-einvoice-lhdn-buyer-flows`: delivery route, PDF template with LHDN validation block, QR code generation, buyer notification service, schema fields, and business settings. The remaining work fills visibility gaps (delivery status display), user controls (manual "Send to Buyer" button, retry), error handling (in-app failure notifications), and PDF persistence (store generated PDFs for reuse).

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, @react-pdf/renderer, AWS SES, React 19.1.2
**Storage**: Convex document DB + Convex File Storage (PDF persistence)
**Testing**: Manual UAT + `npm run build` verification
**Target Platform**: Web (Vercel deployment)
**Project Type**: Web application (Next.js + Convex)
**Performance Goals**: PDF download <5s, email delivery <10min post-validation
**Constraints**: SES attachment size limits (~10MB), Convex action timeout (10min)
**Scale/Scope**: ~100 invoices/day per business, 4 document types

## Constitution Check

*GATE: Constitution is unconfigured (template placeholders). No gates to check. Proceeding.*

## Project Structure

### Documentation (this feature)

```text
specs/001-einv-pdf-gen/
├── plan.md              # This file
├── research.md          # Phase 0: Research findings
├── data-model.md        # Phase 1: Schema changes
├── quickstart.md        # Phase 1: Dev setup guide
├── contracts/           # Phase 1: API contracts
└── tasks.md             # Phase 2: Implementation tasks
```

### Source Code (repository root)

```text
# Files to MODIFY (existing):
convex/schema.ts                                    # Add delivery status fields
convex/functions/salesInvoices.ts                    # Add delivery status mutation
convex/functions/lhdnJobs.ts                         # Add failure notification
src/app/api/v1/sales-invoices/[invoiceId]/lhdn/deliver/route.ts  # PDF storage + error tracking
src/app/[locale]/sales-invoices/[id]/page.tsx        # Send to Buyer button + delivery status
src/domains/sales-invoices/components/sales-invoice-list.tsx  # Delivery status column

# Files to CREATE:
src/domains/sales-invoices/components/lhdn-delivery-status.tsx   # Delivery status display
src/domains/sales-invoices/components/send-to-buyer-button.tsx   # Manual send button
src/app/api/v1/sales-invoices/[invoiceId]/lhdn/send-to-buyer/route.ts  # User-facing send endpoint
```

**Structure Decision**: Follows existing domain structure in `src/domains/sales-invoices/`. New components are small, focused UI pieces. New API route provides authenticated user-facing endpoint (vs existing internal-only deliver route).

## Complexity Tracking

No constitution violations — no tracking needed.
