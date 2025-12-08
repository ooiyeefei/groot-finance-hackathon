# Authentication & Authorization Documentation

Comprehensive documentation for FinanSEAL's authentication and authorization system.

## 📚 Documentation Index

### Core Authentication
- **[Clerk Configuration](./clerk-configuration.md)** - Clerk Satellite Domain setup, environment variables, and multi-app architecture
- **[Cross-App Access Control](./cross-app-access-control.md)** - How users are isolated between finance and staff apps
- **[Middleware & Route Protection](./middleware.md)** - Request-level authentication and authorization

### Authorization & Permissions
- **[RBAC System](./rbac.md)** - Role-Based Access Control implementation, user roles, and permissions
- **[Multi-Tenancy](./multi-tenancy.md)** - Business isolation, memberships, and cross-business access

### Roadmap
- **[Feature Flags](./roadmap.md#feature-flags)** - Planned cross-app access control with Clerk metadata

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  Clerk Authentication                        │
│            accounts.hellogroot.com (Shared)                  │
│  - Single Sign-On across all *.hellogroot.com domains       │
│  - User identity management (clerk_user_id)                 │
│  - Session management and JWT tokens                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ├─────────────────┬─────────────────┐
                            ▼                 ▼                 ▼
                    ┌───────────────┐ ┌───────────────┐ ┌─────────┐
                    │  Finance App  │ │   Staff App   │ │ Future  │
                    │  Supabase DB  │ │  Supabase DB  │ │  Apps   │
                    ├───────────────┤ ├───────────────┤ └─────────┘
                    │ ✓ RBAC        │ │ ✓ RBAC        │
                    │ ✓ Multi-tenant│ │ ✓ Multi-tenant│
                    │ ✓ RLS Policies│ │ ✓ RLS Policies│
                    └───────────────┘ └───────────────┘
```

## 🚀 Quick Start

### 1. Environment Setup

```bash
# Clerk Configuration (REQUIRED)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxx
CLERK_SECRET_KEY=sk_live_xxx
CLERK_WEBHOOK_SECRET=wh_xxx

# Satellite Domain Configuration
NEXT_PUBLIC_CLERK_SIGN_IN_URL=https://accounts.hellogroot.com/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=https://accounts.hellogroot.com/sign-up
NEXT_PUBLIC_CLERK_IS_SATELLITE=true
NEXT_PUBLIC_CLERK_DOMAIN=clerk.hellogroot.com

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Admin Configuration
MASTER_ADMIN_KEY=your_secure_master_key_2025
```

### 2. User Authentication Flow

```typescript
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@/lib/supabase/server'

// In your page or API route
export default async function ProtectedPage() {
  // 1. Authenticate with Clerk
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  // 2. Authorize with Supabase
  const supabase = createClient()
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('clerk_user_id', userId)
    .single()

  if (!user) {
    redirect('/access-denied')
  }

  // 3. Check permissions
  const hasAccess = await checkUserPermission(userId, 'view_dashboard')

  return <YourContent />
}
```

### 3. Role-Based Access

```typescript
import { checkUserRole } from '@/lib/rbac'

// Check if user is admin
const isAdmin = await checkUserRole(userId, 'admin')

// Check if user is manager or higher
const canApprove = await checkUserRole(userId, ['admin', 'manager'])

// Get user's full permissions
const permissions = await getUserPermissions(userId)
```

## 🔐 Security Model

### Authentication Layers

1. **Clerk Layer** (Identity)
   - Authenticates user identity
   - Manages sessions and JWT tokens
   - Provides `clerk_user_id` for all systems

2. **Supabase Layer** (Data Access)
   - Validates user exists in app database
   - Enforces Row Level Security (RLS)
   - Stores user profiles and memberships

3. **Application Layer** (Business Logic)
   - Checks RBAC permissions
   - Enforces multi-tenant isolation
   - Validates business context

### Security Checklist

- ✅ **Server-side auth checks** - Never trust client-side authentication
- ✅ **RLS policies** - All Supabase tables have proper RLS
- ✅ **Middleware protection** - Routes protected at middleware level
- ✅ **Clerk metadata** - Roles stored in private metadata (not accessible to client)
- ✅ **JWT validation** - All API requests validate Clerk JWT tokens
- ✅ **Business isolation** - Users cannot access other businesses' data
- ✅ **Audit trails** - All permission changes logged

## 📖 Key Concepts

### Satellite Domains

FinanSEAL uses Clerk's Satellite Domain architecture:

- **Primary Domain**: `accounts.hellogroot.com` (centralized auth)
- **Satellite Apps**: `finance.hellogroot.com`, `staff.hellogroot.com`
- **Benefit**: Single sign-on across all apps, but separate data access control

### Cross-App Access Control

Users can be authenticated via Clerk but blocked at the application level:

```
User signs up on finance.hellogroot.com
├─ Clerk creates: clerk_user_id = "user_abc123"
├─ Finance Supabase creates: user record
└─ Staff Supabase: NO record

User tries staff.hellogroot.com
├─ Clerk: ✅ Authenticated (shared session)
├─ Staff Supabase check: ❌ No user record
└─ Result: Access Denied
```

### Multi-Tenancy

Each business operates independently:

- **Business Isolation**: Users can only access their business's data
- **Business Memberships**: Users can belong to multiple businesses
- **Role Scoping**: Permissions are per-business (admin in Business A ≠ admin in Business B)
- **Data Segregation**: RLS policies enforce business_id filtering

## 🛣️ Roadmap

### ✅ Implemented
- Clerk Satellite Domain setup
- Cross-app access control via Supabase checks
- RBAC with admin/manager/employee roles
- Multi-tenant business memberships
- Invitation system with pending states
- User removal and reactivation
- Complete audit trails

### 🚧 In Progress
- Enhanced middleware route protection
- Granular permission system
- Role inheritance and delegation

### 📋 Planned
- Feature flags for cross-app access (Clerk metadata)
- Subscription-based feature gating
- API key management for M2M auth
- OAuth scopes for third-party integrations
- Advanced audit log querying

## 🔗 Related Documentation

- [Database Schema](../tenancy.md) - Multi-tenant database structure
- [API Documentation](../api/) - Authentication APIs
- [Developer Onboarding](../developer-onboarding.md) - Setup guide

## 🆘 Troubleshooting

### Common Issues

**Issue**: "Invalid Clerk session"
- **Solution**: Check `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is correct
- **Verify**: JWT template is configured in Clerk dashboard

**Issue**: "User not found in database"
- **Solution**: Ensure Clerk webhook is configured and firing
- **Check**: Supabase `users` table has record with matching `clerk_user_id`

**Issue**: "Permission denied"
- **Solution**: Check user's role in `business_memberships` table
- **Verify**: RLS policies are enabled and correct

### Debug Checklist

1. ✅ Clerk session is valid (`await auth()` returns userId)
2. ✅ User exists in Supabase (`users` table)
3. ✅ User has business membership (`business_memberships` table)
4. ✅ User's role has required permission
5. ✅ RLS policies allow the operation
6. ✅ Middleware is not blocking the route

## 📝 Contributing

When updating auth documentation:

1. Update the relevant section in this directory
2. Add examples and code snippets
3. Update the architecture diagrams if structure changes
4. Test all code examples
5. Update the roadmap if implementing new features

## 📧 Support

For authentication and authorization issues:
- **Internal**: Check `docs/auth/` documentation
- **Clerk Issues**: [Clerk Support](https://clerk.com/support)
- **Supabase Issues**: [Supabase Support](https://supabase.com/support)
