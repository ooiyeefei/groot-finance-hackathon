# Data Model: CSV Template Builder

**Feature**: 002-csv-template-builder
**Date**: 2026-02-04

---

## New Convex Tables

### 1. export_templates

Stores custom export template configurations. Pre-built templates are defined in code.

```typescript
export_templates: defineTable({
  // Multi-tenant scope
  businessId: v.id("businesses"),

  // Template identity
  name: v.string(),                    // User-friendly name
  description: v.optional(v.string()), // Help text

  // Module - which data to export
  module: v.union(
    v.literal("expense"),
    v.literal("leave")
  ),

  // Template type
  type: v.union(
    v.literal("custom"),    // User-created
    v.literal("cloned")     // Cloned from pre-built
  ),

  // For cloned templates - reference to pre-built
  clonedFromId: v.optional(v.string()),    // Pre-built template ID
  clonedFromVersion: v.optional(v.string()), // Version when cloned

  // Field mappings (embedded for Convex optimization)
  fieldMappings: v.array(v.object({
    sourceField: v.string(),           // FinanSEAL field path (e.g., "employee.name")
    targetColumn: v.string(),          // CSV column header
    order: v.number(),                 // Column order (1-based)
    // Format options
    dateFormat: v.optional(v.string()),     // "DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YYYY"
    decimalPlaces: v.optional(v.number()),  // 0-4
    thousandSeparator: v.optional(v.union(
      v.literal("comma"),
      v.literal("none")
    )),
  })),

  // Global format settings (defaults)
  defaultDateFormat: v.optional(v.string()),
  defaultDecimalPlaces: v.optional(v.number()),
  defaultThousandSeparator: v.optional(v.union(
    v.literal("comma"),
    v.literal("none")
  )),

  // Ownership & audit
  createdBy: v.id("users"),
  updatedBy: v.optional(v.id("users")),

  // Timestamps
  updatedAt: v.optional(v.number()),
})
  .index("by_businessId", ["businessId"])
  .index("by_businessId_module", ["businessId", "module"])
  .index("by_createdBy", ["createdBy"]),
```

### 2. export_schedules

Stores scheduled export configurations.

```typescript
export_schedules: defineTable({
  // Multi-tenant scope
  businessId: v.id("businesses"),

  // Template reference
  templateId: v.optional(v.id("export_templates")),  // Custom template
  prebuiltTemplateId: v.optional(v.string()),        // OR pre-built template ID

  // Schedule configuration
  frequency: v.union(
    v.literal("daily"),
    v.literal("weekly"),
    v.literal("monthly")
  ),

  // Schedule details
  hourUtc: v.number(),             // 0-23 hour in UTC
  minuteUtc: v.optional(v.number()), // 0-59 minute (default 0)
  dayOfWeek: v.optional(v.number()), // 0-6 for weekly (0=Sunday)
  dayOfMonth: v.optional(v.number()), // 1-28 for monthly (28 max for safety)

  // Filter configuration
  filters: v.optional(v.object({
    statusFilter: v.optional(v.array(v.string())), // ["approved", "reimbursed"]
    employeeIds: v.optional(v.array(v.id("users"))), // Specific employees
    // Date range is calculated relative to run time
    dateRangeType: v.optional(v.union(
      v.literal("previous_day"),
      v.literal("previous_week"),
      v.literal("previous_month"),
      v.literal("month_to_date"),
      v.literal("year_to_date")
    )),
  })),

  // Status
  isEnabled: v.boolean(),

  // Timing
  lastRunAt: v.optional(v.number()),
  nextRunAt: v.number(),

  // Ownership & audit
  createdBy: v.id("users"),

  // Timestamps
  updatedAt: v.optional(v.number()),
})
  .index("by_businessId", ["businessId"])
  .index("by_nextRunAt", ["nextRunAt"])
  .index("by_isEnabled_nextRunAt", ["isEnabled", "nextRunAt"]),
```

### 3. export_history

Records of completed exports for re-download and audit.

```typescript
export_history: defineTable({
  // Multi-tenant scope
  businessId: v.id("businesses"),

  // Template used
  templateId: v.optional(v.id("export_templates")),  // Custom template
  prebuiltTemplateId: v.optional(v.string()),        // OR pre-built template ID
  templateName: v.string(),                          // Denormalized for display

  // Module
  module: v.union(
    v.literal("expense"),
    v.literal("leave")
  ),

  // Export details
  recordCount: v.number(),
  fileSize: v.number(),              // Bytes
  storageId: v.optional(v.id("_storage")), // Convex file storage reference

  // Filters used
  filters: v.optional(v.object({
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    statusFilter: v.optional(v.array(v.string())),
    employeeIds: v.optional(v.array(v.string())),
  })),

  // Status
  status: v.union(
    v.literal("completed"),
    v.literal("failed"),
    v.literal("archived")    // File deleted after 90 days
  ),
  errorMessage: v.optional(v.string()),

  // Trigger source
  triggeredBy: v.union(
    v.literal("manual"),
    v.literal("schedule")
  ),
  scheduleId: v.optional(v.id("export_schedules")), // If triggered by schedule

  // Who initiated (user or system)
  initiatedBy: v.optional(v.id("users")),

  // Timestamps
  completedAt: v.optional(v.number()),
  expiresAt: v.optional(v.number()),    // When file will be deleted (90 days)
})
  .index("by_businessId", ["businessId"])
  .index("by_businessId_module", ["businessId", "module"])
  .index("by_initiatedBy", ["initiatedBy"])
  .index("by_scheduleId", ["scheduleId"])
  .index("by_expiresAt", ["expiresAt"]),
```

---

## Field Definitions

### Expense Claims Fields

Available fields for expense export templates:

```typescript
export const EXPENSE_FIELDS = [
  // Employee info
  { id: 'employee.name', label: 'Employee Name', type: 'text' },
  { id: 'employee.email', label: 'Employee Email', type: 'text' },
  { id: 'employee.employeeId', label: 'Employee ID', type: 'text' },
  { id: 'employee.department', label: 'Department', type: 'text' },

  // Expense details
  { id: 'transactionDate', label: 'Transaction Date', type: 'date' },
  { id: 'vendorName', label: 'Vendor Name', type: 'text' },
  { id: 'totalAmount', label: 'Amount', type: 'number' },
  { id: 'currency', label: 'Currency', type: 'text' },
  { id: 'homeCurrencyAmount', label: 'Amount (Home Currency)', type: 'number' },
  { id: 'exchangeRate', label: 'Exchange Rate', type: 'number' },

  // Categorization
  { id: 'expenseCategory', label: 'Category', type: 'text' },
  { id: 'businessPurpose', label: 'Business Purpose', type: 'text' },
  { id: 'description', label: 'Description', type: 'text' },
  { id: 'referenceNumber', label: 'Reference Number', type: 'text' },

  // Workflow
  { id: 'status', label: 'Status', type: 'text' },
  { id: 'submittedAt', label: 'Submitted Date', type: 'date' },
  { id: 'approvedAt', label: 'Approved Date', type: 'date' },
  { id: 'paidAt', label: 'Paid Date', type: 'date' },
  { id: 'approver.name', label: 'Approved By', type: 'text' },
  { id: 'reviewerNotes', label: 'Reviewer Notes', type: 'text' },
];
```

### Leave Records Fields

Available fields for leave export templates:

```typescript
export const LEAVE_FIELDS = [
  // Employee info
  { id: 'employee.name', label: 'Employee Name', type: 'text' },
  { id: 'employee.email', label: 'Employee Email', type: 'text' },
  { id: 'employee.employeeId', label: 'Employee ID', type: 'text' },
  { id: 'employee.department', label: 'Department', type: 'text' },

  // Leave details
  { id: 'leaveType.name', label: 'Leave Type', type: 'text' },
  { id: 'leaveType.code', label: 'Leave Code', type: 'text' },
  { id: 'startDate', label: 'Start Date', type: 'date' },
  { id: 'endDate', label: 'End Date', type: 'date' },
  { id: 'totalDays', label: 'Days', type: 'number' },

  // Request info
  { id: 'notes', label: 'Reason/Notes', type: 'text' },

  // Workflow
  { id: 'status', label: 'Status', type: 'text' },
  { id: 'submittedAt', label: 'Submitted Date', type: 'date' },
  { id: 'approvedAt', label: 'Approved Date', type: 'date' },
  { id: 'approver.name', label: 'Approved By', type: 'text' },
  { id: 'approverNotes', label: 'Approver Notes', type: 'text' },
];
```

---

## Validators

Add to `convex/lib/validators.ts`:

```typescript
export const exportModuleValidator = v.union(
  v.literal("expense"),
  v.literal("leave")
);

export const exportTemplateTypeValidator = v.union(
  v.literal("custom"),
  v.literal("cloned")
);

export const exportFrequencyValidator = v.union(
  v.literal("daily"),
  v.literal("weekly"),
  v.literal("monthly")
);

export const exportHistoryStatusValidator = v.union(
  v.literal("completed"),
  v.literal("failed"),
  v.literal("archived")
);

export const exportTriggerValidator = v.union(
  v.literal("manual"),
  v.literal("schedule")
);

export const dateRangeTypeValidator = v.union(
  v.literal("previous_day"),
  v.literal("previous_week"),
  v.literal("previous_month"),
  v.literal("month_to_date"),
  v.literal("year_to_date")
);

export const thousandSeparatorValidator = v.union(
  v.literal("comma"),
  v.literal("none")
);
```

---

## TypeScript Interfaces

Located at `src/domains/exports/types/index.ts`:

```typescript
// Template types
export interface ExportTemplate {
  _id: Id<"export_templates">;
  businessId: Id<"businesses">;
  name: string;
  description?: string;
  module: "expense" | "leave";
  type: "custom" | "cloned";
  clonedFromId?: string;
  clonedFromVersion?: string;
  fieldMappings: FieldMapping[];
  defaultDateFormat?: string;
  defaultDecimalPlaces?: number;
  defaultThousandSeparator?: "comma" | "none";
  createdBy: Id<"users">;
  updatedBy?: Id<"users">;
  _creationTime: number;
  updatedAt?: number;
}

export interface FieldMapping {
  sourceField: string;
  targetColumn: string;
  order: number;
  dateFormat?: string;
  decimalPlaces?: number;
  thousandSeparator?: "comma" | "none";
}

// Pre-built template (code-defined)
export interface PrebuiltTemplate {
  id: string;
  name: string;
  description: string;
  module: "expense" | "leave";
  version: string;
  targetSystem: string;  // "sql-payroll", "xero", etc.
  fieldMappings: FieldMapping[];
}

// Schedule types
export interface ExportSchedule {
  _id: Id<"export_schedules">;
  businessId: Id<"businesses">;
  templateId?: Id<"export_templates">;
  prebuiltTemplateId?: string;
  frequency: "daily" | "weekly" | "monthly";
  hourUtc: number;
  minuteUtc?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  filters?: ExportFilters;
  isEnabled: boolean;
  lastRunAt?: number;
  nextRunAt: number;
  createdBy: Id<"users">;
  _creationTime: number;
  updatedAt?: number;
}

export interface ExportFilters {
  startDate?: string;
  endDate?: string;
  statusFilter?: string[];
  employeeIds?: string[];
  dateRangeType?: DateRangeType;
}

export type DateRangeType =
  | "previous_day"
  | "previous_week"
  | "previous_month"
  | "month_to_date"
  | "year_to_date";

// History types
export interface ExportHistory {
  _id: Id<"export_history">;
  businessId: Id<"businesses">;
  templateId?: Id<"export_templates">;
  prebuiltTemplateId?: string;
  templateName: string;
  module: "expense" | "leave";
  recordCount: number;
  fileSize: number;
  storageId?: Id<"_storage">;
  filters?: ExportFilters;
  status: "completed" | "failed" | "archived";
  errorMessage?: string;
  triggeredBy: "manual" | "schedule";
  scheduleId?: Id<"export_schedules">;
  initiatedBy?: Id<"users">;
  _creationTime: number;
  completedAt?: number;
  expiresAt?: number;
}

// Field definition type
export interface FieldDefinition {
  id: string;
  label: string;
  type: "text" | "number" | "date";
}
```

---

## Data Relationships

```
businesses (1) ─────┬───── (*) export_templates
                    │           │
                    │           └──── fieldMappings (embedded)
                    │
                    ├───── (*) export_schedules
                    │           │
                    │           ├──── templateId → export_templates
                    │           └──── prebuiltTemplateId (code constant)
                    │
                    └───── (*) export_history
                                │
                                ├──── templateId → export_templates
                                ├──── prebuiltTemplateId (code constant)
                                ├──── scheduleId → export_schedules
                                └──── storageId → _storage (Convex files)
```

---

## Indexes Summary

| Table | Index | Purpose |
|-------|-------|---------|
| export_templates | by_businessId | List templates for business |
| export_templates | by_businessId_module | Filter by module |
| export_templates | by_createdBy | User's templates |
| export_schedules | by_businessId | List schedules for business |
| export_schedules | by_nextRunAt | Cron job query |
| export_schedules | by_isEnabled_nextRunAt | Active schedules due to run |
| export_history | by_businessId | List history for business |
| export_history | by_businessId_module | Filter by module |
| export_history | by_initiatedBy | User's exports |
| export_history | by_scheduleId | Exports from specific schedule |
| export_history | by_expiresAt | Cleanup expired files |
