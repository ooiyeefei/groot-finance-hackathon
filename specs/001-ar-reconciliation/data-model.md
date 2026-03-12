# Data Model: AR Reconciliation

## New Entity: Sales Order

**Table**: `sales_orders`
**Purpose**: Stores external sales transactions imported from platform statements.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| businessId | ID (businesses) | Yes | Scoping — multi-tenant |
| sourcePlatform | string | No | Metadata label: "shopee", "lazada", "grab", "pos", "manual", "unknown" |
| sourceFileName | string | Yes | Original uploaded file name |
| importBatchId | string | Yes | Groups orders from same import session (UUID) |
| orderReference | string | Yes | External order/transaction ID from platform |
| orderDate | string | Yes | ISO date string |
| customerName | string | No | Buyer name from platform |
| productName | string | No | Item/product description |
| productCode | string | No | SKU or product code |
| quantity | number | No | Item quantity |
| unitPrice | number | No | Price per unit |
| grossAmount | number | Yes | Total gross amount before fees |
| platformFee | number | No | Total platform fees/commissions |
| netAmount | number | No | Net settlement after fees |
| currency | string | Yes | Currency code (e.g., "MYR", "SGD") |
| paymentMethod | string | No | Payment method from platform |
| matchStatus | union | Yes | "unmatched" / "matched" / "partial" / "variance" / "conflict" |
| matchedInvoiceId | ID (sales_invoices) | No | Linked invoice when matched |
| matchConfidence | number | No | 0-1 score for auto-matches |
| matchMethod | union | No | "exact_reference" / "fuzzy" / "manual" |
| varianceAmount | number | No | Difference between order gross and invoice total (after fee adjustment) |
| varianceReason | string | No | Human-readable reason for variance |
| isRefund | boolean | No | True if negative amount / refund row |

### Indexes

| Index | Fields | Purpose |
|-------|--------|---------|
| by_businessId | businessId | List all orders for a business |
| by_businessId_matchStatus | businessId, matchStatus | Filter by match status |
| by_businessId_orderDate | businessId, orderDate | Period-based filtering |
| by_businessId_importBatchId | businessId, importBatchId | Group by import session |
| by_businessId_orderReference | businessId, orderReference | Duplicate detection + exact matching |

### State Transitions

```
[import] → unmatched
unmatched → matched        (auto or manual match found, within tolerance)
unmatched → variance       (auto or manual match found, outside tolerance but linked)
unmatched → partial        (multiple invoice candidates, needs resolution)
unmatched → conflict       (multiple orders claim same invoice)
matched → unmatched        (user unmatch)
variance → unmatched       (user unmatch)
partial → matched/variance (user resolves)
conflict → matched/variance (user resolves)
```

## Existing Entities Used

### Sales Invoice (read-only for matching)

**Key fields for reconciliation:**
- `invoiceNumber` — primary match key against `orderReference`
- `invoiceDate` — date comparison for fuzzy matching
- `totalAmount` — amount comparison for matching/variance
- `customerSnapshot.businessName` — secondary match signal
- `status` — only match against outstanding invoices (sent, overdue, partially_paid)
- `lineItems[].description`, `lineItems[].quantity`, `lineItems[].unitPrice` — fuzzy line-item matching

### Payments (read-only for bank reconciliation - Phase 4)

- `amount`, `paymentDate`, `paymentReference` — bank transaction matching
- `allocations[].invoiceId` — links payments to invoices

## Relationships

```
sales_orders.matchedInvoiceId → sales_invoices._id (optional, set on match)
sales_orders.businessId → businesses._id (scoping)
sales_invoices.customerId → customers._id (existing)
```
