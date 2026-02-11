# Data Model: Sales Invoice Generation

**Feature**: 009-sales-invoice-generation
**Date**: 2026-02-09

## Entity Relationship Overview

```
businesses (existing)
  ├── 1:N → customers (NEW)
  ├── 1:N → catalog_items (NEW)
  ├── 1:N → sales_invoices (NEW)
  │           ├── embeds → lineItems[] (embedded array)
  │           ├── embeds → customerSnapshot (embedded object)
  │           ├── N:1 → customers (optional reference)
  │           └── 1:N → accounting_entries (via sourceDocumentType)
  └── 1:1 → invoice_settings (embedded in businesses table)
```

---

## New Tables

### 1. `sales_invoices`

The core table for outbound invoices to customers.

```typescript
sales_invoices: defineTable({
  // Identity & Scoping
  businessId: v.id("businesses"),
  userId: v.id("users"),                    // Finance admin who created
  invoiceNumber: v.string(),                // "INV-2026-001" (unique per business)

  // Customer Info (snapshot at creation time — FR-018)
  customerId: v.optional(v.id("customers")), // Reference to directory (optional)
  customerSnapshot: v.object({
    businessName: v.string(),
    contactPerson: v.optional(v.string()),
    email: v.string(),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    taxId: v.optional(v.string()),
  }),

  // Line Items (embedded — following accounting_entries pattern)
  lineItems: v.array(v.object({
    lineOrder: v.number(),
    description: v.string(),
    quantity: v.number(),
    unitPrice: v.number(),
    taxRate: v.optional(v.number()),          // e.g., 0.06 for 6%
    taxAmount: v.optional(v.number()),        // Calculated tax for this line
    discountType: v.optional(v.union(v.literal("percentage"), v.literal("fixed"))),
    discountValue: v.optional(v.number()),    // Discount amount or percentage
    discountAmount: v.optional(v.number()),   // Calculated discount for this line
    totalAmount: v.number(),                  // qty * unitPrice - discount + tax
    currency: v.string(),
    itemCode: v.optional(v.string()),         // SKU from catalog
    unitMeasurement: v.optional(v.string()),  // e.g., "pcs", "hours", "kg"
    catalogItemId: v.optional(v.string()),    // Reference to catalog (tracking only)
  })),

  // Financial Totals
  subtotal: v.number(),                      // Sum of line items before tax/discount
  totalDiscount: v.optional(v.number()),     // Invoice-level discount amount
  invoiceDiscountType: v.optional(v.union(v.literal("percentage"), v.literal("fixed"))),
  invoiceDiscountValue: v.optional(v.number()),
  totalTax: v.number(),                      // Sum of all tax amounts
  totalAmount: v.number(),                   // Grand total (subtotal - discount + tax)
  amountPaid: v.optional(v.number()),        // Running total of payments received
  balanceDue: v.number(),                    // totalAmount - amountPaid

  // Currency
  currency: v.string(),                      // ISO code: SGD, MYR, USD, etc.
  exchangeRate: v.optional(v.number()),      // If different from home currency
  homeCurrencyAmount: v.optional(v.number()),

  // Tax Mode
  taxMode: v.union(v.literal("exclusive"), v.literal("inclusive")),

  // Dates (business dates — use formatBusinessDate, no timezone conversion)
  invoiceDate: v.string(),                   // ISO YYYY-MM-DD
  dueDate: v.string(),                       // ISO YYYY-MM-DD (calculated from payment terms)
  sentAt: v.optional(v.number()),            // Unix ms timestamp when sent
  paidAt: v.optional(v.string()),            // ISO YYYY-MM-DD when fully paid
  voidedAt: v.optional(v.number()),          // Unix ms timestamp when voided

  // Payment Terms
  paymentTerms: v.union(
    v.literal("due_on_receipt"),
    v.literal("net_15"),
    v.literal("net_30"),
    v.literal("net_60"),
    v.literal("custom"),
  ),

  // Status Lifecycle
  status: v.union(
    v.literal("draft"),
    v.literal("sent"),
    v.literal("partially_paid"),
    v.literal("paid"),
    v.literal("overdue"),
    v.literal("void"),
  ),

  // Content
  notes: v.optional(v.string()),             // Free-text memo
  paymentInstructions: v.optional(v.string()), // Bank details, etc.
  templateId: v.optional(v.string()),        // "modern" | "classic"

  // Recurring Invoice Reference
  recurringScheduleId: v.optional(v.string()), // If created from recurring schedule
  isRecurringSource: v.optional(v.boolean()),  // If this invoice is a recurring template

  // Accounting Integration
  accountingEntryId: v.optional(v.string()),   // Link to AR accounting entry

  // Soft Delete & Timestamps
  deletedAt: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
})
  .index("by_businessId", ["businessId"])
  .index("by_businessId_status", ["businessId", "status"])
  .index("by_businessId_customerId", ["businessId", "customerId"])
  .index("by_businessId_invoiceNumber", ["businessId", "invoiceNumber"])
  .index("by_businessId_dueDate", ["businessId", "dueDate"])
  .index("by_recurringScheduleId", ["recurringScheduleId"])
```

**State Transitions**:
```
draft → sent        (on send action — creates AR accounting entry)
sent → partially_paid  (on partial payment recorded)
sent → paid         (on full payment recorded)
sent → overdue      (automatic — when dueDate passes)
overdue → partially_paid  (on partial payment)
overdue → paid      (on full payment)
partially_paid → paid  (when balanceDue reaches 0)
{any except void} → void  (on void action — reverses AR entry)
```

---

### 2. `customers`

Customer directory for saved billing contacts.

```typescript
customers: defineTable({
  businessId: v.id("businesses"),
  businessName: v.string(),                  // Customer's company name
  contactPerson: v.optional(v.string()),     // Primary contact name
  email: v.string(),                         // Primary email (for invoicing)
  phone: v.optional(v.string()),
  address: v.optional(v.string()),           // Billing address (free-text)
  taxId: v.optional(v.string()),             // GST/SST/VAT registration number
  customerCode: v.optional(v.string()),      // Business's internal customer code
  notes: v.optional(v.string()),             // Internal notes about customer
  status: v.union(
    v.literal("active"),
    v.literal("inactive"),
  ),

  // Soft Delete & Timestamps
  deletedAt: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
})
  .index("by_businessId", ["businessId"])
  .index("by_businessId_status", ["businessId", "status"])
  .index("by_businessId_businessName", ["businessId", "businessName"])
  .index("by_businessId_email", ["businessId", "email"])
```

---

### 3. `catalog_items`

Product/service catalog for reusable invoice line items.

```typescript
catalog_items: defineTable({
  businessId: v.id("businesses"),
  name: v.string(),                          // Product/service name
  description: v.optional(v.string()),       // Detailed description
  sku: v.optional(v.string()),               // SKU / item code
  unitPrice: v.number(),                     // Default unit price
  currency: v.string(),                      // Price currency
  unitMeasurement: v.optional(v.string()),   // "pcs", "hours", "kg", "units"
  taxRate: v.optional(v.number()),           // Default tax rate (e.g., 0.06)
  category: v.optional(v.string()),          // Product category (free-text)
  status: v.union(
    v.literal("active"),
    v.literal("inactive"),                   // Soft-deactivated (not hard deleted)
  ),

  // Soft Delete & Timestamps
  deletedAt: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
})
  .index("by_businessId", ["businessId"])
  .index("by_businessId_status", ["businessId", "status"])
  .index("by_businessId_name", ["businessId", "name"])
  .index("by_businessId_sku", ["businessId", "sku"])
```

---

### 4. `recurring_invoice_schedules`

Configuration for automatic recurring invoice generation.

```typescript
recurring_invoice_schedules: defineTable({
  businessId: v.id("businesses"),
  sourceInvoiceId: v.id("sales_invoices"),   // Template invoice to clone
  frequency: v.union(
    v.literal("weekly"),
    v.literal("monthly"),
    v.literal("quarterly"),
    v.literal("yearly"),
  ),
  nextGenerationDate: v.string(),            // ISO YYYY-MM-DD
  endDate: v.optional(v.string()),           // ISO YYYY-MM-DD (null = indefinite)
  isActive: v.boolean(),
  lastGeneratedAt: v.optional(v.number()),   // Unix ms
  generationCount: v.optional(v.number()),   // How many invoices generated so far

  // Soft Delete & Timestamps
  deletedAt: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
})
  .index("by_businessId", ["businessId"])
  .index("by_isActive_nextDate", ["isActive", "nextGenerationDate"])
  .index("by_sourceInvoiceId", ["sourceInvoiceId"])
```

---

## Modified Tables

### `businesses` (existing — add fields)

```typescript
// ADD these fields to existing businesses table:
invoiceSettings: v.optional(v.object({
  logoStorageId: v.optional(v.string()),     // Convex file storage ID
  companyName: v.optional(v.string()),       // Override for invoice display
  companyAddress: v.optional(v.string()),
  companyPhone: v.optional(v.string()),
  companyEmail: v.optional(v.string()),
  registrationNumber: v.optional(v.string()),
  taxId: v.optional(v.string()),             // Business tax registration
  defaultCurrency: v.optional(v.string()),   // Default invoice currency
  invoiceNumberPrefix: v.optional(v.string()), // e.g., "INV"
  nextInvoiceNumber: v.optional(v.number()), // Counter (starts at 1)
  defaultPaymentTerms: v.optional(v.string()), // Default terms for new invoices
  defaultPaymentInstructions: v.optional(v.string()), // Bank details
  selectedTemplate: v.optional(v.string()),  // "modern" | "classic"
})),
```

### `accounting_entries` (existing — extend sourceDocumentType)

```typescript
// MODIFY: Add "sales_invoice" to the sourceDocumentType union validator
sourceDocumentType: v.optional(v.union(
  v.literal("invoice"),
  v.literal("expense_claim"),
  v.literal("sales_invoice"),    // NEW
)),
```

---

## Validation Rules

| Entity | Field | Rule |
|--------|-------|------|
| `sales_invoices` | `invoiceNumber` | Unique per business (enforced by index + mutation check) |
| `sales_invoices` | `lineItems` | Must have at least 1 item (FR-021) |
| `sales_invoices` | `customerSnapshot.email` | Valid email format (required for sending) |
| `sales_invoices` | `customerSnapshot.businessName` | Required, non-empty |
| `sales_invoices` | `totalAmount` | Must be > 0 |
| `sales_invoices` | `currency` | Must be one of: SGD, MYR, THB, IDR, PHP, VND, USD, EUR, CNY |
| `catalog_items` | `unitPrice` | Must be >= 0 |
| `catalog_items` | `name` | Required, non-empty, unique per business (soft uniqueness) |
| `customers` | `email` | Valid email format |
| `customers` | `businessName` | Required, non-empty |
| Line item | `quantity` | Must be > 0 |
| Line item | `unitPrice` | Must be >= 0 |
| Line item | `taxRate` | Must be >= 0 and <= 1 (0% to 100%) |
