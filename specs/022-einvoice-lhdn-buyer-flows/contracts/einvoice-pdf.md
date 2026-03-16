# Contract: Validated E-Invoice PDF with LHDN QR Code

## PDF Template Extension

**Existing file**: `src/domains/sales-invoices/components/invoice-templates/` (PDF document component)

**New conditional section** (renders only when `lhdnStatus === "valid"` and `lhdnLongId` exists):

```
┌─────────────────────────────────────────┐
│  [Existing invoice content above]       │
│                                         │
│  ─────── E-INVOICE VALIDATION ───────  │
│                                         │
│  [QR Code]   Validated by LHDN          │
│  120x120px   Document UUID: {uuid}      │
│              Validated: {timestamp}      │
│              Scan QR to verify on        │
│              MyInvois portal             │
│                                         │
└─────────────────────────────────────────┘
```

**QR code URL**: `https://myinvois.hasil.gov.my/{lhdnLongId}/share`
**QR generation**: Existing `generateLhdnQrDataUrl()` from `lhdn-qr-code.tsx`

## Auto-Delivery Trigger

**When**: Polling detects `lhdnStatus` transition to `"valid"` (in `updateSourceRecord` / `updateLhdnStatusFromPoll`)
**Condition**: Business has `einvoiceAutoDelivery !== false` (default: true) AND buyer email exists

**Flow**:
1. After status update to "valid", check business settings
2. If auto-delivery enabled: call internal API route to generate PDF + send email
3. API route: generate PDF server-side via `renderToBuffer()`, convert to base64
4. Call existing `emailService.sendInvoiceEmail()` with `pdfAttachment`
5. Update `sales_invoices`: set `lhdnPdfDeliveredAt`, `lhdnPdfDeliveredTo`

## Download Button

**Location**: Sales invoice detail page
**Condition**: `lhdnStatus === "valid"` and `lhdnLongId` exists
**Label**: "Download E-Invoice (LHDN)"
**Action**: Generate PDF client-side with LHDN validation block, trigger download
