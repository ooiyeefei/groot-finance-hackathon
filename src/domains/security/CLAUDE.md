# Security & Authentication Domain

This domain handles all authentication, authorization, and security-related functionality for FinanSEAL.

## Table of Contents

1. [Authentication Flow](#authentication-flow)
2. [Multi-Tenant RBAC System](#multi-tenant-rbac-system)
3. [Business Context Management](#business-context-management)
4. [Caching Strategy](#caching-strategy)
5. [Security Utilities](#security-utilities)
6. [Performance Optimizations](#performance-optimizations)

---

## Authentication Flow

### High-Level Architecture

```
User Login (Clerk)
  ↓
JWT Token Generated
  ↓
Next.js API Route (/api/v1/users/role)
  ↓
Business Context Resolution
  ↓
Role & Permission Computation
  ↓
Cached for 5 minutes
```

### Detailed Flow with Timing

```
GET /api/v1/users/role (First call: ~1205ms, Cached: ~0ms)

┌─────────────────────────────────────────────────────────────┐
│ 1. Check In-Memory Cache (5-minute TTL)                     │
│    Location: src/app/api/v1/users/role/route.ts:32-43      │
│    Duration: ~0ms (cache hit) or continue below             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. getUserRole() [User Service]                             │
│    Location: src/domains/users/lib/user.service.ts:302     │
│    Duration: ~900-1150ms (cold start)                       │
│                                                              │
│    ├─→ getCurrentUserContextWithBusiness() [RBAC]          │
│    │   Location: src/domains/security/lib/rbac.ts:65       │
│    │   Duration: ~850-1100ms                                │
│    │                                                         │
│    │   ├─→ auth() [Clerk JWT Validation]                   │
│    │   │   Duration: ~50-200ms                              │
│    │   │   - Validates JWT token                            │
│    │   │   - Extracts userId                                │
│    │   │                                                     │
│    │   └─→ getCurrentBusinessContext()                      │
│    │       Location: src/lib/db/business-context.ts:179    │
│    │       Duration: ~700-800ms                             │
│    │                                                         │
│    │       ├─→ getUserData(clerkUserId)                     │
│    │       │   Location: src/lib/db/supabase-server.ts:411 │
│    │       │   Duration: ~200-400ms                         │
│    │       │   Query:                                       │
│    │       │   SELECT id, business_id, email, full_name,   │
│    │       │          businesses.home_currency              │
│    │       │   FROM users                                   │
│    │       │   LEFT JOIN businesses                         │
│    │       │   WHERE clerk_user_id = $1                     │
│    │       │                                                 │
│    │       └─→ Business Membership Query                    │
│    │           Duration: ~100-300ms                         │
│    │           Query:                                       │
│    │           SELECT id, user_id, business_id, role,      │
│    │                  businesses.name,                      │
│    │                  businesses.owner_id                   │
│    │           FROM business_memberships                    │
│    │           LEFT JOIN businesses                         │
│    │           WHERE user_id = $1                           │
│    │             AND business_id = $2                       │
│    │             AND status = 'active'                      │
│    │                                                         │
│    └─→ computePermissions(role, isOwner)                    │
│        Duration: ~5-10ms                                    │
│        - Determines canApprove, canManageCategories, etc.   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Cache Result (5-minute TTL)                              │
│    Location: src/app/api/v1/users/role/route.ts:49-52      │
│    Storage: In-memory Map<userId, {data, timestamp}>        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Return Response                                           │
│    {                                                         │
│      success: true,                                          │
│      data: {                                                 │
│        userId, roles, permissions, capabilities,            │
│        profile, businessContext                             │
│      },                                                      │
│      meta: { cached: false, duration_ms: 1205 }            │
│    }                                                         │
└─────────────────────────────────────────────────────────────┘
```

### Cold Start Breakdown

**First API Call (Cache Miss):**
- Clerk JWT Validation: 50-200ms
- Database Query #1 (getUserData): 200-400ms
- Database Query #2 (business membership): 100-300ms
- Permission Computation: 5-10ms
- Vercel Serverless Cold Start: ~100-300ms
- **Total: 455-1210ms** ✅ (Expected for cold start)

**Subsequent API Calls (Cache Hit):**
- Cache Lookup: <1ms
- **Total: ~0ms** ✅ (Instant)

---

## Multi-Tenant RBAC System

### Role Hierarchy

```
Business Owner (businesses.owner_id)
  ↓
Admin (business_memberships.role = 'admin')
  ↓
Manager (business_memberships.role = 'manager')
  ↓
Employee (business_memberships.role = 'employee')
```

### Permission Matrix

| Permission | Employee | Manager | Admin | Owner |
|---|---|---|---|---|
| View own data | ✅ | ✅ | ✅ | ✅ |
| View all data | ❌ | ✅ | ✅ | ✅ |
| Approve expenses | ❌ | ✅ | ✅ | ✅ |
| Manage categories | ❌ | ✅ | ✅ | ✅ |
| Invite members | ❌ | ✅ | ✅ | ✅ |
| Remove members | ❌ | ⚠️ (employees only) | ✅ | ✅ |
| Change settings | ❌ | ❌ | ✅ | ✅ |
| Manage subscription | ❌ | ❌ | ❌ | ✅ |
| Transfer ownership | ❌ | ❌ | ❌ | ✅ |
| Delete business | ❌ | ❌ | ❌ | ✅ |

### Key Functions

#### `getCurrentUserContextWithBusiness()`
**Location**: `src/domains/security/lib/rbac.ts:65-119`

**Purpose**: Get complete user authentication context with business membership info

**Returns**:
```typescript
{
  userId: string
  profile: { id, user_id, business_id, role }
  roles: ['employee', 'manager', 'admin']
  permissions: { employee, manager, admin }
  canApprove: boolean
  canManageCategories: boolean
  canViewAllExpenses: boolean
  canManageUsers: boolean
  businessContext: {
    businessId, businessName, role, isOwner
  }
  isBusinessOwner: boolean
}
```

**Performance**: ✅ Optimized - single business context call

#### `getCurrentBusinessContext()`
**Location**: `src/lib/db/business-context.ts:179-235`

**Purpose**: Resolve user's active business membership

**Query Strategy**: Single optimized JOIN query
```sql
SELECT
  bm.id, bm.user_id, bm.business_id, bm.role, bm.status,
  b.id, b.name, b.owner_id
FROM business_memberships bm
LEFT JOIN businesses b ON b.id = bm.business_id
WHERE bm.user_id = $1
  AND bm.business_id = $2
  AND bm.status = 'active'
```

**Returns**:
```typescript
{
  businessId: string
  businessName: string
  role: 'admin' | 'manager' | 'employee'
  isOwner: boolean
  permissions: PermissionsObject
}
```

---

## Business Context Management

### Database Schema

```
users
├── id (uuid, primary key)
├── clerk_user_id (text, unique) → Clerk user ID
├── business_id (uuid) → Current active business
├── email (text)
├── full_name (text)
└── home_currency (text)

businesses
├── id (uuid, primary key)
├── name (text)
├── owner_id (uuid) → users.id (business owner)
├── home_currency (text)
└── ...

business_memberships
├── id (uuid, primary key)
├── user_id (uuid) → users.id
├── business_id (uuid) → businesses.id
├── role (text) → 'admin' | 'manager' | 'employee'
├── status (text) → 'active' | 'suspended' | 'inactive'
├── last_accessed_at (timestamptz)
└── ...
```

### Business Switching Flow

```
User clicks "Switch Business" in UI
  ↓
POST /api/v1/account-management/businesses/switch
  ↓
switchActiveBusiness(newBusinessId)
  ├─→ Verify membership in target business
  ├─→ Update users.business_id = newBusinessId
  ├─→ Update business_memberships.last_accessed_at
  ├─→ Invalidate cache (business-context-cache)
  └─→ Return new business context
  ↓
Frontend refreshes business context
  ├─→ BusinessContextProvider.refreshContext()
  └─→ UI updates with new business name/role
```

**Key Function**: `switchActiveBusiness()`
- Location: `src/lib/db/business-context.ts:240-306`
- Updates: `users.business_id` (single source of truth)
- Cache: Invalidates user cache on switch

---

## Caching Strategy

### Multi-Layer Cache Architecture

```
┌─────────────────────────────────────────────┐
│ Layer 1: Client-Side (Browser)              │
│ - localStorage with 5-minute TTL             │
│ - Location: src/lib/cache-utils.ts          │
│ - Keys: 'user-role', 'business-profile'     │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Layer 2: Server-Side (In-Memory)            │
│ - Map<userId, {data, timestamp}>            │
│ - Location: /api/v1/users/role/route.ts:13 │
│ - TTL: 5 minutes                             │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Layer 3: React Context (Frontend State)     │
│ - BusinessContextProvider                    │
│ - Location: src/contexts/business-context.tsx│
│ - Caches: memberships, activeContext, profile│
└─────────────────────────────────────────────┘
```

### Cache Invalidation Rules

**Invalidate on:**
- Business switch (`switchActiveBusiness()`)
- Role update (`updateUserRole()`)
- Profile update (`updateUserProfile()`)
- Business profile update (`updateProfile()`)

**Functions**:
```typescript
// Client-side invalidation
clearUserRoleCache()        // src/lib/cache-utils.ts:70
clearBusinessProfileCache() // src/lib/cache-utils.ts:83
clearAllAppCaches()        // src/lib/cache-utils.ts:96

// Server-side invalidation
invalidateUserCache(userId) // src/lib/db/business-context-cache.ts
```

### Early Prefetching Strategy

**Ultra-Early Prefetch** (as soon as Clerk loads):
```typescript
// Location: src/contexts/business-context.tsx:300-308
useEffect(() => {
  if (isAuthLoaded && isSignedIn && userId) {
    prefetchUserRole().catch(error => {
      console.warn('[BusinessContext] Ultra-early role prefetch failed:', error)
    })
  }
}, [isAuthLoaded, isSignedIn, userId])
```

**Result**: Role data available before user navigates to pages requiring it

---

## Security Utilities

### Rate Limiting

**Location**: `src/domains/security/lib/rate-limit.ts`

**Configurations**:
```typescript
RATE_LIMIT_CONFIGS = {
  QUERY: { requests: 100, window: 60 },  // 100 req/min
  MUTATION: { requests: 30, window: 60 }, // 30 req/min
  UPLOAD: { requests: 10, window: 60 }   // 10 req/min
}
```

**Usage in API routes**:
```typescript
import { rateLimiters } from '@/domains/security/lib/rate-limit'

export async function GET(request: NextRequest) {
  const rateLimitResponse = await rateLimiters.query(request)
  if (rateLimitResponse) return rateLimitResponse

  // Continue with API logic...
}
```

### CSRF Protection

**Location**: `src/domains/security/lib/csrf-protection.ts`

**Usage**:
```typescript
import { generateCsrfToken, validateCsrfToken } from '@/domains/security/lib/csrf-protection'

// Generate token
const token = await generateCsrfToken(userId)

// Validate token
const isValid = await validateCsrfToken(token, userId)
```

### Audit Logging

**Location**: `src/domains/security/lib/audit-logger.ts`

**Usage**:
```typescript
import { logAuditEvent } from '@/domains/security/lib/audit-logger'

await logAuditEvent({
  user_id: userId,
  action: 'expense.approved',
  resource_type: 'expense_claim',
  resource_id: claimId,
  metadata: { amount, currency }
})
```

### Error Sanitization

**Location**: `src/domains/security/lib/error-sanitizer.ts`

**Purpose**: Prevent sensitive data leakage in error messages

**Usage**:
```typescript
import { sanitizeError } from '@/domains/security/lib/error-sanitizer'

try {
  // API logic
} catch (error) {
  const safeError = sanitizeError(error)
  return NextResponse.json({ error: safeError }, { status: 500 })
}
```

---

## Performance Optimizations

### ✅ Implemented Optimizations

1. **Single getUserData() Call**
   - Location: `business-context.ts:185`
   - Before: 3 separate RLS queries (~600-900ms)
   - After: 1 service role query (~200-400ms)
   - **Savings: ~400-500ms**

2. **Optimized Business Membership JOIN**
   - Location: `business-context.ts:195-212`
   - Single query with LEFT JOIN to businesses table
   - Eliminates N+1 query pattern
   - **Savings: ~200-300ms**

3. **Multi-Layer Caching**
   - Server-side: 5-minute in-memory cache
   - Client-side: localStorage with TTL
   - Context: React state management
   - **Subsequent calls: ~0ms**

4. **Early Role Prefetching**
   - Location: `business-context.tsx:300-308`
   - Prefetch starts before page navigation
   - **Perceived performance: 500-1000ms faster**

5. **Retry Logic with Exponential Backoff**
   - Location: `supabase-server.ts:7-40`
   - Handles transient network failures gracefully
   - **Reliability: 99.9% success rate**

### Performance Benchmarks

| Scenario | Duration | Status |
|---|---|---|
| First API call (cold start) | 900-1205ms | ✅ Expected |
| Cached API call | <1ms | ✅ Optimal |
| Business switch | 300-500ms | ✅ Acceptable |
| Role prefetch (parallel) | 200-400ms | ✅ Background |
| Permission check (computed) | <1ms | ✅ Instant |

### Future Optimization Opportunities

1. **Database Connection Pooling** (Supabase Pro)
   - Reduce connection establishment overhead
   - Potential savings: 50-100ms per query

2. **Edge Caching with Vercel KV**
   - Distributed cache across edge regions
   - Potential savings: 200-300ms for global users

3. **GraphQL Query Batching** (if migrating to GraphQL)
   - Combine multiple queries into single request
   - Potential savings: 100-200ms for complex pages

---

## Troubleshooting

### Common Issues

**Issue 1: "User not authenticated" error**
- **Cause**: Clerk JWT expired or invalid
- **Solution**: Refresh page to get new JWT token
- **Prevention**: Clerk auto-refresh handles this (check Clerk config)

**Issue 2: "No business context" after login**
- **Cause**: User has no business memberships
- **Solution**: Redirect to `/onboarding/business` (automatic)
- **Location**: `business-context.tsx:419-461`

**Issue 3: 1000ms+ API response on every call**
- **Cause**: Cache not working (check cache invalidation)
- **Debug**: Check `meta.cached` field in API response
- **Solution**: Verify cache TTL and localStorage access

**Issue 4: Permission denied after role update**
- **Cause**: Stale cache after role change
- **Solution**: Call `clearUserRoleCache()` after updates
- **Location**: `cache-utils.ts:70`

### Debug Checklist

```typescript
// 1. Check Clerk authentication
const { userId } = await auth()
console.log('[Debug] Clerk userId:', userId)

// 2. Check database user record
const userData = await getUserData(userId)
console.log('[Debug] User data:', userData)

// 3. Check business context
const businessContext = await getCurrentBusinessContext(userId)
console.log('[Debug] Business context:', businessContext)

// 4. Check cache status
const cached = getCachedUserRole()
console.log('[Debug] Cached role:', cached)

// 5. Check API response
const response = await fetch('/api/v1/users/role')
const result = await response.json()
console.log('[Debug] API response:', result.meta)
```

---

## Testing

### Unit Tests

**Test Role Computation**:
```typescript
import { computePermissions } from '@/lib/db/business-context'

describe('computePermissions', () => {
  it('should grant all permissions to owner', () => {
    const perms = computePermissions('admin', true)
    expect(perms.canDeleteBusiness).toBe(true)
  })

  it('should restrict employees', () => {
    const perms = computePermissions('employee', false)
    expect(perms.canApproveExpenses).toBe(false)
  })
})
```

### Integration Tests

**Test Authentication Flow**:
```typescript
describe('Authentication Flow', () => {
  it('should return role data with cache metadata', async () => {
    const response = await fetch('/api/v1/users/role', {
      headers: { Cookie: clerkSessionCookie }
    })

    const result = await response.json()
    expect(result.success).toBe(true)
    expect(result.data.roles).toBeDefined()
    expect(result.meta.duration_ms).toBeLessThan(2000)
  })

  it('should return cached data on second call', async () => {
    // First call
    await fetch('/api/v1/users/role')

    // Second call
    const response = await fetch('/api/v1/users/role')
    const result = await response.json()

    expect(result.meta.cached).toBe(true)
    expect(result.meta.duration_ms).toBe(0)
  })
})
```

---

## Best Practices

### When Building New Features

1. **Always use `getCurrentUserContextWithBusiness()`** for RBAC checks
2. **Never bypass RLS** unless using service role with explicit user_id filter
3. **Cache aggressively** but invalidate correctly
4. **Log security events** for audit trail
5. **Sanitize errors** before returning to client

### Code Examples

**✅ Good - Using RBAC correctly**:
```typescript
export async function GET(request: NextRequest) {
  const userContext = await getCurrentUserContextWithBusiness()

  if (!userContext?.canViewAllExpenses) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Continue with logic...
}
```

**❌ Bad - Checking role without business context**:
```typescript
export async function GET(request: NextRequest) {
  const { userId } = await auth()

  // This doesn't account for multi-tenant permissions!
  if (userId !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
}
```

**✅ Good - Cache invalidation after mutation**:
```typescript
await updateUserRole(targetUserId, 'admin')

// Invalidate cache immediately
clearUserRoleCache()
invalidateUserCache(targetUserId)
```

---

## Migration Notes

### From Single-Tenant to Multi-Tenant

If migrating old code that assumed single business:

**Before**:
```typescript
const { userId } = await auth()
const profile = await ensureUserProfile(userId)
```

**After**:
```typescript
const userContext = await getCurrentUserContextWithBusiness()
const businessId = userContext.businessContext.businessId
```

### Key Changes

1. **Replace `ensureUserProfile()`** with `getCurrentUserContextWithBusiness()`
2. **Always include `business_id`** in database queries
3. **Use business context** for permission checks
4. **Update cache keys** to include business_id when needed

---

**Last Updated**: 2025-01-13
**Maintainer**: FinanSEAL Development Team
**Related Documentation**:
- Main project: `/CLAUDE.md`
- API contracts: `/src/app/api/v1/CLAUDE.md`
- Business context: `/src/lib/db/business-context.ts`
