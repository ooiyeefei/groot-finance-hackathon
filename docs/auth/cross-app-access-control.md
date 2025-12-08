# Cross-App Access Control Strategy

## Current Implementation (No Feature Flags Needed)

### How It Works

Both `finance.hellogroot.com` and `staff.hellogroot.com` use the **same Clerk instance** for authentication, but **separate Supabase projects** for data storage. Access control is enforced by checking if a user exists in each app's Supabase database.

```
┌─────────────────────────────────────────────────────────────┐
│                    Clerk (Shared)                            │
│              accounts.hellogroot.com                         │
│  - User authentication                                       │
│  - Session management                                        │
│  - Single sign-on across all *.hellogroot.com domains       │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ clerk_user_id
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
        ▼                                       ▼
┌──────────────────┐                  ┌──────────────────┐
│  Finance App     │                  │   Staff App      │
│  Supabase DB     │                  │   Supabase DB    │
├──────────────────┤                  ├──────────────────┤
│ users table:     │                  │ users table:     │
│ - clerk_user_id  │                  │ - clerk_user_id  │
│ - business_id    │                  │ - staff_role     │
│ - ...            │                  │ - ...            │
└──────────────────┘                  └──────────────────┘
```

### Authentication Flow

```
1. User signs up on finance.hellogroot.com
   ├─ Redirects to accounts.hellogroot.com/sign-up
   ├─ Clerk creates user with clerk_user_id: "user_abc123"
   ├─ Returns to finance.hellogroot.com/en
   ├─ Clerk webhook triggers → Finance Supabase creates user record
   └─ User can access finance app ✅

2. Same user tries to access staff.hellogroot.com
   ├─ Clerk recognizes user (shared session, no login needed)
   ├─ Staff app checks: Does user exist in Staff Supabase?
   ├─ Result: NO (user only exists in Finance Supabase)
   └─ Access denied ❌

3. User signs up on staff.hellogroot.com (new sign-up, not existing user)
   ├─ Creates separate account on accounts.hellogroot.com
   ├─ Clerk creates NEW user with clerk_user_id: "user_xyz456"
   ├─ Staff Supabase creates user record
   └─ User can access staff app ✅

4. User from step 3 tries to access finance.hellogroot.com
   ├─ Clerk recognizes user (shared session)
   ├─ Finance app checks: Does user exist in Finance Supabase?
   ├─ Result: NO (user only exists in Staff Supabase)
   └─ Access denied ❌
```

## Implementation

### Finance App: `src/app/[locale]/page.tsx`

```typescript
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getUserData } from '@/lib/db/supabase-server'

export default async function Dashboard({ params }) {
  const { userId } = await auth()
  const { locale } = await params

  if (!userId) {
    redirect(`/${locale}/sign-in`)
  }

  try {
    // Check if user exists in FINANCE Supabase
    const userData = await getUserData(userId)

    // User exists but no business_id → onboarding needed
    if (!userData.business_id) {
      redirect(`/${locale}/onboarding/business`)
    }

    // User exists with business → render dashboard
  } catch (error) {
    // User doesn't exist in Finance Supabase → access denied
    redirect(`/${locale}/access-denied`)
  }

  return <DashboardContent />
}
```

### Access Denied Page: `src/app/[locale]/access-denied/page.tsx`

Displays when:
- User authenticated with Clerk ✅
- User NOT found in Finance Supabase ❌

Shows:
- Clear error message
- Reason why access is denied
- Options: Create account, Contact support, Back to sign-in

### Staff App: Similar Pattern

```typescript
// staff.hellogroot.com/app/dashboard/page.tsx
export default async function StaffDashboard() {
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  // Check if user exists in STAFF Supabase
  const supabase = createClient()
  const { data: userProfile } = await supabase
    .from('users')
    .select('id')
    .eq('clerk_user_id', userId)
    .single()

  if (!userProfile) {
    // User authenticated with Clerk but not in Staff Supabase
    return <AccessDeniedPage />
  }

  return <StaffDashboardContent />
}
```

## Current Access Control Matrix

| User Type | Finance App | Staff App | Reason |
|-----------|-------------|-----------|--------|
| Finance user | ✅ Access | ❌ Denied | No record in Staff Supabase |
| Staff user | ❌ Denied | ✅ Access | No record in Finance Supabase |
| No signup | ❌ Denied | ❌ Denied | No Clerk authentication |

## Future: Cross-App Access (Feature Flags)

When you need to enable users to access BOTH apps:

### Option 1: Clerk Public Metadata (Simple)

```typescript
// When user subscribes to "Enterprise" plan
import { clerkClient } from '@clerk/nextjs/server'

await clerkClient.users.updateUserMetadata(userId, {
  publicMetadata: {
    app_access: {
      finance: true,
      staff: true, // Enable staff access for enterprise users
    },
    subscription_tier: 'enterprise'
  }
})

// In your pages
const user = await currentUser()
const hasStaffAccess = user?.publicMetadata?.app_access?.staff === true

if (!hasStaffAccess) {
  // Check if user exists in Staff Supabase
  // If not, create their profile
  await createStaffProfile(userId)
}
```

### Option 2: Supabase Feature Flags Table (Advanced)

```sql
-- In BOTH Supabase projects (Finance and Staff)
CREATE TABLE user_app_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_user_id TEXT NOT NULL UNIQUE,
  finance_access BOOLEAN DEFAULT false,
  staff_access BOOLEAN DEFAULT false,
  subscription_tier TEXT, -- 'free', 'pro', 'enterprise'
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by TEXT, -- admin who granted access

  CONSTRAINT valid_subscription_tier CHECK (
    subscription_tier IN ('free', 'pro', 'enterprise')
  )
);

-- Enable RLS
ALTER TABLE user_app_access ENABLE ROW LEVEL SECURITY;

-- Users can read their own access
CREATE POLICY "Users can read own access"
  ON user_app_access FOR SELECT
  TO authenticated
  USING (clerk_user_id = auth.jwt()->>'sub');
```

```typescript
// Check cross-app access
const { data: access } = await supabase
  .from('user_app_access')
  .select('finance_access, staff_access, subscription_tier')
  .eq('clerk_user_id', userId)
  .single()

if (access?.staff_access) {
  // User has explicit permission to access staff app
  // Automatically create their staff profile if needed
  await ensureStaffProfileExists(userId)
}
```

## Benefits of Current Approach

✅ **Simple**: No feature flags needed, just check if user exists
✅ **Secure**: Each app only trusts its own database
✅ **Scalable**: Easy to add more apps (finance, staff, admin, etc.)
✅ **Clear separation**: No confusion about which users belong where
✅ **Future-proof**: Easy to add Clerk metadata or Supabase tables later

## Migration Path to Cross-App Access

When you need users to access multiple apps:

1. **Add Clerk metadata** (5 minutes):
   - Update user metadata when granting access
   - Check metadata in pages before creating profiles

2. **Or create Supabase table** (30 minutes):
   - Add `user_app_access` table to both databases
   - Update access checks to query this table
   - Build admin UI to manage access

3. **Automatic profile creation**:
   - When user has access but no profile, create one
   - Sync profile data between apps if needed

## Security Considerations

### ✅ What We Have
- Clerk handles authentication (secure)
- Each app validates against its own database (secure)
- No way for staff users to access finance data (secure)
- Clear audit trail (who signed up where)

### ⚠️ What to Watch
- Don't trust client-side checks (always validate server-side)
- Don't expose sensitive Supabase keys (use service role key only server-side)
- Don't skip RLS policies on Supabase tables
- Monitor Clerk webhook deliveries (user creation must sync)

## Testing Checklist

- [ ] Finance user cannot access staff app (shows access denied)
- [ ] Staff user cannot access finance app (shows access denied)
- [ ] Unauthenticated user redirected to sign-in
- [ ] Clerk webhook creates user in correct Supabase project
- [ ] Access denied page displays correctly
- [ ] Sign out on one app signs out on other app (shared session)

## Summary

**Current setup is perfect for separate apps!** No feature flags needed.

- Finance users → Finance app only
- Staff users → Staff app only
- Shared Clerk session → No double login
- Enforced via Supabase database checks
- Easy to add cross-app access later with Clerk metadata

When you need cross-app access:
1. Use Clerk `publicMetadata` for simple cases
2. Use Supabase tables for complex permission rules
3. Automatically create profiles when granting access

✅ No changes needed right now - your implementation is correct!
