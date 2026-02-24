# Convex Function Contracts: Export System v2

## Schema Changes

### `convex/schema.ts` — Export Module Validator

```typescript
// BEFORE:
const exportModuleValidator = v.union(v.literal("expense"), v.literal("leave"));

// AFTER:
const exportModuleValidator = v.union(
  v.literal("expense"),
  v.literal("invoice"),
  v.literal("leave"),
  v.literal("accounting")
);
```

No other schema changes required. All existing tables remain compatible.

---

## Query Functions (`convex/functions/exportJobs.ts`)

### `preview` (Modified)

```typescript
export const preview = query({
  args: {
    businessId: v.string(),
    module: v.union(
      v.literal("expense"),
      v.literal("invoice"),
      v.literal("leave"),
      v.literal("accounting")
    ),
    templateId: v.optional(v.id("export_templates")),
    prebuiltId: v.optional(v.string()),
    filters: v.optional(v.object({
      startDate: v.optional(v.string()),
      endDate: v.optional(v.string()),
      statusFilter: v.optional(v.array(v.string())),
      employeeIds: v.optional(v.array(v.string())),
      // NEW: Invoice-specific filter
      invoiceType: v.optional(v.union(
        v.literal("AP"),
        v.literal("AR"),
        v.literal("All")
      )),
      // NEW: Accounting records transaction type filter
      transactionTypeFilter: v.optional(v.union(
        v.literal("expense_claim"),
        v.literal("invoice"),
        v.literal("all")
      )),
    })),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    records: v.array(v.any()),
    totalCount: v.number(),
    previewCount: v.number(),
  }),
});
```

### `execute` (Modified)

```typescript
export const execute = mutation({
  args: {
    businessId: v.string(),
    module: v.union(
      v.literal("expense"),
      v.literal("invoice"),
      v.literal("leave"),
      v.literal("accounting")
    ),
    templateId: v.optional(v.id("export_templates")),
    prebuiltId: v.optional(v.string()),
    templateName: v.string(),
    filters: v.optional(v.object({
      startDate: v.optional(v.string()),
      endDate: v.optional(v.string()),
      statusFilter: v.optional(v.array(v.string())),
      employeeIds: v.optional(v.array(v.string())),
      invoiceType: v.optional(v.union(
        v.literal("AP"),
        v.literal("AR"),
        v.literal("All")
      )),
      transactionTypeFilter: v.optional(v.union(
        v.literal("expense_claim"),
        v.literal("invoice"),
        v.literal("all")
      )),
    })),
  },
  returns: v.id("export_history"),
});
```

### `getAvailableFields` (Modified)

```typescript
export const getAvailableFields = query({
  args: {
    module: v.union(
      v.literal("expense"),
      v.literal("invoice"),
      v.literal("leave"),
      v.literal("accounting")
    ),
  },
  returns: v.array(v.object({
    id: v.string(),
    label: v.string(),
    type: v.union(v.literal("text"), v.literal("number"), v.literal("date")),
  })),
});
```

---

## New Helper Functions (`convex/functions/exportJobs.ts`)

### `getAccountingRecords` (New)

```typescript
async function getAccountingRecords(
  ctx: QueryCtx,
  businessId: Id<"businesses">,
  userId: Id<"users">,
  role: string,
  filters?: {
    startDate?: string;
    endDate?: string;
    statusFilter?: string[];
    transactionTypeFilter?: "expense_claim" | "invoice" | "all";
  }
): Promise<AccountingExportRecord[]>
```

**Logic**:
1. Query `accounting_entries` by businessId, exclude soft-deleted
2. Apply role-based filtering (same pattern as expenses)
3. Apply date range filter on `transactionDate`
4. Apply status filter
5. Apply transaction type filter on `sourceDocumentType`
6. Derive journal lines from line items (DR/CR derivation)
7. Enrich with user data
8. Return up to 10,000 records

### `getInvoiceRecords` (New)

```typescript
async function getInvoiceRecords(
  ctx: QueryCtx,
  businessId: Id<"businesses">,
  userId: Id<"users">,
  role: string,
  filters?: {
    startDate?: string;
    endDate?: string;
    statusFilter?: string[];
    invoiceType?: "AP" | "AR" | "All";
  }
): Promise<InvoiceExportRecord[]>
```

**Logic**:
1. Based on `invoiceType` filter:
   - "AP": Query `invoices` table only
   - "AR": Query `sales_invoices` table only
   - "All" / undefined: Query both, merge
2. Apply role-based filtering
3. Apply date range filter
4. Apply status filter
5. Normalize AP and AR records into common `InvoiceExportRecord` shape
6. Enrich with vendor/customer data
7. Return up to 10,000 records

### `enrichAccountingRecords` (New)

```typescript
async function enrichAccountingRecords(
  ctx: QueryCtx,
  records: any[]
): Promise<AccountingExportRecord[]>
```

Enriches with:
- User data (created by)
- Vendor data (from vendorId)
- Derives journal lines (DR/CR) from line items

### `enrichInvoiceRecords` (New)

```typescript
async function enrichInvoiceRecords(
  ctx: QueryCtx,
  apRecords: any[],
  arRecords: any[]
): Promise<InvoiceExportRecord[]>
```

Enriches with:
- Vendor data for AP invoices
- Customer data for AR invoices (already embedded in customerSnapshot)
- Normalizes into common shape

---

## Mutation Functions (`convex/functions/exportTemplates.ts`)

### `create` (Modified)

```typescript
export const create = mutation({
  args: {
    businessId: v.string(),
    name: v.string(),
    module: v.union(
      v.literal("expense"),
      v.literal("invoice"),
      v.literal("leave"),
      v.literal("accounting")
    ),
    // ... rest unchanged
  },
});
```

### `clonePrebuilt` (Modified)

Expand `PREBUILT_TEMPLATE_IDS` registry:

```typescript
const PREBUILT_TEMPLATE_IDS = {
  expense: [
    "sql-payroll-expense",
    "xero-expense",
    "quickbooks-expense",
    "briohr-expense",
    "kakitangan-expense",
    "generic-expense",
  ],
  invoice: [
    "sql-accounting-ap-pi",
    "sql-accounting-ar-iv",
    "autocount-invoice",
    "generic-invoice",
  ],
  leave: [
    "sql-payroll-leave",
    "briohr-leave",
    "kakitangan-leave",
    "generic-leave",
  ],
  accounting: [
    "sql-accounting-gl-je",
    "autocount-journal",
    "generic-accounting",
  ],
};
```

---

## Frontend Contracts

### Module Selector

```typescript
type ExportModule = "expense" | "invoice" | "leave" | "accounting";

const MODULES: Array<{
  id: ExportModule;
  name: string;
  description: string;
  icon: LucideIcon;
}> = [
  { id: "expense", name: "Expense Claims", description: "Export expense claims and reimbursements", icon: Receipt },
  { id: "invoice", name: "Invoices", description: "Export AP and AR invoices at all stages", icon: FileText },
  { id: "leave", name: "Leave Records", description: "Export leave requests, approvals, and balances", icon: Calendar },
  { id: "accounting", name: "Accounting Records", description: "Export posted journal entries", icon: BookOpen },
];
```

### Export Filters (Extended)

```typescript
interface ExportFilters {
  startDate?: string;
  endDate?: string;
  statusFilter?: string[];
  employeeIds?: string[];
  // NEW
  invoiceType?: "AP" | "AR" | "All";           // Only for invoice module
  transactionTypeFilter?: "expense_claim" | "invoice" | "all";  // Only for accounting module
}
```

### CSV Generator (Extended)

```typescript
// New format types
type ExportFormatType = "flat" | "hierarchical";

interface ExportFormatConfig {
  formatType: ExportFormatType;
  delimiter: string;         // "," or ";"
  fileExtension: string;     // ".csv" or ".txt"
}

// Extended generateCsv signature
function generateExport(
  records: Record<string, unknown>[],
  template: PrebuiltTemplate | CustomTemplate,
  options?: {
    defaultDateFormat?: string;
    defaultDecimalPlaces?: number;
    defaultThousandSeparator?: "comma" | "none";
  }
): string;

// New: Hierarchical format generator
function generateHierarchicalExport(
  records: AccountingExportRecord[],
  masterFields: FieldMapping[],
  detailFields: FieldMapping[],
  delimiter: string,
  options?: FormatOptions
): string;
```
