# Data Model: LHDN E-Invoice PDF Delivery

## Schema Changes

### `sales_invoices` table (EXTEND)

New fields to add:

```
lhdnPdfStorageId    optional(id("_storage"))    Reference to stored LHDN-validated PDF
lhdnPdfDeliveryStatus  optional(string)         "pending" | "delivered" | "failed"
lhdnPdfDeliveryError   optional(string)         Error message when delivery fails
```

Existing fields (already in schema, no changes needed):
- `lhdnPdfDeliveredAt` — timestamp of successful delivery
- `lhdnPdfDeliveredTo` — buyer email address
- `lhdnStatus` — LHDN validation status
- `lhdnLongId` — LHDN long identifier for QR code
- `lhdnDocumentUuid` — LHDN document UUID
- `lhdnValidatedAt` — validation timestamp

### `businesses` table (NO CHANGES)

Existing fields sufficient:
- `einvoiceAutoDelivery` — boolean toggle for auto-send
- `einvoiceBuyerNotifications` — boolean toggle for buyer notifications

### State Transitions

```
Invoice validated by LHDN
  → lhdnPdfDeliveryStatus = "pending" (if autoDelivery ON)
  → PDF generated + stored → lhdnPdfStorageId set
  → Email sent successfully → status = "delivered", deliveredAt/To set
  → Email fails → status = "failed", deliveryError set, notification created
  → User clicks "Send to Buyer" → resets to "pending", attempts delivery
  → Delivery succeeds → status = "delivered"
```
