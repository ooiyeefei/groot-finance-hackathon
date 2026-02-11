# API Route Contracts: Sales Invoice Generation

**Feature**: 009-sales-invoice-generation
**Date**: 2026-02-09

## Overview

Most data operations use Convex queries/mutations directly from the client (real-time subscriptions via `useQuery`, mutations via `useMutation`). API routes are only needed for operations that require server-side capabilities:

1. **Email sending** — requires AWS SES credentials (server-side only)
2. **Logo upload** — file handling with Convex file storage
3. **PDF generation trigger** — optional server-side PDF if client-side proves insufficient

---

## API Routes

### `POST /api/v1/sales-invoices/[invoiceId]/send-email`

Send an invoice email to the customer with PDF attachment.

**Request**:
```typescript
{
  invoiceId: string,
  businessId: string,
  recipientEmail: string,          // Customer email
  subject?: string,                // Custom email subject (default: "Invoice {number} from {company}")
  message?: string,                // Custom email body text
  ccEmails?: string[],             // CC recipients
}
```

**Response**:
```typescript
// 200 OK
{
  success: true,
  messageId: string,               // Email provider message ID
  sentAt: string,                  // ISO timestamp
}

// 400 Bad Request
{ error: "Invoice not found" | "Invoice not in sendable state" | "Invalid email" }

// 403 Forbidden
{ error: "Not authorized" }

// 500 Internal Server Error
{ error: "Email delivery failed", details: string }
```

**Auth**: Clerk session + finance admin role check
**Side effects**: Updates invoice `sentAt` timestamp via Convex mutation

---

### `POST /api/v1/sales-invoices/logo-upload`

Upload a company logo for invoice branding.

**Request**: `multipart/form-data`
```
businessId: string
file: File (image/png, image/jpeg, image/svg+xml — max 2MB)
```

**Response**:
```typescript
// 200 OK
{
  success: true,
  storageId: string,              // Convex file storage ID
  url: string,                    // Public URL for display
}

// 400 Bad Request
{ error: "File too large" | "Invalid file type" | "No file provided" }

// 403 Forbidden
{ error: "Not authorized" }
```

**Auth**: Clerk session + finance admin role check
**Side effects**: Stores file in Convex file storage, updates `businesses.invoiceSettings.logoStorageId`

---

### `GET /api/v1/sales-invoices/[invoiceId]/pdf`

Generate and return a PDF of the invoice (server-side fallback).

**Note**: Primary PDF generation is client-side via `html2pdf.js`. This endpoint exists as a fallback for email attachments and programmatic access.

**Request**: Query params
```
businessId: string
```

**Response**:
```typescript
// 200 OK
Content-Type: application/pdf
Content-Disposition: attachment; filename="INV-2026-001.pdf"
Body: <PDF binary>

// 404 Not Found
{ error: "Invoice not found" }

// 403 Forbidden
{ error: "Not authorized" }
```

**Auth**: Clerk session + business membership check

---

## Convex Scheduled Functions (Cron Jobs)

### Daily Overdue Check

```typescript
// convex/crons.ts
crons.daily(
  "mark-overdue-invoices",
  { hourUTC: 0, minuteUTC: 0 },  // Midnight UTC daily
  internal.functions.salesInvoices.markOverdue,
)
```

### Daily Recurring Invoice Generation

```typescript
crons.daily(
  "generate-recurring-invoices",
  { hourUTC: 1, minuteUTC: 0 },  // 1 AM UTC daily
  internal.functions.salesInvoices.generateDueInvoices,
)
```
