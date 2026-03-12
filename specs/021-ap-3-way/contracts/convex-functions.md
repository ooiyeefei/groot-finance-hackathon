# Convex Function Contracts: AP 3-Way Matching

**Branch**: `021-ap-3-way` | **Date**: 2026-03-11

## Purchase Order Functions

### `purchaseOrders.create` (mutation)
```typescript
Args: {
  vendorId: Id<"vendors">
  poDate: string           // ISO date
  requiredDeliveryDate?: string
  lineItems: Array<{
    itemCode?: string
    description: string
    quantity: number
    unitPrice: number
    currency: string
    unitMeasurement?: string
  }>
  currency: string
  notes?: string
  sourceDocumentId?: Id<"_storage">
  sourceInvoiceId?: Id<"invoices">
}
Returns: Id<"purchase_orders">
Auth: Authenticated user with business membership
```

### `purchaseOrders.update` (mutation)
```typescript
// Only draft POs are editable
Args: {
  poId: Id<"purchase_orders">
  vendorId?: Id<"vendors">
  poDate?: string
  requiredDeliveryDate?: string
  lineItems?: Array<{...}>  // same as create
  currency?: string
  notes?: string
}
Returns: void
Auth: Authenticated user, PO must be in "draft" status
Error: Throws if PO status is not "draft"
```

### `purchaseOrders.updateStatus` (mutation)
```typescript
Args: {
  poId: Id<"purchase_orders">
  status: "issued" | "cancelled"
}
Returns: void
Auth: Admin or manager role
Validation:
  - "issued": only from "draft"
  - "cancelled": from any status except "closed"; warns if matches exist
```

### `purchaseOrders.list` (query)
```typescript
Args: {
  businessId: Id<"businesses">
  status?: PurchaseOrderStatus
  vendorId?: Id<"vendors">
  dateFrom?: string
  dateTo?: string
  search?: string  // PO number search
}
Returns: Array<PurchaseOrder & { vendorName: string }>
Auth: Authenticated user with business membership
```

### `purchaseOrders.get` (query)
```typescript
Args: { poId: Id<"purchase_orders"> }
Returns: PurchaseOrder & { vendor: Vendor, grns: GRN[], matches: PoMatch[] }
Auth: Authenticated user with business membership
```

### `purchaseOrders.getNextNumber` (query)
```typescript
Args: { businessId: Id<"businesses"> }
Returns: string  // e.g., "PO-2026-003"
Auth: Authenticated user
```

## GRN Functions

### `goodsReceivedNotes.create` (mutation)
```typescript
Args: {
  vendorId: Id<"vendors">
  purchaseOrderId?: Id<"purchase_orders">
  grnDate: string
  lineItems: Array<{
    poLineItemIndex?: number
    itemCode?: string
    description: string
    quantityReceived: number
    quantityRejected?: number
    condition?: "good" | "damaged" | "rejected"
    notes?: string
  }>
  sourceDocumentId?: Id<"_storage">
  sourceInvoiceId?: Id<"invoices">
  notes?: string
}
Returns: Id<"goods_received_notes">
Auth: Authenticated user with business membership
Side effects:
  - Updates PO line items receivedQuantity (cumulative)
  - Updates PO status to partially_received or fully_received
  - Triggers re-evaluation of any "missing_grn" match flags
```

### `goodsReceivedNotes.list` (query)
```typescript
Args: {
  businessId: Id<"businesses">
  purchaseOrderId?: Id<"purchase_orders">
  vendorId?: Id<"vendors">
}
Returns: Array<GRN & { vendorName: string, poNumber?: string }>
Auth: Authenticated user with business membership
```

### `goodsReceivedNotes.get` (query)
```typescript
Args: { grnId: Id<"goods_received_notes"> }
Returns: GRN & { vendor: Vendor, purchaseOrder?: PurchaseOrder }
Auth: Authenticated user with business membership
```

## Matching Functions

### `poMatches.autoMatch` (internalMutation)
```typescript
// Called internally after invoice extraction when purchase_order_ref is found
Args: {
  businessId: Id<"businesses">
  invoiceId: Id<"invoices">
  purchaseOrderRef: string
  invoiceLineItems: Array<{ description: string, quantity: number, unitPrice: number, itemCode?: string }>
  vendorId?: Id<"vendors">
}
Returns: { matched: boolean, matchId?: Id<"po_matches">, status?: MatchStatus }
Side effects:
  - Creates match record if PO found
  - Runs variance detection
  - Auto-approves if within tolerance
```

### `poMatches.createManual` (mutation)
```typescript
// User-initiated manual matching
Args: {
  purchaseOrderId: Id<"purchase_orders">
  invoiceId: Id<"invoices">
  lineItemPairings?: Array<{
    poLineIndex: number
    invoiceLineIndex: number
  }>
}
Returns: Id<"po_matches">
Auth: Authenticated user with business membership
Side effects: Runs variance detection on the manual pairing
```

### `poMatches.review` (mutation)
```typescript
Args: {
  matchId: Id<"po_matches">
  action: "approve" | "reject" | "hold"
  notes: string  // Required for reject and hold
}
Returns: void
Auth: Admin or manager role
Validation: Notes required for "reject" and "hold" actions
Side effects:
  - On approve: PO status → "invoiced" (if all lines matched)
  - On reject: Match status → "disputed"
```

### `poMatches.list` (query)
```typescript
Args: {
  businessId: Id<"businesses">
  status?: MatchStatus
  purchaseOrderId?: Id<"purchase_orders">
}
Returns: Array<PoMatch & { poNumber: string, vendorName: string, invoiceNumber?: string }>
Auth: Authenticated user
```

### `poMatches.get` (query)
```typescript
Args: { matchId: Id<"po_matches"> }
Returns: PoMatch & {
  purchaseOrder: PurchaseOrder
  invoice?: Invoice
  grns: GRN[]
  vendor: Vendor
}
Auth: Authenticated user
```

### `poMatches.getUnmatched` (query)
```typescript
Args: {
  businessId: Id<"businesses">
  tab: "pos_without_invoices" | "invoices_without_pos" | "pos_without_grns"
}
Returns: Array<PO | Invoice> with relevant context
Auth: Authenticated user
```

### `poMatches.markNoMatchRequired` (mutation)
```typescript
Args: {
  invoiceId: Id<"invoices">
  reason: string
}
Returns: void
Auth: Admin or manager role
Side effects: Clears matchGated flag, allows payable creation
```

### `poMatches.getDashboardSummary` (query)
```typescript
Args: { businessId: Id<"businesses"> }
Returns: {
  totalMatches: number
  autoApproved: number
  pendingReview: number
  disputed: number
  autoMatchRate: number  // percentage
}
Auth: Authenticated user
```

## Settings Functions

### `matchingSettings.get` (query)
```typescript
Args: { businessId: Id<"businesses"> }
Returns: MatchingSettings | null  // null = use defaults
Auth: Authenticated user
```

### `matchingSettings.update` (mutation)
```typescript
Args: {
  businessId: Id<"businesses">
  quantityTolerancePercent?: number
  priceTolerancePercent?: number
  poNumberPrefix?: string
  grnNumberPrefix?: string
  autoMatchEnabled?: boolean
}
Returns: void
Auth: Admin role only
```

## Internal Functions

### `purchaseOrders.updateReceived` (internalMutation)
```typescript
// Called by GRN creation to update PO cumulative received quantities
Args: {
  poId: Id<"purchase_orders">
  lineUpdates: Array<{ lineIndex: number, additionalReceived: number }>
}
```

### `poMatches.reEvaluateForGrn` (internalMutation)
```typescript
// Called when a GRN is created for a PO that has existing matches with "missing_grn" status
Args: {
  purchaseOrderId: Id<"purchase_orders">
  grnId: Id<"goods_received_notes">
}
```
