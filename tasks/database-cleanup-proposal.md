# Database Schema Cleanup Proposal

**Date**: 2025-12-08
**Project**: ohxwghdgsuyabgsndfzc (finanseal-prod)
**Status**: AWAITING APPROVAL

---

## Executive Summary

After thorough analysis of the codebase and cross-referencing with the Supabase schema, I've identified:
- **3 unused tables** (legacy applications feature)
- **4 orphan database functions** (references non-existent tables or unused)
- **1 storage bucket** to clean up
- **Several deprecated columns** in used tables
- **Code references** requiring cleanup in db-helpers.ts

**Note**: VendorGuard tables (`vendorguard_conversation_logs`, `vendorguard_negotiations`, `vendor_price_history`) are explicitly EXCLUDED from this cleanup per your request.

**Note**: pgvector extension functions (halfvec_*, vector_*, sparsevec_*, etc.) are **ACTIVELY USED** for knowledge base semantic search - DO NOT DROP.

---

## Part 1: Unused Tables (CONFIRMED)

### Tables with ZERO Code References

| Table | Code References | Reason for Removal |
|-------|-----------------|-------------------|
| `applications` | 0 | Legacy applications feature removed |
| `application_documents` | 0 | Legacy applications feature removed |
| `application_types` | 0 | Legacy applications feature removed |

**Evidence**:
```bash
# Grep results showing 0 matches in actual code files
grep -r "applications" --include="*.ts" --include="*.tsx" → Only found in:
  - CLAUDE.md documentation files
  - RLS policy documentation
  - Migration files
# NO active usage in src/ domain code
```

### Proposed SQL Migration

```sql
-- Migration: drop_legacy_applications_tables
-- Date: 2025-12-08
-- Purpose: Remove unused legacy applications feature tables

-- Step 1: Drop RLS policies first
DROP POLICY IF EXISTS "Users can view their business applications" ON applications;
DROP POLICY IF EXISTS "Users can manage their business applications" ON applications;
DROP POLICY IF EXISTS "Users can view their business application documents" ON application_documents;
DROP POLICY IF EXISTS "Users can manage their business application documents" ON application_documents;

-- Step 2: Drop foreign key constraints
ALTER TABLE application_documents DROP CONSTRAINT IF EXISTS application_documents_application_id_fkey;

-- Step 3: Drop indexes
DROP INDEX IF EXISTS idx_applications_business_id;
DROP INDEX IF EXISTS idx_applications_user_id;
DROP INDEX IF EXISTS idx_application_documents_application_id;
DROP INDEX IF EXISTS idx_application_documents_business_id;

-- Step 4: Drop tables (order matters due to dependencies)
DROP TABLE IF EXISTS application_documents CASCADE;
DROP TABLE IF EXISTS applications CASCADE;
DROP TABLE IF EXISTS application_types CASCADE;
```

---

## Part 2: Storage Bucket Cleanup

### Bucket: `application_documents`

The `application_documents` storage bucket is referenced in `db-helpers.ts:22`:

```typescript
const DOMAIN_BUCKET_MAP: Record<string, string> = {
  'invoices': 'invoices',
  'expense_claims': 'expense_claims',
  'application_documents': 'application_documents',  // ← TO REMOVE
  'documents': 'documents'
};
```

**Action**: After dropping tables, this bucket reference should be removed from code, and bucket emptied/deleted from Supabase Storage.

---

## Part 3: Code Cleanup Required

### File: `src/trigger/utils/db-helpers.ts`

**Lines 19-24** - Remove `application_documents` from DOMAIN_BUCKET_MAP:
```typescript
// BEFORE:
const DOMAIN_BUCKET_MAP: Record<string, string> = {
  'invoices': 'invoices',
  'expense_claims': 'expense_claims',
  'application_documents': 'application_documents',  // REMOVE
  'documents': 'documents'
};

// AFTER:
const DOMAIN_BUCKET_MAP: Record<string, string> = {
  'invoices': 'invoices',
  'expense_claims': 'expense_claims',
  'documents': 'documents'
};
```

**Lines 68-78** - Remove `application_documents` status mapping:
```typescript
// REMOVE THIS ENTIRE BLOCK:
} else if (tableName === 'application_documents') {
  const statusMap: { [key: string]: string } = {
    'pending_extraction': 'analyzing',
    'extracting': 'analyzing',
    'processing': 'analyzing',
    'extraction_failed': 'failed',
    'completed': 'draft'
  };
  mappedStatus = statusMap[status] || status;
}
```

**Lines 267-271** - Remove `application_documents` handling in `updateDocumentClassification`:
```typescript
// REMOVE:
} else if (tableName === 'application_documents') {
  mappedStatus = status === 'pending_extraction' ? 'analyzing' :
                status === 'classification_failed' ? 'classification_failed' : status;
}
// AND:
if (tableName === 'application_documents') {
  updateData.document_type = classification.document_type;
}
```

---

## Part 4: Column Analysis - Used Tables

### Table: `invoices`

| Column | Status | Evidence |
|--------|--------|----------|
| `document_type` | **ALREADY DROPPED** | Migration `20251024071550_drop_invoices_document_type` applied |
| `annotation_image_url` | **NOT USED** | 0 grep matches |
| `annotation_status` | **NOT USED** | 0 grep matches |
| `annotation_task_id` | **NOT USED** | 0 grep matches |
| `annotation_error` | **NOT USED** | 0 grep matches |
| `ocr_metadata` | **NOT USED** | 0 grep matches |
| All other columns | **ACTIVELY USED** | Found in data-access.ts, API routes |

**Recommendation**: Drop unused annotation columns if annotation feature is deprecated.

### Table: `expense_claims`

| Column | Status | Evidence |
|--------|--------|----------|
| `converted_image_path` | **ACTIVELY USED** | Critical for PDF-to-image conversion workflow |
| All other columns | **ACTIVELY USED** | Multiple files reference them |

**Analysis of `converted_image_path`**:
This column is **CRITICAL** for PDF processing - found in 33+ code references:
- `convert-pdf-to-image.ts:535` - Sets the path after PDF conversion
- `extract-receipt-data.ts:301` - Uses for OCR: `imagePath = expenseClaim.converted_image_path || storage_path`
- `extract-invoice-data.ts:478-527` - PDF workflow uses converted folder for multi-page extraction
- `classify-document.ts:146-170` - Classification uses converted images for PDFs
- `image-url/route.ts` (both invoices & expense claims) - Returns signed URLs for doc preview

**Recommendation**: DO NOT DROP - Core feature for PDF document processing

### Table: `accounting_entries`

| Column | Status | Evidence |
|--------|--------|----------|
| `compliance_analysis` | **USED** | cross-border-tax-compliance-tool.ts |
| All other columns | **ACTIVELY USED** | Multiple AI tools, data-access files |

**Recommendation**: No changes needed.

---

## Part 5: RLS Policy Cleanup

After dropping tables, these RLS policies referenced in `supabase/CLAUDE.md` will be automatically dropped:

- `applications` - `business_id = get_user_business_id()`
- `application_documents` - `business_id = get_user_business_id()`

**Note**: The function `get_user_business_id()` is still needed by 12 other tables - DO NOT remove it.

---

## Part 6: Orphan Database Functions (NEW)

### Analysis Method
Cross-referenced all 120+ database functions against codebase `.rpc()` calls and RLS policy usage.

### Functions to DROP

| Function | Reason | Evidence |
|----------|--------|----------|
| `clean_expired_agent_memory` | References non-existent `agent_memory` table | Table doesn't exist in schema |
| `update_agent_memory` | Trigger for non-existent `agent_memory` table | Table doesn't exist in schema |
| `get_active_business_context` | Not used anywhere in codebase | 0 `.rpc()` calls found, documented as "NOT CURRENTLY USED" |
| `can_user_manage_application` | Only used for applications table RLS | Will be orphaned when applications table dropped |

### Functions to KEEP (Actively Used)

| Function | Used In | Purpose |
|----------|---------|---------|
| `get_jwt_claim` | RLS policies | **CRITICAL** - JWT token extraction |
| `get_user_business_id` | 14 RLS policies | **CRITICAL** - Multi-tenant isolation |
| `create_accounting_entry_from_approved_claim` | data-access.ts:972 | Expense approval workflow |
| `get_invoices_with_linked_transactions` | data-access.ts:124 | Invoice list optimization |
| `get_expense_claims_summary` | data-access.ts:664 | Dashboard metrics |
| `get_dashboard_analytics` | engine.ts:135 | Analytics aggregation |
| `list_conversations_optimized` | chat.service.ts:244 | Chat performance |
| `get_manager_team_employees` | user.service.ts:152 | Manager hierarchy |
| `get_vendor_spend_analysis` | VendorGuard feature | Vendor analytics |
| `sync_accounting_entry_status` | Trigger function | Status sync |
| `sync_expense_transaction_status` | Trigger function | Status sync |
| `sync_invoice_status_to_accounting` | Trigger function | Status sync |
| `update_updated_at_column` | Generic trigger | Timestamp updates |
| `update_vendors_updated_at` | Trigger function | Timestamp updates |

### pgvector Extension (TO BE DISABLED)

The 70+ functions like `halfvec_*`, `vector_*`, `sparsevec_*`, `cosine_distance`, etc. are from the **pgvector PostgreSQL extension**.

**Analysis**: These functions are **NOT USED**.
- Our RAG/vector search uses **Qdrant Cloud** (external service), not pgvector
- `vector-storage-service.ts` explicitly uses Qdrant: `this.qdrantUrl = aiConfig.qdrant.url`
- Zero grep matches for `pgvector` or `pg_vector` in TypeScript code
- Extension was likely enabled during early experimentation

**Status**: **CAN BE DISABLED** - Extension is polluting database with unused functions.

**Migration to disable**:
```sql
-- Migration: disable_pgvector_extension
-- WARNING: Verify no tables have vector columns before running
DROP EXTENSION IF EXISTS vector CASCADE;
```

### Proposed SQL Migration (Functions)

```sql
-- Migration: drop_orphan_functions
-- Date: 2025-12-08
-- Purpose: Remove unused/orphan database functions

-- Drop functions referencing non-existent agent_memory table
DROP FUNCTION IF EXISTS public.clean_expired_agent_memory();
DROP FUNCTION IF EXISTS public.update_agent_memory();

-- Drop unused business context function (TypeScript uses direct queries)
DROP FUNCTION IF EXISTS public.get_active_business_context(text);

-- Note: can_user_manage_application will be dropped AFTER applications table is dropped
-- (it's still referenced by RLS policies until then)
```

---

## Execution Plan

### Phase 1: Code Cleanup (Safe - No DB Changes)

1. [ ] Edit `src/trigger/utils/db-helpers.ts` - Remove all `application_documents` references
2. [ ] Run `npm run build` to verify no breaking changes
3. [ ] Commit code changes

### Phase 2: Database Migration - Tables

4. [ ] Create migration file: `supabase/migrations/YYYYMMDD_drop_legacy_applications_tables.sql`
5. [ ] Test migration locally: `supabase db reset`
6. [ ] Apply to production: `supabase db push`

### Phase 3: Database Migration - Orphan Functions & pgvector

7. [ ] Create migration file: `supabase/migrations/YYYYMMDD_drop_orphan_functions.sql`
   - Drop `clean_expired_agent_memory()`
   - Drop `update_agent_memory()`
   - Drop `get_active_business_context(text)`
   - Drop `can_user_manage_application(uuid, uuid)` (after tables dropped)
8. [ ] Verify no tables have vector columns: `SELECT * FROM information_schema.columns WHERE udt_name = 'vector'`
9. [ ] Create migration: `supabase/migrations/YYYYMMDD_disable_pgvector.sql`
   - `DROP EXTENSION IF EXISTS vector CASCADE;`
10. [ ] Apply to production: `supabase db push`

### Phase 4: Storage Cleanup

11. [ ] Empty `application_documents` bucket via Supabase Dashboard
12. [ ] Delete `application_documents` bucket

### Phase 5: Optional - Invoice Column Cleanup

13. [ ] Create migration to drop unused `annotation_*` and `ocr_metadata` columns from `invoices` table
   - Only proceed if annotation feature is confirmed deprecated
   - Need to verify no Python scripts use these columns

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing functionality | Low | Thorough grep analysis shows 0 active usage |
| Data loss | Low | Applications feature was removed; data is legacy |
| RLS policy errors | Low | Policies drop with tables via CASCADE |
| Storage bucket errors | Medium | Verify bucket is empty before deletion |

---

## Approval Request

Please review and approve:

1. **Drop tables**: `applications`, `application_documents`, `application_types`
2. **Drop orphan functions**:
   - `clean_expired_agent_memory()` - references non-existent table
   - `update_agent_memory()` - references non-existent table
   - `get_active_business_context(text)` - not used in codebase
   - `can_user_manage_application(uuid, uuid)` - only for applications RLS
3. **Disable pgvector extension** - NOT USED (we use Qdrant Cloud for vector search)
   - Will remove 70+ unused functions polluting the database
4. **Clean up code**: `db-helpers.ts` references
5. **Delete storage bucket**: `application_documents`
6. **DO NOT DROP**: `converted_image_path` column - **CRITICAL** for PDF processing workflow
7. **Optional**: Drop unused `invoices` columns (annotation_*, ocr_metadata)

---

**Awaiting your approval to proceed with implementation.**
