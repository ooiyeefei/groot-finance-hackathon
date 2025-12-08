# Middleware & Route Protection

## Overview

FinanSEAL uses Next.js middleware for request-level authentication and authorization. The middleware runs before every request, ensuring only authenticated users can access protected routes.

## Current Implementation

### Finance App: `src/middleware.ts`

```typescript
import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Export the middleware function directly
export default clerkMiddleware()

// Middleware configuration
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    '/(api|trpc)(.*)',
  ],
}
```

### How It Works

```
1. Request arrives (e.g., /en/dashboard)
   ↓
2. Middleware matcher checks: Does this path need auth?
   ↓ Yes (not in exclusions)
3. clerkMiddleware() validates Clerk session
   ↓
4. If no valid session:
   - Client-side navigation → Redirects to sign-in
   - API request → Returns 401 Unauthorized
   ↓
5. If valid session → Request continues to page/API
   ↓
6. Page component performs additional checks:
   - Supabase user lookup (authorization)
   - Business membership validation
   - Role/permission checks
```

## Route Protection Patterns

### Public Routes (No Auth Required)

```typescript
// These routes are excluded by matcher pattern
const publicRoutes = [
  '/_next/static/*',     // Next.js static assets
  '/_next/image/*',      // Next.js image optimization
  '/favicon.ico',        // Favicon
  '/*.svg',              // SVG files
  '/*.png',              // PNG images
  '/*.jpg',              // JPEG images
  '/*.jpeg',             // JPEG images
  '/*.gif',              // GIF images
  '/*.webp',             // WebP images
]

// Sign-in/sign-up pages are accessible to unauthenticated users
// but Clerk handles the redirect logic
```

### Protected Routes (Auth Required)

All routes **not** matching the exclusion pattern require authentication:

```typescript
// Dashboard routes
'/en/dashboard'
'/en/expense-claims'
'/en/accounting'
'/en/invoices'

// Manager routes
'/en/manager/approvals'
'/en/manager/teams'
'/en/manager/categories'

// Settings routes
'/en/settings'
'/en/settings/business'

// API routes
'/api/*'
```

## Advanced Middleware Patterns

### Custom Route Protection

For more granular control, you can extend the middleware:

```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

// Define route matchers
const isPublicRoute = createRouteMatcher([
  '/:locale/sign-in(.*)',
  '/:locale/sign-up(.*)',
  '/api/webhooks(.*)',
])

const isAdminRoute = createRouteMatcher([
  '/:locale/admin(.*)',
  '/:locale/manager(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth()

  // Public routes - allow everyone
  if (isPublicRoute(req)) {
    return NextResponse.next()
  }

  // Protected routes - require auth
  if (!userId) {
    const signInUrl = new URL('/:locale/sign-in', req.url)
    signInUrl.searchParams.set('redirect_url', req.url)
    return NextResponse.redirect(signInUrl)
  }

  // Admin routes - check role (requires DB query)
  if (isAdminRoute(req)) {
    // Note: DB queries in middleware should be fast
    // Consider using Clerk metadata for role checks
    const hasAdminAccess = await checkAdminAccess(userId)

    if (!hasAdminAccess) {
      return NextResponse.redirect(new URL('/:locale/access-denied', req.url))
    }
  }

  return NextResponse.next()
})
```

## Clerk Satellite Domain Middleware

### Staff App Middleware

For apps using Satellite Domains:

```typescript
import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth()

  if (!userId) {
    // Redirect to centralized Account Portal
    const accountPortalUrl = new URL('https://accounts.hellogroot.com/sign-in')
    accountPortalUrl.searchParams.set('redirect_url', req.url)
    return NextResponse.redirect(accountPortalUrl)
  }

  // User authenticated, continue
  return NextResponse.next()
})
```

## Performance Considerations

### ⚠️ Avoid Database Queries in Middleware

```typescript
// ❌ BAD: Database queries slow down every request
export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth()
  const user = await supabase
    .from('users')
    .select('*')
    .eq('clerk_user_id', userId)
    .single() // Slow! Runs on EVERY request

  // ...
})

// ✅ GOOD: Quick checks only, defer heavy queries to pages
export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth()

  if (!userId) {
    return redirect('/sign-in')
  }

  // Let page components handle DB queries
  return NextResponse.next()
})
```

### Use Clerk Metadata for Quick Checks

```typescript
export default clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims } = await auth()

  // Role stored in Clerk metadata (no DB query!)
  const userRole = sessionClaims?.metadata?.role

  if (isAdminRoute(req) && userRole !== 'admin') {
    return NextResponse.redirect(new URL('/access-denied', req.url))
  }

  return NextResponse.next()
})
```

## Debugging Middleware

### Enable Logging

```typescript
export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth()

  console.log('[Middleware]', {
    path: req.nextUrl.pathname,
    userId: userId ? 'authenticated' : 'anonymous',
    method: req.method,
    timestamp: new Date().toISOString(),
  })

  // Your middleware logic
})
```

### Check Middleware Matcher

```bash
# Test which paths match your middleware
npm run dev

# Visit these URLs and check server logs:
http://localhost:3000/en/dashboard        # Should match
http://localhost:3000/_next/static/x.js   # Should NOT match
http://localhost:3000/api/users           # Should match
```

## Common Issues

### Issue: Infinite Redirect Loop

**Cause**: Middleware redirects to sign-in, but sign-in page also triggers middleware

```typescript
// ❌ BAD: Sign-in page requires auth
const isProtectedRoute = createRouteMatcher([
  '/:locale/(.*)', // This matches EVERYTHING including /sign-in!
])

// ✅ GOOD: Explicitly exclude auth pages
const isPublicRoute = createRouteMatcher([
  '/:locale/sign-in(.*)',
  '/:locale/sign-up(.*)',
])
```

### Issue: Static Files Being Auth-Checked

**Cause**: Middleware matcher includes static assets

```typescript
// ✅ GOOD: Exclude static files
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg)$).*)',
  ],
}
```

### Issue: API Routes Not Protected

**Cause**: API routes not included in matcher

```typescript
// ✅ GOOD: Include API routes
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
    '/(api|trpc)(.*)', // Add this line
  ],
}
```

## Testing Checklist

- [ ] Unauthenticated users redirected to sign-in
- [ ] Authenticated users can access protected routes
- [ ] Static assets load without auth check
- [ ] API routes require authentication
- [ ] Sign-in/sign-up pages accessible without auth
- [ ] Admin routes check permissions
- [ ] No infinite redirect loops
- [ ] Middleware doesn't slow down requests (<50ms)

## Best Practices

### ✅ Do

- Keep middleware logic simple and fast
- Use Clerk metadata for quick permission checks
- Defer heavy database queries to page components
- Log authentication events for debugging
- Test both authenticated and unauthenticated flows

### ❌ Don't

- Don't query database in middleware (performance impact)
- Don't redirect from middleware to the same URL (infinite loop)
- Don't forget to exclude static assets from matcher
- Don't use middleware for complex business logic
- Don't trust client-side auth checks (always validate server-side)

## Related Documentation

- [Clerk Configuration](./clerk-configuration.md) - Satellite Domain setup
- [RBAC System](./rbac.md) - Role and permission checks
- [Cross-App Access Control](./cross-app-access-control.md) - Multi-app architecture
