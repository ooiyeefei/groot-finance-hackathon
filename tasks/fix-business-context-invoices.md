# Fix: Business Context Cross-Contamination in Invoices

## Problem
Data from different businesses is being shown when switching between businesses. This is a multi-tenancy security issue.

**Root Cause:** The `useDocuments` hook does NOT pass `businessId` to `useInvoicesRealtime`. When `businessId` is undefined, the Convex query falls back to returning all invoices for the user across ALL businesses (not filtered by active business).

## Investigation Findings

### Data Flow Analysis
1. `documents-list.tsx` correctly gets `businessId` from `useActiveBusiness()` hook (line 54)
2. However, `useDocuments()` hook is called without passing businessId (line 62-71)
3. `useDocuments` internally calls `useInvoicesRealtime()` without businessId (line 64-67)
4. `useInvoicesRealtime` passes `undefined` businessId to Convex query
5. Convex `invoices.list` query returns ALL user invoices across businesses when businessId is undefined (lines 162-166)

### Affected Code Paths
- `src/domains/invoices/hooks/use-documents.tsx` - Missing businessId parameter
- `src/domains/invoices/components/documents-list.tsx` - Gets businessId but doesn't pass it

## TODO

- [x] 1. Update `useDocuments` hook interface to accept `businessId` parameter
- [x] 2. Pass `businessId` to `useInvoicesRealtime` inside `useDocuments`
- [x] 3. Update `documents-list.tsx` to pass `businessId` to `useDocuments`
- [x] 4. Verify other pages (expense claims, accounting entries) have correct business filtering
- [x] 5. Run build to verify no type errors
- [ ] 6. Test by switching between businesses

## Solution

### File 1: `src/domains/invoices/hooks/use-documents.tsx`
Add `businessId` to options and pass to `useInvoicesRealtime`:

```typescript
export interface DocumentFilters {
  search?: string;
  status?: string;
  file_type?: string;
  date_from?: string;
  date_to?: string;
  businessId?: string;  // ADD THIS
}

// In useDocuments function:
const {
  invoices,
  isLoading,
  error: realtimeError,
  totalCount,
  hasMore,
} = useInvoicesRealtime({
  businessId: filters.businessId,  // ADD THIS
  status: filters.status,
  limit: 50,
});
```

### File 2: `src/domains/invoices/components/documents-list.tsx`
Pass `businessId` to `useDocuments`:

```typescript
const { businessId } = useActiveBusiness()

const {
  documents,
  loading,
  ...
} = useDocuments({ businessId: businessId ?? undefined })
```

## Review

### Implementation Completed: 2025-01-11

**Changes Made:**

1. **`src/domains/invoices/hooks/use-documents.tsx`**
   - Added `businessId?: string` to `DocumentFilters` interface (line 27)
   - Pass `businessId: filters.businessId` to `useInvoicesRealtime` (line 66)

2. **`src/domains/invoices/components/documents-list.tsx`**
   - Updated `useDocuments()` call to pass `{ businessId: businessId ?? undefined }` (line 72)
   - Added comment explaining the multi-tenant data isolation requirement

**Comprehensive Audit Results:**

| Domain | Status | Notes |
|--------|--------|-------|
| Invoices | ✅ **FIXED** | Now passes businessId for proper filtering |
| Expense Claims | ✅ OK | Uses `ensureUserProfile().business_id` (server-side filtering) |
| Accounting Entries | ✅ OK | API injects businessId from `convexUser.businessId` |
| Analytics | ✅ OK | Server-side uses `getUserDataConvex().business_id` |
| Chat | ✅ OK | User-scoped by design (chat history is personal, not business-scoped) |

**Build Status:** ✅ PASSING

**Ready for Testing:**
1. Log in with user who has access to multiple businesses
2. Switch from Business A to Business B
3. Verify invoices page only shows Business B's documents
4. Switch back to Business A
5. Verify invoices page only shows Business A's documents
