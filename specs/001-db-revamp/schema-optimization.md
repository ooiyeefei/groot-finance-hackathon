# Schema Optimization: Pre-Migration Audit

**Branch**: `001-db-revamp` | **Date**: 2024-12-29

This document identifies columns and tables to optimize BEFORE migrating to Convex. The goal is to avoid carrying technical debt into the new system.

---

## Audit Methodology

Queried production Supabase to measure actual column usage:
- **0% fill rate** = Column never used → **DROP**
- **<15% fill rate** = Rarely used → **EVALUATE** (keep if business-critical)
- **Single value** = No variance → **Consider removing or defaulting**
- **TypeScript can handle** = DB constraint redundant → **Remove from schema**

---

## Tables to KEEP (0 rows but code-verified as needed)

| Table | Rows | Recommendation | Reason |
|-------|------|----------------|--------|
| `ocr_usage` | 0 | **KEEP** | Used in `src/lib/stripe/usage.ts` for billing token tracking |
| `stripe_events` | 0 | **KEEP** | Used in `src/app/api/v1/billing/webhooks/route.ts` for webhook idempotency |

**Note**: 0 rows ≠ unused. These tables have no data because billing features are new, but the code actively uses them.

**Impact**: All 14 tables migrate to Convex

---

## Columns to DROP (Never Used)

### `accounting_entries` (44 rows)

| Column | Fill Rate | Recommendation | Reason |
|--------|-----------|----------------|--------|
| `notes` | 0% (0/44) | **KEEP** | May be used for additional transaction notes |
| `payment_method` | 0% (0/44) | **DROP** | Never populated, not needed |
| `payment_date` | 0% (0/44) | **KEEP** | Required for tracking when transactions are paid |
| `due_date` | 0% (0/44) | **KEEP** | Required for invoice/payment due date tracking |
| `subcategory` | 32% (14/44) | **KEEP** | Used for detailed categorization |

### `line_items` (146 rows)

| Column | Fill Rate | Recommendation | Reason |
|--------|-----------|----------------|--------|
| `discount_amount` | 0% (0/146) | **DROP** | Always 0, never used |
| `item_code` | 21% (30/146) | **KEEP** | Used when OCR extracts SKUs |
| `unit_measurement` | 22% (32/146) | **KEEP** | Used for quantity units |

### `expense_claims` (24 rows)

| Column | Fill Rate | Recommendation | Reason |
|--------|-----------|----------------|--------|
| `reviewed_by` | 0% (0/24) | **KEEP** | **Code-verified**: Actively used in workflow engine for approver routing and audit trail |
| `internal_notes` | 0% (0/24) | **DROP** | **Code-verified**: No usage in application code |

**Code Verification Notes**:
- `reviewed_by` is used in `enhanced-workflow-engine.ts` and `data-access.ts` for:
  - Approver assignment when `status=submitted`
  - Audit trail when `status=approved/rejected/reimbursed`
  - Query filtering for manager approval views

---

## Columns to EVALUATE (Low Usage)

### Keep but make truly optional

| Table | Column | Fill Rate | Decision | Reason |
|-------|--------|-----------|----------|--------|
| `accounting_entries` | `vendor_id` | 9% (4/44) | **KEEP** | FK to vendors, useful for vendor analytics |
| `business_memberships` | `manager_id` | 7% (2/29) | **KEEP** | Required for approval hierarchy |
| `business_memberships` | `invited_at` | 21% (6/29) | **KEEP** | Audit trail for invitations |
| `business_memberships` | `last_accessed_at` | 31% (9/29) | **DROP** | Never actively updated |
| `users` | `invited_by` | 11% (3/27) | **KEEP** | Audit trail |
| `users` | `invited_role` | 7% (2/27) | **DROP** | Redundant with `business_memberships.role` |

---

## TypeScript Replaces DB Constraints

These columns use database CHECK constraints or enums that TypeScript can handle:

### Status Enums → TypeScript Union Types

```typescript
// Instead of DB enum, use TypeScript:
type ExpenseClaimStatus = "draft" | "uploading" | "analyzing" | "submitted" | "approved" | "rejected" | "reimbursed" | "failed";
type InvoiceStatus = "pending" | "uploading" | "analyzing" | "paid" | "overdue" | "disputed" | "failed" | "cancelled";
type AccountingEntryStatus = "pending" | "paid" | "overdue" | "cancelled" | "disputed";
```

### Role Enums → TypeScript Union Types

```typescript
type MembershipRole = "admin" | "manager" | "employee";
type MembershipStatus = "active" | "inactive" | "suspended" | "pending";
```

### Currency Validation → TypeScript

```typescript
const ALLOWED_CURRENCIES = ["USD", "SGD", "MYR", "THB", "IDR", "VND", "PHP", "CNY", "EUR"] as const;
type Currency = typeof ALLOWED_CURRENCIES[number];
```

**Benefit**: Convex schema uses `v.union(v.literal(...))` which provides the same type safety without database-level constraints.

---

## Duplicate/Redundant Columns

### `accounting_entries`

| Column | Issue | Recommendation |
|--------|-------|----------------|
| `home_currency_amount` vs `homeAmount` | Duplicate purpose | **Keep only `homeCurrencyAmount`** |

### `invoices` & `expense_claims`

| Column | Issue | Recommendation |
|--------|-------|----------------|
| `converted_image_path` | Part of processing workflow | **KEEP** - Used for image conversion pipeline |
| `converted_image_width` | Image dimensions | **KEEP** - Separate columns, not in JSONB |
| `converted_image_height` | Image dimensions | **KEEP** - Separate columns, not in JSONB |

**Note**: Keep `converted_image_*` as separate columns (not consolidated into `processingMetadata`) for direct access and simplicity.

---

## Soft Delete Pattern Review

Current: Most tables have `deleted_at` column for soft deletes.

| Table | Soft Deleted Rows | Recommendation |
|-------|-------------------|----------------|
| `conversations` | 9/94 (10%) | **KEEP** - Users delete conversations |
| `messages` | 91/664 (14%) | **KEEP** - Cascade from conversations |
| `invoices` | 8/62 (13%) | **KEEP** - Audit requirement |
| `expense_claims` | 0/24 (0%) | **EVALUATE** - Never used |
| `line_items` | 0/146 (0%) | **DROP** - Cascade delete instead |
| `accounting_entries` | Unknown | **KEEP** - Audit requirement |

**Recommendation**: Keep `deletedAt` only where business requires soft delete. Use hard delete + audit log for others.

---

## Final Optimization Summary

### Tables: All 14 KEEP
- `ocr_usage` - KEEP (billing tracking)
- `stripe_events` - KEEP (webhook idempotency)

### Columns to DROP (per table)

| Table | Columns to Drop | Count |
|-------|-----------------|-------|
| `accounting_entries` | `payment_method` | -1 |
| `line_items` | `discount_amount` | -1 |
| `expense_claims` | `internal_notes` | -1 |
| `users` | `invited_role` | -1 |
| `business_memberships` | `last_accessed_at` | -1 |

**Total: -5 columns**

### Columns to KEEP (Previously Proposed to Drop)

| Table | Column | Reason |
|-------|--------|--------|
| `accounting_entries` | `notes` | May be used for additional notes |
| `accounting_entries` | `payment_date` | Required for payment tracking |
| `accounting_entries` | `due_date` | Required for due date tracking |
| `expense_claims` | `reviewed_by` | **Code-verified**: Active workflow usage |
| `invoices` | `converted_image_*` | Keep as separate columns |

### No Consolidation

Keep all columns as separate fields. Do NOT move `converted_image_*` into `processingMetadata` JSONB.

---

## Migration Data Handling

For dropped columns with existing data:
1. **Backup**: Full `pg_dump` before migration
2. **Archive**: Export dropped column data to JSON file for reference
3. **Migrate**: Only include optimized columns in Convex schema

---

## Next Step

Update `data-model.md` to reflect these optimizations before implementation.
