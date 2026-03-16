# Implementation Plan: LHDN E-Invoice Buyer Flows

**Branch**: `022-einvoice-lhdn-buyer-flows` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/022-einvoice-lhdn-buyer-flows/spec.md`

## Summary

Close 5 gaps in our LHDN e-invoice integration identified by competitor analysis (Remicle): (1) poll for status changes on issued invoices within the 72-hour LHDN window to detect buyer rejections/cancellations, (2) allow users to reject received e-invoices via LHDN API, (3) generate validated e-invoice PDFs with LHDN QR codes and auto-deliver to buyers, (4) send buyer email notifications on lifecycle events, (5) build an e-invoice compliance dashboard. All five build on existing infrastructure — LHDN client, polling Lambda, SES email, PDF renderer, Convex subscriptions.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, @react-pdf/renderer, AWS SDK (Lambda invocation, SES), qrcode (npm)
**Storage**: Convex (document database with real-time subscriptions), AWS S3 (via CloudFront for signed URLs)
**Testing**: `npm run build` (type-check + build), manual UAT against LHDN sandbox
**Target Platform**: Web application (Vercel deployment)
**Project Type**: Web (Next.js + Convex + AWS Lambda)
**Performance Goals**: Status change detection within 10 minutes, dashboard loads < 3s for 10k invoices
**Constraints**: LHDN API rate limits (300 RPM status queries, 12 RPM reject/cancel), 72-hour rejection window, existing SES domain reputation
**Scale/Scope**: ~5-50 active invoices per business within 72-hour window, ~100 businesses polling concurrently

## Constitution Check

*GATE: No constitution defined — no gates to evaluate.*

## Project Structure

### Documentation (this feature)

```text
specs/022-einvoice-lhdn-buyer-flows/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── status-polling.md
│   ├── buyer-rejection.md
│   ├── einvoice-pdf.md
│   ├── buyer-notifications.md
│   └── compliance-dashboard.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
# Existing files to modify:
src/lib/lhdn/client.ts                                    # Add rejectDocument(), getDocumentDetails()
src/lib/lhdn/types.ts                                     # Add rejected status, new types
src/lib/lhdn/constants.ts                                 # Add rejection-related constants
src/lambda/lhdn-polling/handler.ts                         # Add issued-document status polling pass
convex/schema.ts                                           # Extend sales_invoices, einvoice_received_documents, businesses
convex/functions/salesInvoices.ts                          # Add status polling mutations, dashboard query
convex/functions/lhdnJobs.ts                               # Extend polling scheduler for 72-hour window
convex/functions/notifications.ts                          # Add buyer rejection notification types
src/domains/sales-invoices/components/invoice-templates/    # Embed LHDN QR block in PDF
src/domains/sales-invoices/hooks/use-invoice-pdf.ts        # Extend for LHDN-validated variant
src/app/api/v1/sales-invoices/[invoiceId]/send-email/route.ts  # Reuse for auto-delivery

# New files:
src/app/api/v1/einvoice-received/[uuid]/reject/route.ts   # Buyer rejection API route
src/app/api/v1/sales-invoices/[invoiceId]/lhdn/status/route.ts  # Manual status refresh
src/app/api/v1/sales-invoices/einvoice-analytics/route.ts  # Dashboard data API (if needed)
src/domains/sales-invoices/components/einvoice-dashboard.tsx  # Compliance dashboard tab
src/domains/sales-invoices/components/einvoice-reject-dialog.tsx  # Rejection dialog
src/lib/services/buyer-notification-service.ts             # Buyer email notification logic
convex/functions/einvoiceReceivedDocuments.ts               # Rejection mutations (if not in system.ts)
```

**Structure Decision**: All changes follow existing domain-driven architecture. Status polling extends the existing Lambda. Buyer rejection gets a new API route. PDF/email reuses existing infrastructure. Dashboard is a new component embedded as a tab.
