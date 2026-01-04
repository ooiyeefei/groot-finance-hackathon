# Convex Migration Continuation Plan

**Created**: 2025-12-31
**Status**: ✅ Phase 1 Complete (Core Services Migrated)
**Last Updated**: 2025-12-31

## Executive Summary

**MIGRATION STATUS: ~85% COMPLETE**

All core domain services have been migrated to Convex. The application is now running with Convex as the primary database while retaining Supabase for:
- File storage (receipts, invoices, logos)
- Some background tasks (Trigger.dev extraction)
- Specific API integrations (billing, reports)

**Build Status**: ✅ PASSING

**Key Stats (Updated):**
- 22 files now using Convex (`api.functions.*` pattern)
- 18 files use Supabase Storage (intentionally retained)
- ~30 files still have Supabase database calls (lower priority)
- All domain services migrated ✅
- Trigger.dev db-helpers updated for core operations ✅

---

## Priority Matrix

### P0 - Critical Path (Must Complete First)

| File | Domain | Why Critical | Complexity |
|------|--------|--------------|------------|
| `lib/db/business-context.ts` | Core | Foundation of RBAC, used by ALL domains | HIGH |
| `lib/db/supabase-server.ts` | Core | Central client utilities | HIGH |
| `domains/users/lib/user.service.ts` | Users | User profile management | MEDIUM |
| `domains/security/lib/rbac.ts` | Security | Permission system | HIGH |
| `domains/account-management/lib/account-management.service.ts` | Account | Business/membership CRUD | HIGH |

### P1 - High Priority (Main Features)

| File | Domain | Why Important | Complexity |
|------|--------|---------------|------------|
| `domains/expense-claims/lib/data-access.ts` | Expense | Main user feature | HIGH |
| `domains/expense-claims/lib/enhanced-workflow-engine.ts` | Expense | Approval workflow | MEDIUM |
| `domains/chat/lib/chat.service.ts` | Chat | AI assistant | MEDIUM |
| `trigger/utils/db-helpers.ts` | Background | All Trigger tasks depend on this | MEDIUM |

### P2 - Supporting (Can Run in Parallel)

| File | Domain | Notes | Complexity |
|------|--------|-------|------------|
| `domains/analytics/lib/engine.ts` | Analytics | Dashboard data | MEDIUM |
| `domains/system/lib/health.service.ts` | System | Health checks | LOW |
| `domains/audit/lib/audit.service.ts` | Audit | Audit logging | LOW |
| API routes (14 files) | Various | Thin wrappers | LOW |

---

## Migration Strategy

### Phase A: Data Import (BLOCKING - Do First!)

Before migrating any more code, we need data in Convex:

```bash
# 1. Export from Supabase
npx supabase db dump --data-only > /tmp/supabase-data.sql

# 2. Transform to JSONL (per table)
# Script: scripts/transform-core-domain.ts
# - Convert snake_case to camelCase
# - Add legacyId field with original UUID
# - Convert timestamps to Unix numbers

# 3. Import to Convex
npx convex import --format jsonLines --table users /tmp/users.jsonl
npx convex import --format jsonLines --table businesses /tmp/businesses.jsonl
# ... etc
```

**Tables to import (in order):**
1. `businesses` (no foreign keys)
2. `users` (references businesses)
3. `business_memberships` (references both)
4. `accounting_entries` (embed line_items!)
5. `expense_claims`
6. `invoices`
7. `conversations`
8. `messages`
9. `vendors`
10. `stripe_events`
11. `ocr_usage`

### Phase B: Core Domain Migration

**Goal**: Replace `lib/db/business-context.ts` with Convex

**Files to modify:**
1. `src/lib/db/business-context.ts` → Call Convex instead of Supabase
2. `src/domains/security/lib/rbac.ts` → Use Convex user queries
3. `src/domains/users/lib/user.service.ts` → Use Convex mutations

**New Convex functions needed:**
```typescript
// convex/functions/auth.ts
export const getCurrentUserContext = query({...})
export const switchActiveBusiness = mutation({...})
export const updateLastAccessedAt = mutation({...})
```

### Phase C: Domain-by-Domain Migration

For each domain, follow this pattern:

1. **Read the existing data-access.ts** to understand all operations
2. **Verify Convex functions exist** in `convex/functions/`
3. **Replace Supabase calls** with Convex client calls
4. **Test the domain** manually
5. **Run build** to verify no type errors

**Migration template:**
```typescript
// BEFORE (Supabase)
const { data, error } = await supabase
  .from('expense_claims')
  .select('*')
  .eq('user_id', userId)

// AFTER (Convex)
const { client } = await getAuthenticatedConvex()
const data = await client.query(api.functions.expenseClaims.list, { userId })
```

### Phase D: Trigger.dev Tasks

**Key file**: `src/trigger/utils/db-helpers.ts`

This file contains:
- `updateDocumentStatus()` - Updates invoice/expense_claim status
- `storeOcrResults()` - Saves extraction results
- `getDocumentMetadata()` - Fetches document info

**Migration approach:**
1. Create HTTP actions in `convex/http.ts` for Trigger.dev to call
2. Update `db-helpers.ts` to call HTTP actions instead of Supabase
3. Keep file storage on Supabase (or migrate to S3 later)

### Phase E: Verification & Cleanup

1. **Search for remaining Supabase imports**: `grep -r "@supabase" src/`
2. **Run full build**: `npm run build`
3. **Test all critical flows manually**
4. **Remove Supabase packages** (after verification)

---

## Detailed Migration: Account Management Domain

This domain is a good next target because:
- High usage frequency
- Well-isolated functions
- Already has Convex functions created

### Current State

**Files using Supabase:**
- `src/domains/account-management/lib/account-management.service.ts`
- `src/domains/account-management/lib/invitation.service.ts`

**Convex functions available:**
- `convex/functions/businesses.ts` - ✅ Ready
- `convex/functions/memberships.ts` - ✅ Ready
- `convex/functions/users.ts` - ✅ Ready

### Migration Steps

1. **Create invitation functions in Convex:**
```typescript
// convex/functions/invitations.ts (NEW FILE)
export const create = mutation({...})
export const list = query({...})
export const accept = mutation({...})
export const revoke = mutation({...})
```

2. **Update account-management.service.ts:**
```typescript
// Replace imports
- import { createServiceSupabaseClient } from '@/lib/db/supabase-server'
+ import { getAuthenticatedConvex } from '@/lib/convex'
+ import { api } from '@/convex/_generated/api'

// Replace each function
export async function createBusiness(request: CreateBusinessRequest) {
  const { client, userId } = await getAuthenticatedConvex()
  if (!client) throw new Error('Not authenticated')

  // Call Convex mutation
  const businessId = await client.mutation(api.functions.businesses.create, {
    name: request.name,
    homeCurrency: request.home_currency || 'MYR',
    countryCode: request.country_code,
    ownerId: userId
  })

  return { id: businessId, name: request.name }
}
```

3. **Update invitation.service.ts:**
```typescript
// Similar pattern - replace Supabase with Convex calls
```

4. **Test:**
- Create new business
- Invite team member
- Accept invitation
- Switch business

---

## Known Challenges

### 1. Storage Migration
Supabase Storage → Convex File Storage (or S3)
- **Decision needed**: Use Convex native storage or S3?
- **Temporary solution**: Keep Supabase for storage, Convex for database
- This is why `invoices/lib/data-access.ts` still imports Supabase

### 2. Real-time Subscriptions
Supabase Realtime → Convex useQuery
- Convex has native real-time via `useQuery` hook
- Need to update frontend components to use `useQuery` instead of Supabase subscriptions

### 3. RLS → Convex Auth
- Supabase RLS policies → Convex function-level auth checks
- Already handled in Convex functions (check `ctx.auth.getUserIdentity()`)

### 4. Triggers → Convex Scheduled Functions
- Supabase database triggers → Convex scheduled functions
- Not many triggers used, mostly handled by Trigger.dev tasks

---

## Estimated Timeline

| Phase | Tasks | Duration |
|-------|-------|----------|
| A. Data Import | Export, transform, import all tables | 1-2 days |
| B. Core Domain | business-context.ts, rbac.ts, user.service.ts | 2-3 days |
| C. Account Management | account-management.service.ts, invitation.service.ts | 1 day |
| D. Expense Claims | data-access.ts, workflow-engine.ts, category services | 2-3 days |
| E. Other Domains | analytics, chat, system, audit | 2-3 days |
| F. Trigger.dev Tasks | db-helpers.ts, all trigger tasks | 2-3 days |
| G. Verification | Testing, cleanup, documentation | 1-2 days |

**Total: 11-17 days** (or ~2-3 weeks with buffer)

---

## Quick Wins (Can Do Now)

1. **Update health.service.ts** - Simple file, just check Convex connection instead
2. **Remove enhanced-expense-claims.ts Supabase import** - Only used for types
3. **Update API route thin wrappers** - Most just call services

---

## Files Reference

### Domain Services (Priority Order)
1. `src/lib/db/business-context.ts` - CRITICAL
2. `src/lib/db/supabase-server.ts` - CRITICAL
3. `src/domains/users/lib/user.service.ts`
4. `src/domains/security/lib/rbac.ts`
5. `src/domains/account-management/lib/account-management.service.ts`
6. `src/domains/account-management/lib/invitation.service.ts`
7. `src/domains/expense-claims/lib/data-access.ts`
8. `src/domains/expense-claims/lib/enhanced-workflow-engine.ts`
9. `src/domains/expense-claims/lib/expense-category.service.ts`
10. `src/domains/expense-claims/lib/expense-category-mapper.ts`
11. `src/domains/chat/lib/chat.service.ts`
12. `src/domains/analytics/lib/engine.ts`
13. `src/domains/analytics/lib/analytics.service.ts`
14. `src/domains/system/lib/health.service.ts`
15. `src/domains/system/lib/webhook.service.ts`
16. `src/domains/audit/lib/audit.service.ts`
17. `src/domains/tasks/lib/task.service.ts`

### Trigger.dev Tasks
1. `src/trigger/utils/db-helpers.ts` - CENTRAL
2. `src/trigger/extract-receipt-data.ts`
3. `src/trigger/extract-invoice-data.ts`
4. `src/trigger/classify-document.ts`
5. `src/trigger/convert-pdf-to-image.ts`

### API Routes (14 files)
- See grep results for full list

---

## ✅ Migration Completion Summary (2025-12-31)

### Phase 1 Complete - All Core Services Migrated

| # | Service | Status |
|---|---------|--------|
| 1 | `lib/db/business-context.ts` | ✅ Migrated to Convex |
| 2 | `lib/db/supabase-server.ts` utilities | ✅ Migrated to Convex |
| 3 | `domains/security/lib/rbac.ts` | ✅ Migrated to Convex |
| 4 | `domains/security/lib/ensure-employee-profile.ts` | ✅ Migrated to Convex |
| 5 | `domains/users/lib/user.service.ts` | ✅ Migrated to Convex |
| 6 | `domains/account-management/lib/account-management.service.ts` | ✅ Migrated to Convex |
| 7 | `domains/account-management/lib/invitation.service.ts` | ✅ Migrated to Convex |
| 8 | `domains/expense-claims/lib/data-access.ts` | ✅ Migrated to Convex |
| 9 | `domains/expense-claims/lib/expense-category.service.ts` | ✅ Migrated to Convex |
| 10 | `domains/expense-claims/lib/expense-category-mapper.ts` | ✅ Migrated to Convex |
| 11 | `domains/expense-claims/lib/enhanced-workflow-engine.ts` | ✅ Migrated to Convex |
| 12 | `domains/expense-claims/types/enhanced-expense-claims.ts` | ✅ Removed SupabaseClient |
| 13 | `domains/chat/lib/chat.service.ts` | ✅ Migrated to Convex |
| 14 | `domains/analytics/lib/engine.ts` | ✅ Migrated to Convex |
| 15 | `domains/analytics/lib/analytics.service.ts` | ✅ Migrated to Convex |
| 16 | `domains/system/lib/health.service.ts` | ✅ Migrated to Convex |
| 17 | `domains/system/lib/webhook.service.ts` | ✅ Migrated to Convex |
| 18 | `domains/audit/lib/audit.service.ts` | ✅ Migrated to Convex |
| 19 | `domains/tasks/lib/task.service.ts` | ✅ Migrated to Convex |
| 20 | `domains/invoices/lib/data-access.ts` | ✅ Migrated to Convex |
| 21 | `domains/accounting-entries/lib/data-access.ts` | ✅ Migrated to Convex |
| 22 | `trigger/utils/db-helpers.ts` | ✅ Core operations migrated |

### Convex Schema Additions
- `audit_events` table added for compliance logging
- ID resolution pattern: Functions accept `v.string()` for both Convex IDs and legacy UUIDs

### Intentionally Retained on Supabase

| Category | Files | Reason |
|----------|-------|--------|
| **File Storage** | 18 files | Supabase Storage for receipts, invoices, logos |
| **Billing** | 6 API routes | Stripe integration queries |
| **Reports** | 4 API routes | Report generation queries |
| **AI Tools** | 3 files | Transaction lookups (future migration) |
| **Trigger.dev Tasks** | 5 files | Background extraction (hybrid approach) |

### Key Technical Patterns Established

1. **ID Resolution Pattern**
```typescript
// Convex functions accept string IDs, resolve internally
export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    return await resolveById(ctx.db, "tableName", args.id);
  },
});
```

2. **Service Layer Pattern**
```typescript
// Services use getAuthenticatedConvex()
const { client: convexClient } = await getAuthenticatedConvex()
const result = await convexClient.query(api.functions.domain.operation, args)
```

3. **Type Compatibility**
```typescript
// Null-to-undefined conversions for Convex compatibility
value || undefined
// Type casting where needed
as any
```

### Build Status
- ✅ `npm run build` passes with no TypeScript errors
- ✅ All 22 core service files using Convex
- ✅ Application functional with hybrid Supabase/Convex architecture

---

## Future Considerations (Phase 2 - Optional)

1. **Storage Migration** - Move from Supabase Storage to Convex native storage or S3
2. **Billing Routes** - Migrate remaining billing API routes to Convex
3. **AI Tools** - Update transaction lookup tools to use Convex
4. **Server Data Access** - Migrate `server-data-access.ts` optimizations
5. **Remove Supabase Package** - Only possible after full storage migration

**Note**: The current hybrid architecture is production-ready and performant. Phase 2 migrations are optimization opportunities, not blockers.
