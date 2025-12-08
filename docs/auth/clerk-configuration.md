# Clerk Satellite Domain Configuration - Finance App

## ✅ Changes Applied (finance.hellogroot.com)

### Updated Files:
1. `src/app/[locale]/sign-in/[[...sign-in]]/page.tsx`
2. `src/app/[locale]/sign-up/[[...sign-up]]/page.tsx`

### What Changed:
- **Removed**: Embedded `<SignIn>` and `<SignUp>` Clerk components
- **Added**: Server-side redirects to centralized Account Portal (`accounts.hellogroot.com`)
- **Pattern**: Users now authenticate on `accounts.hellogroot.com` and automatically return to `finance.hellogroot.com/[locale]`

### How It Works:

```
User visits: finance.hellogroot.com/en
├─ Not authenticated
├─ Middleware detects no session
├─ User clicks "Sign In" → finance.hellogroot.com/en/sign-in
├─ Server redirects to: accounts.hellogroot.com/sign-in?redirect_url=https://finance.hellogroot.com/en
├─ User authenticates on centralized Account Portal
├─ Clerk automatically redirects back to: finance.hellogroot.com/en ✅
└─ User authenticated and stays on finance app
```

## Required Environment Variables (Vercel)

Add these to your Vercel project environment variables:

```env
# Clerk Authentication (Satellite Domain Setup)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxx
CLERK_SECRET_KEY=sk_live_xxx

# ⚠️ IMPORTANT: Must have NEXT_PUBLIC_ prefix (required by Clerk)
NEXT_PUBLIC_CLERK_SIGN_IN_URL=https://accounts.hellogroot.com/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=https://accounts.hellogroot.com/sign-up
NEXT_PUBLIC_CLERK_IS_SATELLITE=true
NEXT_PUBLIC_CLERK_DOMAIN=clerk.hellogroot.com
```

**Why NEXT_PUBLIC_ prefix is required:**
- Clerk's Next.js SDK expects these variables to be client-accessible
- Without the prefix, Clerk cannot read them in browser/middleware contexts
- Verified in `@clerk/nextjs/dist/esm/server/constants.js`:
  ```javascript
  const SIGN_IN_URL = process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || "";
  const SIGN_UP_URL = process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL || "";
  const IS_SATELLITE = isTruthy(process.env.NEXT_PUBLIC_CLERK_IS_SATELLITE) || false;
  const DOMAIN = process.env.NEXT_PUBLIC_CLERK_DOMAIN || "";
  ```

## Clerk Dashboard Configuration Checklist

### ✅ Already Configured (from screenshots):
- [x] Satellite Domains:
  - Frontend API: `clerk.hellogroot.com` (Verified)
  - Account Portal: `accounts.hellogroot.com` (Verified)
- [x] Component Paths:
  - Sign-in: Account Portal
  - Sign-up: Account Portal
  - Sign-out: Account Portal

### ⚠️ Fallback URLs (Screenshot #1 - Account Portal Redirects):
Current settings (finance-specific):
```
After sign-up fallback: https://finance.hellogroot.com/onboarding
After sign-in fallback: https://finance.hellogroot.com/en
After logo click: https://finance.hellogroot.com/home
```

**Note**: These are ONLY used when no `redirect_url` is provided in the query params. Since our app always provides `redirect_url`, these won't affect staff.hellogroot.com behavior.

## Testing Checklist

### Local Development:
- [ ] Visit `http://localhost:3000/en/sign-in`
- [ ] Verify redirect to `accounts.hellogroot.com/sign-in?redirect_url=...`
- [ ] Sign in and verify redirect back to `localhost:3000/en`
- [ ] Repeat for sign-up flow

### Production (Vercel):
- [ ] Visit `https://finance.hellogroot.com/en`
- [ ] Click "Sign In" link
- [ ] Verify redirect to `accounts.hellogroot.com`
- [ ] Complete authentication
- [ ] Verify automatic redirect back to `finance.hellogroot.com/en`
- [ ] Check that session persists (no re-authentication required)

### Cross-App Session Sharing:
- [ ] Sign in on `finance.hellogroot.com`
- [ ] Open new tab and visit `staff.hellogroot.com`
- [ ] Verify already authenticated (no login required)
- [ ] Sign out on staff app
- [ ] Verify signed out on finance app (shared session)

## Important Notes

1. **No "Allowed Redirect URLs" Configuration Needed**:
   - Satellite Domains automatically allow all subdomains under `hellogroot.com`
   - No manual whitelist required

2. **Shared Authentication State**:
   - Same Clerk instance = single user identity
   - Sign in once, authenticated everywhere

3. **App-Specific Supabase Projects**:
   - Each app can point to different Supabase projects
   - Same `clerk_user_id` synced to both projects
   - Feature management handled per-app in Supabase

4. **Production URLs are Hardcoded**:
   - For local dev, replace `https://finance.hellogroot.com` with `http://localhost:3000`
   - Or use environment variable: `process.env.NEXT_PUBLIC_APP_URL`

## Migration Path from Current Setup

**Before** (Embedded Components):
```typescript
<SignIn
  afterSignInUrl={`/${locale}`}
  appearance={{ ... }} // Custom styling
/>
```

**After** (Satellite Domain Redirect):
```typescript
redirect(
  `https://accounts.hellogroot.com/sign-in?redirect_url=${encodeURIComponent(returnUrl)}`
)
```

**Benefits**:
- ✅ Consistent auth UI across all apps
- ✅ Single place to update branding/styling
- ✅ Better session management (shared cookies)
- ✅ Easier to add new apps (just point to same Account Portal)
- ✅ Clerk-managed security updates

## Troubleshooting

### Issue: Redirect loop
**Cause**: Middleware redirecting to relative `/sign-in` instead of Account Portal
**Fix**: Ensure all redirects point to `accounts.hellogroot.com/sign-in`

### Issue: CORS errors
**Cause**: Missing domain in Clerk dashboard
**Fix**: Verify all domains configured in Clerk > Configure > Domains

### Issue: Session not persisting
**Cause**: Cookie domain mismatch
**Fix**: Ensure all apps use same root domain (`hellogroot.com`)

### Issue: Can't sign in on localhost
**Cause**: Hardcoded production URLs in code
**Fix**: Use environment variable for `NEXT_PUBLIC_APP_URL`
