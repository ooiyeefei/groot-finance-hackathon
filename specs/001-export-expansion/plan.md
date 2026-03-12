# Implementation Plan: ERP Export Expansion

**Branch**: `001-export-expansion` | **Date**: 2026-03-11 | **Spec**: [spec.md](./spec.md)

## Summary

Expand the export system with: (1) a new "Master Data" export module consolidating vendor, customer, CoA, and all existing master-accounting templates; (2) MYOB templates for accounting, expense, invoice, and master data modules; (3) HReasily + Swingvy HR templates; (4) improved BrioHR, Kakitangan, SQL Payroll templates.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, React 19.1.2
**Storage**: Convex document database + Convex File Storage
**Testing**: `npm run build` + manual UAT
**Target Platform**: Web (desktop + mobile responsive)
**Project Type**: Web application (Next.js + Convex)
**Performance Goals**: Existing export engine handles 10K records — no changes needed
**Constraints**: No new Convex tables; extend existing types and templates only
**Scale/Scope**: ~15 new prebuilt templates, 1 new module, field definition updates

## Constitution Check

No project constitution defined — no gates to check.

## Project Structure

### Source Code Changes

```text
# Type system (add "master-data" module)
src/lib/constants/statuses.ts             # Add MASTER_DATA to EXPORT_MODULES
src/domains/exports/types/index.ts        # Add "master-data" to ExportModule union
convex/lib/validators.ts                  # Auto-derived from constants

# Field definitions (add master data fields)
src/domains/exports/lib/field-definitions.ts  # Add VENDOR_FIELDS, CUSTOMER_FIELDS, COA_FIELDS

# Prebuilt templates (add ~15 new, improve 6 existing)
src/domains/exports/lib/prebuilt-templates.ts # MYOB, HReasily, Swingvy, ERP master data

# UI components
src/domains/exports/components/module-selector.tsx    # Add Master Data card
src/domains/exports/components/export-filters.tsx     # Handle master-data filters

# Convex functions (add master-data module branch)
convex/functions/exportJobs.ts            # Add master-data case in getRecordsByModule
convex/schema.ts                          # Update exportModuleValidator reference
```

## Implementation Steps

### Step 1: Type System Updates
- Add `MASTER_DATA: "master-data"` to `EXPORT_MODULES` constant
- Add `"master-data"` to `ExportModule` type union in types/index.ts
- Convex validator auto-derives from constants

### Step 2: Field Definitions
- Add `VENDOR_FIELDS`, `CUSTOMER_FIELDS`, `COA_FIELDS` arrays
- Add to `FIELDS_BY_MODULE` lookup with `"master-data"` key
- Master data fields are flat (no line items)

### Step 3: New Prebuilt Templates
- MYOB: Journal (accounting), Expense (expense), AR Invoice, AP Invoice, Card/Supplier, Card/Customer
- HReasily: Leave, Expense
- Swingvy: Leave, Expense
- SQL Accounting: Creditor (vendor), Debtor (customer), CoA
- AutoCount: Supplier, Customer, CoA

### Step 4: Improve Existing HR Templates
- BrioHR Expense: add vendor, receipt #, status, tax, payment method, employee ID
- BrioHR Leave: add employee name field
- Kakitangan Expense: add employee name, email, currency, vendor, status, tax
- Kakitangan Leave: add employee name, status
- SQL Payroll Expense: add vendor, receipt #, tax

### Step 5: Migrate Master-Accounting Templates
- Change `module: "accounting"` → `module: "master-data"` for: creditor, debtor, chart-of-account, category, cost-centre, stock-item
- Move from ACCOUNTING_TEMPLATES/INVOICE_TEMPLATES/EXPENSE_TEMPLATES arrays to new MASTER_DATA_TEMPLATES array
- Keep template IDs unchanged for backward compatibility

### Step 6: UI Updates
- Add "Master Data" card in module-selector.tsx with Database icon
- Update grid from lg:grid-cols-4 to lg:grid-cols-5
- Handle master-data in export-filters.tsx (no date range needed for master data)

### Step 7: Convex Backend Updates
- Add `"master-data"` case in getRecordsByModule — delegates to getMasterDataRecords based on prebuiltId
- Add `"master-data"` case in enrichByModule — master data needs no enrichment (already flat)
- Update MASTER_DATA_TEMPLATES mapping to include new ERP templates that query same tables

### Step 8: Build & Test
- Run `npm run build` — fix any type errors
- Deploy Convex: `npx convex deploy --yes`
- UAT with test accounts
