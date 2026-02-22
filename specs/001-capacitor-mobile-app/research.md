# Research: Capacitor Mobile App (iOS)

**Branch**: `001-capacitor-mobile-app` | **Date**: 2026-02-21

## R-001: Capacitor + Next.js SSR Integration

**Decision**: Use remote URL approach — Capacitor WebView loads the live Vercel-hosted Next.js app via `server.url` configuration.

**Rationale**: FinanSEAL depends on Clerk middleware (route protection, session management), server actions (5MB body size for file uploads), `next-intl` i18n plugin, and Sentry server-side monitoring. All of these require Next.js server-side rendering. Static export (`output: 'export'`) strips all of these capabilities and is not viable.

**Alternatives considered**:
- **Static export (`webDir: 'out'`)**: Officially supported Capacitor path but eliminates middleware, API routes, server components, i18n routing, and image optimization. Not viable.
- **Self-hosted Next.js server bundled in app**: Theoretically possible but extreme complexity, no community support, and defeats the purpose of using Vercel.

**Key implications**:
- App requires internet connectivity for initial load (offline handled by service worker cache after first load)
- `server.url` set to production Vercel URL (e.g., `https://app.finanseal.com`)
- `allowNavigation` must include `*.convex.cloud` (WebSocket), `*.clerk.accounts.dev` (auth)
- `CapacitorCookies` plugin must be enabled for Clerk session cookie handling
- A minimal `webDir` with `offline.html` is still required as error fallback
- Next.js middleware runs normally (server-side, not affected by WebView)
- Convex WebSocket subscriptions work in WKWebView (iOS supports WebSockets natively)

**App Store risk**: Apple guideline 4.2 requires apps to provide value beyond a repackaged website. Mitigation: native camera, push notifications, deep linking, crash monitoring, and status bar integration provide sufficient native functionality.

---

## R-002: Clerk Authentication in Capacitor WebView

**Decision**: Email/password sign-in works directly in WebView. OAuth flows (Google, GitHub, etc.) must use `@capacitor/browser` to open `SFSafariViewController`, with a custom deep link callback to return to the app.

**Rationale**: Google explicitly blocks OAuth in embedded WebViews (security policy). Other providers are trending the same direction. Clerk has no official Capacitor SDK — the web SDK (`@clerk/nextjs`) runs in the WebView, but OAuth redirects must be intercepted and routed through a system browser.

**Alternatives considered**:
- **OAuth directly in WebView**: Blocked by Google policy; other providers unreliable.
- **Token-based approach (authenticate externally, pass token via URL scheme)**: More complex; requires custom Clerk session management outside the WebView.
- **Disable OAuth entirely (email/password only on mobile)**: Simplest but degrades UX for users who signed up via Google/GitHub OAuth.

**Implementation approach**:
1. Detect Capacitor environment (`Capacitor.isNativePlatform()`)
2. Intercept OAuth sign-in button clicks in the Capacitor context
3. Open Clerk OAuth URL via `@capacitor/browser` (uses `SFSafariViewController`)
4. Configure custom URL scheme (`finanseal://`) or Universal Link for OAuth callback
5. Handle `appUrlOpen` event in Capacitor to capture the callback
6. Parse auth tokens and call Clerk's `setActive()` to establish the session
7. Enable `CapacitorCookies` plugin for first-party session cookie persistence

**Risks**:
- Clerk has no official guidance for this pattern — custom integration requires maintenance
- Session cookies in WKWebView may hit 7-day ITP cap (WebKit Intelligent Tracking Prevention)
- Cookie persistence across app cold starts needs testing

---

## R-003: iOS Push Notification Pipeline

**Decision**: Direct APNs HTTP/2 via a Next.js API route, triggered by Convex scheduled `internalAction`. APNs authentication key (P8) stored in AWS SSM Parameter Store.

**Rationale**: Direct APNs is the simplest and cheapest approach for Phase 1 (iOS only, < 1000 users). APNs is free, SSM is free (standard tier), and the pattern mirrors the existing email notification pipeline (Convex → API route → AWS SES). FCM adds unnecessary Firebase dependency for iOS-only scope.

**Alternatives considered**:
- **Firebase Cloud Messaging (FCM)**: Unified iOS/Android API but adds Firebase dependency. Better suited for Phase 2 when Android is added.
- **AWS SNS**: Stays in AWS ecosystem but more complex setup and additional cost for this scale.
- **Convex action calling APNs directly**: Convex actions support `fetch()` but APNs requires HTTP/2, which may not be supported in the Convex runtime. Routing through an API route avoids this uncertainty.

**Notification flow**:
```
Expense submitted for approval
    → Convex notifications.create mutation (existing)
    → ctx.scheduler.runAfter → sendPushNotification internalAction (new)
    → fetch POST to /api/v1/notifications/send-push (new)
    → Next.js API route signs JWT, sends HTTP/2 POST to api.push.apple.com
    → APNs delivers to iOS device
```

**New infrastructure needed**:
- Convex `push_subscriptions` table (device token storage)
- Convex mutations: register/unregister device tokens
- Convex `internalAction`: sendPushNotification
- Next.js API route: `/api/v1/notifications/send-push`
- AWS SSM parameters: APNs private key, key ID, team ID
- Apple Developer setup: APNs key (P8), App ID with Push Notifications capability

**Cost**: Effectively $0 (APNs free, SSM standard tier free, API route negligible)

---

## R-004: Crash Monitoring

**Decision**: Use `@sentry/capacitor@^2.4.1` with a separate Sentry project (`finanseal-mobile`) under the existing `finanseal` org.

**Rationale**: Sentry is already integrated (`@sentry/nextjs@^9.47.1`). The `@sentry/capacitor` v2.x line is compatible with the existing Sentry JS SDK v9.x, avoiding a breaking major version upgrade. This gives native iOS crash reporting, ANR detection, and JavaScript error capture with minimal new dependencies.

**Alternatives considered**:
- **@sentry/capacitor@3.0.0**: Requires upgrading `@sentry/nextjs` from v9 to v10 (breaking change affecting the web app). Not worth the risk for this feature.
- **Firebase Crashlytics**: Excellent native crash reporting but new vendor, no unified view with existing Sentry web errors, adds Firebase dependency.
- **Defer entirely**: Rely on App Store crash reports only. Insufficient for production monitoring (no stack traces, no breadcrumbs, delayed reporting).

**Implementation**:
1. Install `@sentry/capacitor@^2.4.1` (compatible with existing `@sentry/nextjs@^9`)
2. Create `finanseal-mobile` Sentry project (same org, separate DSN)
3. Conditional initialization: use `@sentry/capacitor` when `Capacitor.isNativePlatform()`, fall back to standard `@sentry/nextjs` on web
4. Add Xcode build phase for dSYM upload (native crash symbolication)
5. Add source map upload step in build pipeline

---

## R-005: Existing Codebase Integration Points

**Decision**: Document the key files and patterns in the existing codebase that the Capacitor integration touches.

**Existing PWA infrastructure** (reusable):
- Service worker: `src/lib/pwa/sw.ts` (Serwist, handles precaching and offline fallback)
- PWA manifest: `public/manifest.json` (standalone display, portrait orientation)
- Offline fallback: `public/offline.html`
- Install prompt: `src/components/ui/pwa-install-prompt.tsx` (should be suppressed in Capacitor context)
- Mobile app shell: `src/components/ui/mobile-app-shell.tsx` (bottom navigation, role-based items)

**Camera capture** (needs Capacitor bridge):
- File: `src/domains/expense-claims/components/mobile-camera-capture.tsx`
- Current approach: `getUserMedia()` browser API with 1920x1080 constraints
- Capacitor approach: Detect native platform and use `@capacitor/camera` instead

**Notification system** (extend for push):
- Existing tables: `notifications`, `notification_digests` in Convex schema
- Existing mutations: `convex/functions/notifications.ts` (create, markAsRead, etc.)
- Existing email pipeline: Convex → API route → AWS SES
- Push follows identical pattern: Convex → API route → APNs

**Authentication** (needs OAuth bridge):
- Middleware: `src/middleware.ts` (clerkMiddleware, route protection)
- Provider: `ClerkProviderWrapper` in layout
- Impact: OAuth flows need interception in Capacitor context

**Build configuration**:
- `next.config.ts`: Serwist PWA plugin, Sentry plugin, image optimization
- No `output: 'export'` (SSR mode, deployed to Vercel)
- Build scripts: `npm run build` triggers `convex:deploy:ci` then Next.js build
