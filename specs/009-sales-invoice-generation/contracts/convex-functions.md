# Convex Function Contracts: Sales Invoice Generation

**Feature**: 009-sales-invoice-generation
**Date**: 2026-02-09

## Sales Invoices (`convex/functions/salesInvoices.ts`)

### Queries

#### `list`
List sales invoices for a business with filtering and sorting.

```typescript
query({
  args: {
    businessId: v.id("businesses"),
    status: v.optional(v.string()),           // Filter by status
    customerId: v.optional(v.id("customers")), // Filter by customer
    dateFrom: v.optional(v.string()),          // ISO date range start
    dateTo: v.optional(v.string()),            // ISO date range end
    sortBy: v.optional(v.union(
      v.literal("date"), v.literal("amount"), v.literal("status"), v.literal("dueDate")
    )),
    sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: {
    invoices: SalesInvoice[],
    nextCursor: string | null,
    totalCount: number,
    summary: {
      totalDraft: number,
      totalSent: number,
      totalOverdue: number,
      totalPaid: number,
      totalOutstanding: number,  // Sum of balanceDue for sent+overdue
    },
  },
  // Auth: Any business member (read-only for non-finance-admin)
})
```

#### `getById`
Get a single sales invoice with full details.

```typescript
query({
  args: {
    id: v.string(),  // Supports both Convex ID and legacy ID
    businessId: v.id("businesses"),
  },
  returns: SalesInvoice | null,
  // Auth: Any business member
})
```

#### `getNextInvoiceNumber`
Preview the next invoice number (for form display).

```typescript
query({
  args: {
    businessId: v.id("businesses"),
  },
  returns: string,  // e.g., "INV-2026-003"
  // Auth: Finance admin
})
```

### Mutations

#### `create`
Create a new sales invoice (draft status).

```typescript
mutation({
  args: {
    businessId: v.id("businesses"),
    customerId: v.optional(v.id("customers")),
    customerSnapshot: v.object({ ... }),  // See data-model.md
    lineItems: v.array(v.object({ ... })),
    currency: v.string(),
    taxMode: v.union(v.literal("exclusive"), v.literal("inclusive")),
    invoiceDate: v.string(),
    paymentTerms: v.string(),
    dueDate: v.string(),
    notes: v.optional(v.string()),
    paymentInstructions: v.optional(v.string()),
    templateId: v.optional(v.string()),
    invoiceDiscountType: v.optional(v.string()),
    invoiceDiscountValue: v.optional(v.number()),
  },
  returns: v.string(),  // New invoice ID
  // Auth: Finance admin only
  // Side effects:
  //   - Atomically increments nextInvoiceNumber on business
  //   - Auto-calculates subtotal, totalTax, totalAmount, balanceDue
  //   - Sets status to "draft"
})
```

#### `update`
Update a draft invoice.

```typescript
mutation({
  args: {
    id: v.string(),
    // Same fields as create (all optional for partial update)
  },
  returns: v.string(),
  // Auth: Finance admin only
  // Constraint: Only draft invoices can be updated
  // Throws: "Cannot edit a sent/paid/void invoice"
})
```

#### `send`
Transition invoice from draft to sent. Triggers email delivery and creates AR accounting entry.

```typescript
mutation({
  args: {
    id: v.string(),
    businessId: v.id("businesses"),
  },
  returns: v.string(),
  // Auth: Finance admin only
  // Validation: All required fields present, at least 1 line item
  // Side effects:
  //   - Sets status to "sent", records sentAt timestamp
  //   - Creates accounting_entry (type: Income, status: pending, sourceDocumentType: sales_invoice)
  //   - Triggers email sending (via API route call or scheduled action)
})
```

#### `recordPayment`
Record a full or partial payment against an invoice.

```typescript
mutation({
  args: {
    id: v.string(),
    businessId: v.id("businesses"),
    amount: v.number(),
    paymentDate: v.string(),       // ISO YYYY-MM-DD
    paymentMethod: v.optional(v.string()),  // "bank_transfer", "cash", "card", etc.
    paymentReference: v.optional(v.string()),
  },
  returns: v.string(),
  // Auth: Finance admin only
  // Side effects:
  //   - Updates amountPaid and balanceDue
  //   - If balanceDue == 0: set status to "paid", record paidAt
  //   - If balanceDue > 0: set status to "partially_paid"
  //   - Updates linked accounting entry status
})
```

#### `void`
Void an invoice (cannot be undone).

```typescript
mutation({
  args: {
    id: v.string(),
    businessId: v.id("businesses"),
    reason: v.optional(v.string()),
  },
  returns: v.string(),
  // Auth: Finance admin only
  // Side effects:
  //   - Sets status to "void", records voidedAt
  //   - Reverses/cancels linked AR accounting entry
  // Constraint: Cannot void an already void invoice
})
```

#### `markOverdue` (internal)
Scheduled function to mark overdue invoices.

```typescript
internalMutation({
  args: {},
  // Called by Convex cron job daily
  // Finds all sent/partially_paid invoices where dueDate < today
  // Sets status to "overdue" (preserving partially_paid if applicable)
})
```

---

## Customers (`convex/functions/customers.ts`)

### Queries

#### `list`
```typescript
query({
  args: {
    businessId: v.id("businesses"),
    status: v.optional(v.string()),
    search: v.optional(v.string()),  // Search by name or email
    limit: v.optional(v.number()),
  },
  returns: Customer[],
  // Auth: Finance admin
})
```

#### `searchByName`
Autocomplete search for customer selector.

```typescript
query({
  args: {
    businessId: v.id("businesses"),
    query: v.string(),
    limit: v.optional(v.number()),  // Default 10
  },
  returns: Customer[],
  // Auth: Finance admin
})
```

### Mutations

#### `create`
```typescript
mutation({
  args: {
    businessId: v.id("businesses"),
    businessName: v.string(),
    contactPerson: v.optional(v.string()),
    email: v.string(),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    taxId: v.optional(v.string()),
    customerCode: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.string(),  // Customer ID
  // Auth: Finance admin
})
```

#### `update`
```typescript
mutation({
  args: {
    id: v.string(),
    // All fields optional for partial update
  },
  returns: v.string(),
  // Auth: Finance admin
})
```

#### `deactivate`
```typescript
mutation({
  args: { id: v.string(), businessId: v.id("businesses") },
  returns: v.string(),
  // Auth: Finance admin
  // Sets status to "inactive" (soft deactivation)
})
```

---

## Catalog Items (`convex/functions/catalogItems.ts`)

### Queries

#### `list`
```typescript
query({
  args: {
    businessId: v.id("businesses"),
    status: v.optional(v.string()),
    category: v.optional(v.string()),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: CatalogItem[],
  // Auth: Finance admin
})
```

#### `searchByName`
Autocomplete search for catalog selector in invoice form.

```typescript
query({
  args: {
    businessId: v.id("businesses"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  returns: CatalogItem[],
  // Auth: Finance admin
})
```

### Mutations

#### `create`
```typescript
mutation({
  args: {
    businessId: v.id("businesses"),
    name: v.string(),
    description: v.optional(v.string()),
    sku: v.optional(v.string()),
    unitPrice: v.number(),
    currency: v.string(),
    unitMeasurement: v.optional(v.string()),
    taxRate: v.optional(v.number()),
    category: v.optional(v.string()),
  },
  returns: v.string(),
  // Auth: Finance admin
})
```

#### `update`
```typescript
mutation({
  args: {
    id: v.string(),
    // All fields optional
  },
  returns: v.string(),
  // Auth: Finance admin
})
```

#### `deactivate`
```typescript
mutation({
  args: { id: v.string(), businessId: v.id("businesses") },
  returns: v.string(),
  // Auth: Finance admin
  // Sets status to "inactive"
})
```

---

## Invoice Settings (on `businesses` table)

### Queries

#### `getInvoiceSettings`
```typescript
query({
  args: { businessId: v.id("businesses") },
  returns: InvoiceSettings | null,
  // Auth: Finance admin
})
```

### Mutations

#### `updateInvoiceSettings`
```typescript
mutation({
  args: {
    businessId: v.id("businesses"),
    invoiceSettings: v.object({
      logoStorageId: v.optional(v.string()),
      companyName: v.optional(v.string()),
      companyAddress: v.optional(v.string()),
      companyPhone: v.optional(v.string()),
      companyEmail: v.optional(v.string()),
      registrationNumber: v.optional(v.string()),
      taxId: v.optional(v.string()),
      defaultCurrency: v.optional(v.string()),
      invoiceNumberPrefix: v.optional(v.string()),
      defaultPaymentTerms: v.optional(v.string()),
      defaultPaymentInstructions: v.optional(v.string()),
      selectedTemplate: v.optional(v.string()),
    }),
  },
  returns: v.string(),
  // Auth: Finance admin
})
```

---

## Recurring Invoice Schedules

### Queries

#### `listByBusiness`
```typescript
query({
  args: { businessId: v.id("businesses") },
  returns: RecurringSchedule[],
  // Auth: Finance admin
})
```

### Mutations

#### `create`
```typescript
mutation({
  args: {
    businessId: v.id("businesses"),
    sourceInvoiceId: v.id("sales_invoices"),
    frequency: v.string(),
    nextGenerationDate: v.string(),
    endDate: v.optional(v.string()),
  },
  returns: v.string(),
  // Auth: Finance admin
})
```

#### `cancel`
```typescript
mutation({
  args: { id: v.string(), businessId: v.id("businesses") },
  returns: v.string(),
  // Auth: Finance admin
  // Sets isActive to false
})
```

#### `generateDueInvoices` (internal)
```typescript
internalMutation({
  args: {},
  // Called by Convex cron daily
  // Finds active schedules where nextGenerationDate <= today
  // Clones source invoice → new draft
  // Advances nextGenerationDate to next period
  // Deactivates if endDate reached
})
```
