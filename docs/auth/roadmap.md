# Authentication & Authorization Roadmap

## Current State (✅ Implemented)

### Authentication
- ✅ Clerk subdomain authentication (automatic session sharing)
- ✅ Centralized Account Portal at `accounts.hellogroot.com`
- ✅ Single sign-on across all `*.hellogroot.com` subdomains
- ✅ JWT-based session management
- ✅ Webhook integration for user sync

### Authorization
- ✅ RBAC with 3 roles: admin, manager, employee
- ✅ Multi-tenant business memberships
- ✅ Per-business permission scoping
- ✅ Supabase Row Level Security (RLS) policies

### Cross-App Access Control
- ✅ App-specific user databases (Finance vs Staff)
- ✅ `clerk_user_id` existence check for access control
- ✅ Access Denied page with proper UX
- ✅ Automatic redirection based on user profile

### User Management
- ✅ Business creation and ownership
- ✅ User invitation system (email-based)
- ✅ Cross-business memberships
- ✅ User removal (soft deletion)
- ✅ User reactivation
- ✅ Complete audit trails

## Phase 1: Feature Flags & Cross-App Access (🚧 Next Up)

### Feature Flag System

**Goal**: Enable users to access multiple apps based on subscription tier or explicit permissions.

#### Option A: Clerk Public Metadata (Recommended for MVP)

**Timeline**: 2-3 days

**Implementation**:
```typescript
// When granting access
await clerkClient.users.updateUserMetadata(userId, {
  publicMetadata: {
    app_access: {
      finance: true,
      staff: true,
    },
    subscription_tier: 'enterprise',
    features: {
      advanced_analytics: true,
      api_access: true,
    }
  }
})

// In middleware or pages
const user = await currentUser()
const hasStaffAccess = user?.publicMetadata?.app_access?.staff === true
```

**Benefits**:
- No database schema changes
- Fast reads (no DB query)
- Easy to implement
- Clerk handles sync automatically

**Limitations**:
- Limited query capabilities
- No complex permission rules
- Metadata size limits

#### Option B: Supabase Feature Flags Table (Enterprise)

**Timeline**: 1-2 weeks

**Database Schema**:
```sql
CREATE TABLE user_app_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_user_id TEXT NOT NULL UNIQUE,
  finance_access BOOLEAN DEFAULT false,
  staff_access BOOLEAN DEFAULT false,
  subscription_tier TEXT CHECK (
    subscription_tier IN ('free', 'pro', 'enterprise')
  ),
  features JSONB DEFAULT '{}',
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by TEXT,
  expires_at TIMESTAMPTZ,

  CONSTRAINT valid_access CHECK (
    finance_access OR staff_access
  )
);

-- RLS policies
ALTER TABLE user_app_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own access"
  ON user_app_access FOR SELECT
  TO authenticated
  USING (clerk_user_id = auth.jwt()->>'sub');
```

**Benefits**:
- Complex permission rules
- Query and filter users by access
- Audit trails and history
- Subscription management
- Feature usage analytics

**Limitations**:
- Requires DB schema migration
- Slower than Clerk metadata (DB query)
- More implementation work

### Automatic Profile Creation

**Goal**: When a user has access to an app but no profile, create one automatically.

**Implementation**:
```typescript
// In page component or middleware
const { userId } = await auth()

// Check app access (Clerk metadata or Supabase table)
const hasAccess = await checkAppAccess(userId, 'staff')

if (hasAccess) {
  // Check if profile exists
  const profile = await getStaffProfile(userId)

  if (!profile) {
    // Auto-create profile
    await createStaffProfile(userId, {
      role: 'employee', // Default role
      source: 'auto-provisioned',
    })
  }
}
```

## Phase 2: Enhanced RBAC (📋 Planned)

### Granular Permissions

**Goal**: Move beyond simple roles to fine-grained permissions.

**Timeline**: 2-3 weeks

**Database Schema**:
```sql
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  resource TEXT NOT NULL, -- 'expense', 'transaction', 'user'
  action TEXT NOT NULL,    -- 'create', 'read', 'update', 'delete'
  description TEXT
);

CREATE TABLE role_permissions (
  role_id UUID REFERENCES roles(id),
  permission_id UUID REFERENCES permissions(id),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_permissions (
  user_id TEXT,
  business_id UUID,
  permission_id UUID REFERENCES permissions(id),
  granted_by TEXT,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, business_id, permission_id)
);
```

**Usage**:
```typescript
// Check specific permission
const canApprove = await hasPermission(userId, 'expense:approve')

// Check multiple permissions
const permissions = await getUserPermissions(userId, businessId)
if (permissions.has('transaction:delete')) {
  // Allow deletion
}
```

### Role Inheritance

**Goal**: Create role hierarchies where higher roles inherit lower role permissions.

```typescript
const roleHierarchy = {
  admin: ['manager', 'employee'],
  manager: ['employee'],
  employee: []
}

// Admin automatically has all manager and employee permissions
```

### Custom Roles

**Goal**: Allow businesses to create their own custom roles.

```sql
CREATE TABLE custom_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id),
  name TEXT NOT NULL,
  description TEXT,
  based_on TEXT, -- 'admin', 'manager', 'employee'
  permissions JSONB,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(business_id, name)
);
```

## Phase 3: API & M2M Authentication (📋 Planned)

### API Key Management

**Goal**: Allow external integrations via API keys.

**Timeline**: 2-3 weeks

**Features**:
- Generate scoped API keys
- Per-business API keys
- Rate limiting per key
- Key expiration and rotation
- Key usage analytics

**Database Schema**:
```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id),
  name TEXT NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,
  key_prefix TEXT NOT NULL, -- 'fsk_live_' or 'fsk_test_'
  scopes JSONB, -- ['transactions:read', 'expenses:write']
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,

  CONSTRAINT valid_key_prefix CHECK (
    key_prefix IN ('fsk_live_', 'fsk_test_')
  )
);
```

### OAuth Scopes

**Goal**: Support OAuth2 for third-party integrations.

**Scopes**:
- `read:transactions` - Read transaction data
- `write:expenses` - Create expense claims
- `read:analytics` - Access analytics data
- `manage:users` - Manage team members

## Phase 4: Advanced Security (📋 Planned)

### Two-Factor Authentication (2FA)

**Goal**: Optional 2FA for high-security accounts.

**Timeline**: 1-2 weeks

**Implementation**: Clerk handles 2FA UI and enforcement

**Configuration**:
```typescript
// Enforce 2FA for admin roles
if (userRole === 'admin' && !user.twoFactorEnabled) {
  redirect('/settings/security/enable-2fa')
}
```

### Session Management

**Goal**: Better visibility and control over active sessions.

**Features**:
- View all active sessions
- Remote session termination
- Session activity logs
- Suspicious activity detection

### IP Whitelisting

**Goal**: Restrict access to specific IP ranges (enterprise feature).

```sql
CREATE TABLE business_ip_whitelist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id),
  ip_range CIDR NOT NULL,
  description TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Phase 5: Compliance & Auditing (📋 Planned)

### Enhanced Audit Logs

**Goal**: Comprehensive audit trails for compliance.

**Timeline**: 2-3 weeks

**Features**:
- User authentication events
- Permission changes
- Data access logs
- Export for compliance (SOC 2, GDPR)
- Immutable audit log storage

**Schema**:
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  user_id TEXT,
  business_id UUID,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  changes JSONB,
  ip_address INET,
  user_agent TEXT,
  result TEXT, -- 'success', 'failure', 'denied'

  -- Immutable
  CONSTRAINT immutable_audit_log CHECK (false) -- Prevents updates/deletes
);
```

### GDPR Compliance

**Goal**: User data export and deletion.

**Features**:
- Export all user data (GDPR Article 15)
- Right to be forgotten (GDPR Article 17)
- Data portability
- Consent management
- Privacy policy versioning

### SOC 2 Compliance

**Goal**: Meet SOC 2 requirements.

**Requirements**:
- Access control documentation
- Change management logs
- Security incident tracking
- Regular access reviews
- Vendor risk management

## Phase 6: Performance & Scale (📋 Planned)

### Permission Caching

**Goal**: Reduce database queries for permission checks.

**Implementation**:
```typescript
// Cache user permissions in Redis
import { redis } from '@/lib/redis'

async function getUserPermissions(userId: string, businessId: string) {
  const cacheKey = `permissions:${userId}:${businessId}`

  // Check cache
  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached)

  // Query database
  const permissions = await queryPermissions(userId, businessId)

  // Cache for 5 minutes
  await redis.setex(cacheKey, 300, JSON.stringify(permissions))

  return permissions
}
```

### Middleware Optimization

**Goal**: Reduce middleware latency to <10ms.

**Strategies**:
- Use Clerk metadata instead of DB queries
- Cache business context
- Lazy-load permissions
- Edge functions for auth checks

## Migration Path

### From Current to Feature Flags (Clerk Metadata)

**Steps**:
1. Add metadata update logic to admin UI
2. Update middleware to check metadata
3. Auto-provision profiles when access granted
4. Test cross-app access flows
5. Deploy to production

**Timeline**: 2-3 days

### From Clerk Metadata to Supabase Feature Flags

**Steps**:
1. Create `user_app_access` table
2. Migrate existing Clerk metadata to table
3. Update all access checks to query table
4. Add subscription tier logic
5. Build admin UI for managing access
6. Deploy and monitor

**Timeline**: 1-2 weeks

## Priority Matrix

| Phase | Priority | Effort | Impact | Start Date |
|-------|----------|--------|--------|------------|
| Feature Flags (Clerk) | 🔴 High | Low | High | Q1 2025 |
| Feature Flags (Supabase) | 🟡 Medium | High | High | Q2 2025 |
| Granular Permissions | 🟡 Medium | High | Medium | Q2 2025 |
| API Keys | 🟢 Low | Medium | Medium | Q3 2025 |
| 2FA | 🟡 Medium | Low | High | Q1 2025 |
| Audit Logs | 🟡 Medium | High | High | Q2 2025 |
| GDPR Compliance | 🔴 High | High | High | Q2 2025 |
| Permission Caching | 🟢 Low | Low | Medium | Q3 2025 |

## Success Metrics

### Phase 1 (Feature Flags)
- ✅ Users can access multiple apps based on permissions
- ✅ Zero manual database changes for access grants
- ✅ <100ms latency for access checks

### Phase 2 (Enhanced RBAC)
- ✅ Support 10+ granular permissions
- ✅ Custom roles per business
- ✅ Role inheritance working correctly

### Phase 3 (API & M2M)
- ✅ External integrations working
- ✅ API key management UI operational
- ✅ Rate limiting effective

### Phase 4 (Advanced Security)
- ✅ 2FA adoption rate >50% for admins
- ✅ Zero unauthorized access incidents
- ✅ Session management operational

### Phase 5 (Compliance)
- ✅ SOC 2 Type 2 certified
- ✅ GDPR compliant data handling
- ✅ Complete audit trail coverage

### Phase 6 (Performance)
- ✅ <10ms middleware latency
- ✅ 99.9% permission cache hit rate
- ✅ Support 100k+ concurrent users

## Related Documentation

- [Clerk Configuration](./clerk-configuration.md) - Current setup
- [Cross-App Access Control](./cross-app-access-control.md) - Implementation details
- [RBAC System](./rbac.md) - Role-based access control
- [Multi-Tenancy](./multi-tenancy.md) - Business isolation
