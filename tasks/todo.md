# Multi-Tenant Security Vulnerability Fix Plan

## Overview
Systematically fix critical multi-tenant security vulnerability across 46 API files. The issue: APIs using `createAuthenticatedSupabaseClient(userId)` instead of `createBusinessContextSupabaseClient()`, which allows cross-business data leakage.

## Security Issue Explained
- **Problem**: `createAuthenticatedSupabaseClient(userId)` sets only user context, allowing access to ALL businesses the user belongs to
- **Solution**: `createBusinessContextSupabaseClient()` sets both user AND business context from Clerk JWT's activeBusinessId
- **Impact**: Without business context, users can see/modify data from other businesses they have access to

## Implementation Strategy

### Phase 1: Critical Business Logic APIs (Priority 1)
These handle financial data and MUST be fixed first:

#### Expense Claims APIs (10 files)
- [x] `/src/app/api/expense-claims/[id]/route.ts` - Get/update/delete expense claims
- [x] `/src/app/api/expense-claims/[id]/status/route.ts` - Status transitions (approval/rejection)
- [ ] `/src/app/api/expense-claims/[id]/submit/route.ts` - Expense claim submission
- [x] `/src/app/api/expense-claims/approvals/route.ts` - List pending approvals
- [ ] `/src/app/api/expense-claims/enhanced-approvals/route.ts` - Enhanced approval logic
- [ ] `/src/app/api/expense-claims/bulk-approve/route.ts` - Bulk approval operations
- [ ] `/src/app/api/expense-claims/analytics/route.ts` - Analytics data
- [ ] `/src/app/api/expense-claims/dashboard/route.ts` - Dashboard metrics
- [x] `/src/app/api/expense-claims/reports/monthly/route.ts` - Monthly reports
- [x] `/src/app/api/expense-claims/duplicate-check/route.ts` - Duplicate detection

#### Accounting Entries APIs (3 files)
- [x] `/src/app/api/accounting-entries/[entryId]/route.ts` - Get/update/delete entries
- [x] `/src/app/api/accounting-entries/[entryId]/category/route.ts` - Category updates
- [x] `/src/app/api/accounting-entries/[entryId]/status/route.ts` - Status updates

#### Transaction APIs (1 file)
- [x] `/src/app/api/transactions/[transactionId]/route.ts` - Transaction operations

### Phase 2: Document & Upload APIs (Priority 2)
These handle document processing:

#### Expense Claims Upload/Extract (3 files)
- [x] `/src/app/api/expense-claims/upload/route.ts` - Receipt uploads
- [x] `/src/app/api/expense-claims/dspy-extract/route.ts` - DSPy extraction
- [x] `/src/app/api/expense-claims/check-duplicate/route.ts` - Duplicate checking

#### Invoice APIs (4 files)
- [x] `/src/app/api/invoices/list/route.ts` - List invoices
- [x] `/src/app/api/invoices/upload/route.ts` - Invoice uploads
- [x] `/src/app/api/invoices/[invoiceId]/process/route.ts` - Invoice processing
- [x] `/src/app/api/invoices/process-batch/route.ts` - Batch processing

#### Receipt APIs (2 files)
- [x] `/src/app/api/receipts/extract/route.ts` - Receipt extraction
- [ ] `/src/app/api/receipts/extract-dspy-sync/route.ts` - Synchronous DSPy extraction

### Phase 3: Category & Configuration APIs (Priority 3)
These handle business-specific configurations:

#### Expense Categories (2 files)
- [x] `/src/app/api/expense-categories/route.ts` - CRUD operations
- [x] `/src/app/api/expense-categories/enabled/route.ts` - Get enabled categories

#### COGS Categories (2 files)
- [x] `/src/app/api/cogs-categories/route.ts` - CRUD operations
- [x] `/src/app/api/cogs-categories/enabled/route.ts` - Get enabled categories

### Phase 4: Export & Reporting APIs (Priority 4)
- [x] `/src/app/api/expense-claims/export/google-sheets/route.ts` - Google Sheets export
- [ ] `/src/app/api/expense-reports/generate/route.ts` - Report generation

### Phase 5: User & Business Profile APIs (Priority 5)
- [x] `/src/app/api/user/profile/route.ts` - User profile
- [x] `/src/app/api/business-profile/route.ts` - Business profile

### Phase 6: Chat & Conversation APIs (Priority 6)
- [x] `/src/app/api/chat/route.ts` - LangGraph agent chat
- [x] `/src/app/api/conversations/route.ts` - List conversations
- [x] `/src/app/api/conversations/[id]/route.ts` - Get/update conversations
- [x] `/src/app/api/messages/[messageId]/route.ts` - Message operations

### Phase 7: Audit & Vendor APIs (Priority 7)
- [x] `/src/app/api/audit-events/route.ts` - Audit log
- [x] `/src/app/api/vendors/route.ts` - Vendor management
- [x] `/src/app/api/tasks/[taskId]/status/route.ts` - Task status

### Phase 8: Security Testing API (Priority 8)
- [x] `/src/app/api/security-test/route.ts` - Security validation endpoint

### Phase 9: Debug APIs (NEW - Multi-Tenant Security Fix)
These debug endpoints SHOULD also use business context for proper multi-tenant isolation:
- [ ] `/src/app/api/debug/team-auth/route.ts` - Team auth debug
- [ ] `/src/app/api/debug/supabase-rls/route.ts` - RLS function testing
- [ ] `/src/app/api/debug/test-rls-fix/route.ts` - RLS fix validation
- [ ] `/src/app/api/debug/user-permissions/route.ts` - Permission debugging
- [ ] `/src/app/api/security-test/route.ts` - Security validation (moved to Phase 9)

## Implementation Pattern

For each file, apply these changes:

### 1. Update Import Statement
**Before:**
```typescript
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
```

**After:**
```typescript
import { createAuthenticatedSupabaseClient, createBusinessContextSupabaseClient } from '@/lib/supabase-server'
```

### 2. Replace Function Calls
**Before:**
```typescript
const supabase = await createAuthenticatedSupabaseClient(userId)
// or
const supabase = await createAuthenticatedSupabaseClient()
```

**After:**
```typescript
const supabase = await createBusinessContextSupabaseClient()
```

### 3. Remove userId Parameter
Since `createBusinessContextSupabaseClient()` doesn't need userId parameter, remove any userId resolution logic that was only used for the old function.

## Testing Checklist
After all fixes:
- [ ] Run `npm run build` to verify no TypeScript errors
- [ ] Test expense claim creation in Business A
- [ ] Switch to Business B and verify Business A's claims are NOT visible
- [ ] Test approval flow across business boundaries
- [ ] Test category management isolation
- [ ] Test document upload/processing isolation

## Notes
- Skip ALL debug API files (anything with `/debug/` in path)
- Be careful with complex logic - only straightforward replacements
- Focus on most critical files first (expense-claims, accounting-entries, transactions)
- This is a CRITICAL security vulnerability fix for multi-tenant data isolation

## Review Section
[To be completed after implementation]
