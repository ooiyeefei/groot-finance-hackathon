# Convex Function Contracts: AR Reconciliation

## Module: `convex/functions/salesOrders.ts`

### `importBatch` (mutation)

Bulk creates sales orders from a CSV import result. Checks for duplicates before inserting.

**Args:**
```typescript
{
  businessId: Id<"businesses">,
  orders: Array<{
    orderReference: string,
    orderDate: string,
    customerName?: string,
    productName?: string,
    productCode?: string,
    quantity?: number,
    unitPrice?: number,
    grossAmount: number,
    platformFee?: number,
    netAmount?: number,
    currency: string,
    paymentMethod?: string,
    isRefund?: boolean,
  }>,
  sourcePlatform: string,
  sourceFileName: string,
  importBatchId: string,
}
```

**Returns:** `{ imported: number, duplicatesSkipped: number, importBatchId: string }`

---

### `list` (query)

Lists sales orders with filtering and pagination.

**Args:**
```typescript
{
  businessId: Id<"businesses">,
  matchStatus?: "unmatched" | "matched" | "partial" | "variance" | "conflict",
  dateFrom?: string,
  dateTo?: string,
  sourcePlatform?: string,
  importBatchId?: string,
  limit?: number,
  cursor?: string,
}
```

**Returns:** `{ orders: SalesOrder[], nextCursor?: string }`

---

### `getReconciliationSummary` (query)

Aggregated reconciliation metrics for dashboard.

**Args:**
```typescript
{
  businessId: Id<"businesses">,
  dateFrom?: string,
  dateTo?: string,
}
```

**Returns:**
```typescript
{
  totalOrders: number,
  matched: number,
  unmatched: number,
  variance: number,
  partial: number,
  conflict: number,
  totalGrossAmount: number,
  totalVarianceAmount: number,
  totalPlatformFees: number,
}
```

---

### `runMatching` (mutation)

Runs the matching engine for a batch of imported orders against sales invoices.

**Args:**
```typescript
{
  businessId: Id<"businesses">,
  importBatchId: string,
}
```

**Returns:** `{ matched: number, variance: number, unmatched: number, conflicts: number }`

---

### `updateMatchStatus` (mutation)

Manually set or override a match.

**Args:**
```typescript
{
  orderId: Id<"sales_orders">,
  matchedInvoiceId?: Id<"sales_invoices">,
  matchStatus: "matched" | "unmatched" | "variance",
  matchMethod: "manual",
}
```

**Returns:** `{ success: boolean }`

---

### `detectDuplicates` (query)

Check for existing orders before import.

**Args:**
```typescript
{
  businessId: Id<"businesses">,
  orderReferences: string[],
  sourcePlatform: string,
}
```

**Returns:** `{ duplicates: string[] }` (list of order references that already exist)
