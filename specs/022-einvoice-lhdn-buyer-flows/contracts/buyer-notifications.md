# Contract: Buyer Email Notifications

## Notification Events

| Event | Trigger | Email Subject Template |
|-------|---------|----------------------|
| Validation | `lhdnStatus` → `"valid"` | "E-Invoice {number} from {business} — Validated by LHDN" |
| Cancellation | Issuer cancels via our system | "E-Invoice {number} from {business} — Cancelled" |
| Rejection Confirmed | Buyer's rejection detected by polling | "E-Invoice {number} — Your Rejection Confirmed" |

## Email Content Structure

All buyer emails include:
- Invoice number and date
- Business name (issuer)
- Amount and currency
- LHDN Document UUID
- Link to MyInvois portal: `https://myinvois.hasil.gov.my/{longId}/share`
- Event-specific details (reason for cancellation/rejection)
- Footer: "This is an automated notification from {businessName} via Groot Finance."

## Service: buyer-notification-service.ts

```typescript
interface BuyerNotificationParams {
  event: "validated" | "cancelled" | "rejection_confirmed"
  buyerEmail: string
  buyerName?: string
  invoiceNumber: string
  businessName: string
  amount: number
  currency: string
  lhdnDocumentUuid: string
  lhdnLongId: string
  reason?: string  // for cancellation/rejection
  pdfAttachment?: { content: string; filename: string }  // for validation event
}

async function sendBuyerNotification(params: BuyerNotificationParams): Promise<{
  success: boolean
  messageId?: string
  error?: string
}>
```

## Trigger Points

1. **On validation** (in status polling result handler): Send validation email + PDF if auto-delivery enabled
2. **On cancellation** (in cancel API route, after LHDN confirms): Send cancellation email
3. **On rejection detection** (in status polling, when issued invoice rejected): Send rejection confirmation to buyer

## Business Settings

- `einvoiceBuyerNotifications`: boolean (default: true)
- Checked before sending any buyer email
- Per-business, set in business settings UI
