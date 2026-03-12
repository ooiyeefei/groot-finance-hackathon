# Data Model: AP 3-Way Matching

**Branch**: `021-ap-3-way` | **Date**: 2026-03-11

## New Tables

### purchase_orders

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| businessId | id("businesses") | Yes | Owning business |
| vendorId | id("vendors") | Yes | Linked vendor |
| poNumber | string | Yes | Human-readable PO number (e.g., PO-2026-001) |
| poDate | string | Yes | ISO date of PO creation |
| requiredDeliveryDate | string | No | Expected delivery date |
| status | union literal | Yes | draft / issued / partially_received / fully_received / invoiced / closed / cancelled |
| lineItems | array | Yes | Embedded line items (see below) |
| totalAmount | number | Yes | Sum of line item totals |
| currency | string | Yes | PO currency code |
| notes | string | No | Free-text notes |
| sourceDocumentId | id("_storage") | No | Uploaded PO document (OCR source) |
| sourceInvoiceId | id("invoices") | No | Link to invoices table entry if created from OCR |
| createdBy | id("users") | Yes | User who created the PO |
| createdAt | number | Yes | Unix timestamp |
| updatedAt | number | No | Last update timestamp |

**Line item structure** (embedded array):
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| itemCode | string | No | SKU or item code |
| description | string | Yes | Item description |
| quantity | number | Yes | Ordered quantity |
| unitPrice | number | Yes | Price per unit |
| totalAmount | number | Yes | quantity * unitPrice |
| currency | string | Yes | Line item currency |
| unitMeasurement | string | No | e.g., pcs, kg, box |
| receivedQuantity | number | No | Cumulative received (updated from GRNs) |
| invoicedQuantity | number | No | Cumulative invoiced (updated from matches) |

**Indexes**:
- `by_businessId` — list all POs for a business
- `by_businessId_status` — filter by status
- `by_businessId_vendorId` — filter by vendor
- `by_businessId_poNumber` — lookup by PO number (unique within business)

### goods_received_notes

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| businessId | id("businesses") | Yes | Owning business |
| vendorId | id("vendors") | Yes | Linked vendor |
| grnNumber | string | Yes | Human-readable GRN number |
| purchaseOrderId | id("purchase_orders") | No | Linked PO (optional for ad-hoc) |
| grnDate | string | Yes | ISO date of goods receipt |
| receivedBy | id("users") | No | Person who received goods |
| lineItems | array | Yes | Embedded line items (see below) |
| sourceDocumentId | id("_storage") | No | Uploaded delivery note |
| sourceInvoiceId | id("invoices") | No | Link to invoices table if created from OCR |
| notes | string | No | General notes |
| createdBy | id("users") | Yes | User who created the GRN |
| createdAt | number | Yes | Unix timestamp |

**Line item structure** (embedded array):
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| poLineItemIndex | number | No | Index into PO lineItems array |
| itemCode | string | No | SKU or item code |
| description | string | Yes | Item description |
| quantityOrdered | number | No | From PO (for reference) |
| quantityReceived | number | Yes | Actually received |
| quantityRejected | number | No | Rejected count |
| condition | union literal | No | good / damaged / rejected |
| notes | string | No | Line-level notes |

**Indexes**:
- `by_businessId` — list all GRNs
- `by_purchaseOrderId` — find GRNs for a PO
- `by_businessId_vendorId` — filter by vendor

### po_matches

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| businessId | id("businesses") | Yes | Owning business |
| purchaseOrderId | id("purchase_orders") | Yes | Linked PO |
| accountingEntryId | id("accounting_entries") | No | Linked payable (set after approval) |
| invoiceId | id("invoices") | No | Source invoice document |
| grnIds | array of id("goods_received_notes") | No | Linked GRNs |
| matchType | union literal | Yes | two_way / three_way |
| status | union literal | Yes | auto_approved / pending_review / approved / disputed / on_hold |
| lineItemPairings | array | Yes | Embedded pairings (see below) |
| overallVarianceSummary | object | No | Aggregated variance info |
| reviewedBy | id("users") | No | Reviewer |
| reviewNotes | string | No | Reviewer notes |
| reviewedAt | number | No | Review timestamp |
| createdAt | number | Yes | When match was created |
| updatedAt | number | No | Last update |

**Line item pairing structure** (embedded array):
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| poLineIndex | number | Yes | Index in PO lineItems |
| invoiceLineIndex | number | No | Index in invoice lineItems |
| grnLineIndex | number | No | Index in GRN lineItems |
| matchConfidence | number | Yes | 0-1 confidence score |
| matchMethod | union literal | Yes | exact_code / fuzzy_description / amount_fallback / manual |
| poQuantity | number | Yes | Quantity from PO |
| grnQuantity | number | No | Quantity from GRN |
| invoiceQuantity | number | No | Quantity from invoice |
| poUnitPrice | number | Yes | Unit price from PO |
| invoiceUnitPrice | number | No | Unit price from invoice |
| variances | array | No | Detected variances for this pairing |

**Variance structure** (nested in pairing):
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | union literal | Yes | quantity_over_invoiced / quantity_under_invoiced / price_higher / price_lower / over_received / missing_grn |
| expectedValue | number | Yes | Value from PO |
| actualValue | number | Yes | Value from invoice or GRN |
| absoluteDifference | number | Yes | |actual - expected| |
| percentageDifference | number | Yes | % difference |
| exceedsTolerance | boolean | Yes | Whether this exceeds configured threshold |

**Indexes**:
- `by_businessId` — list all matches
- `by_businessId_status` — filter by match status
- `by_purchaseOrderId` — find matches for a PO
- `by_invoiceId` — find match for an invoice (if linked via invoiceId)

### matching_settings

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| businessId | id("businesses") | Yes | One per business |
| quantityTolerancePercent | number | Yes | Default: 10 (±10%) |
| priceTolerancePercent | number | Yes | Default: 5 (±5%) |
| poNumberPrefix | string | Yes | Default: "PO" |
| grnNumberPrefix | string | Yes | Default: "GRN" |
| autoMatchEnabled | boolean | Yes | Default: true |
| updatedAt | number | No | Last update |

**Indexes**:
- `by_businessId` — lookup settings (unique per business)

## Modified Tables

### accounting_entries (existing)

**New fields**:
| Field | Type | Description |
|-------|------|-------------|
| purchaseOrderId | id("purchase_orders") | No | Link to matched PO |
| matchId | id("po_matches") | No | Link to match record |
| matchGated | boolean | No | True if this payable requires match approval |

### invoices (existing — no schema change needed)

The `extractedData` field already stores `purchase_order_ref` as part of `InvoiceSpecificData`. No schema change required; the auto-match engine reads this field.

## State Transitions

### Purchase Order Lifecycle
```
draft → issued → partially_received → fully_received → invoiced → closed
  ↓                                                       ↓
  cancelled                                            cancelled
```
- `draft → issued`: User action (manual)
- `issued → partially_received`: Auto (when first GRN recorded, received < ordered)
- `partially_received → fully_received`: Auto (when cumulative received = ordered)
- `fully_received → invoiced`: Auto (when match approved and payable created)
- `invoiced → closed`: Auto (when payable is fully paid)
- Any → `cancelled`: User action (if no matches exist, or with confirmation if matches exist)

### Match Status Lifecycle
```
auto_approved ←── (within tolerance)
                    ↑
created ───── variance check
                    ↓
pending_review ──→ approved (admin/manager)
       ↓              ↓
   on_hold         disputed
       ↓
  pending_review (after investigation)
```

## Relationships

```
business
  ├── vendors
  │     ├── purchase_orders (1:many)
  │     ├── goods_received_notes (1:many)
  │     └── accounting_entries (1:many, existing)
  │
  ├── purchase_orders
  │     ├── goods_received_notes (1:many, via purchaseOrderId)
  │     └── po_matches (1:many)
  │
  ├── po_matches
  │     ├── purchase_order (many:1)
  │     ├── accounting_entry (1:1, optional — set on approval)
  │     ├── goods_received_notes (many:many, via grnIds array)
  │     └── invoice (many:1, optional — via invoiceId)
  │
  └── matching_settings (1:1)
```
