# Tasks: Capacitor Mobile App (iOS)

**Input**: Design documents from `/specs/001-capacitor-mobile-app/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: No automated test tasks — validation is manual via TestFlight and iOS Simulator per the spec.

**Organization**: Tasks grouped by user story. Each story is independently implementable after foundational phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install Capacitor, generate iOS project, create core configuration

- [x] T001 Install Capacitor core packages: `npm install @capacitor/core @capacitor/cli @capacitor/ios`
- [x] T002 Install Capacitor plugins: `npm install @capacitor/camera @capacitor/push-notifications @capacitor/app @capacitor/browser @capacitor/status-bar @capacitor/splash-screen @capacitor/preferences`
- [x] T003 Initialize Capacitor project: `npx cap init "FinanSEAL" "com.hellogroot.finanseal" --web-dir public`
- [x] T004 Create `capacitor.config.ts` at project root with remote URL (`server.url: https://app.finanseal.com`), `allowNavigation` for Convex/Clerk domains, `CapacitorCookies` and `CapacitorHttp` enabled, and plugin configuration per quickstart.md
- [x] T005 Create minimal `public/index.html` fallback for Capacitor `webDir` (loads when remote URL is unreachable)
- [x] T006 Add iOS platform: `npx cap add ios && npx cap sync ios` — **automated in `scripts/setup-ios.sh`**
- [ ] T007 Open Xcode project (`npx cap open ios`), set signing team, set deployment target to iOS 16.0, configure bundle ID `com.hellogroot.finanseal` **[MANUAL — requires Xcode UI]**
- [ ] T008 Add app icons (1024x1024 + required sizes) and splash screen assets in Xcode project `ios/App/App/Assets.xcassets/` **[MANUAL — requires design assets]**
- [x] T009 Update `.gitignore` to include `ios/App/Pods/`, `ios/App/App/public/`, and other Capacitor-generated artifacts that should not be tracked

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core utilities and PWA behavior adjustments that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T010 Create `src/lib/capacitor/platform.ts` — export `isNativePlatform()`, `getPlatform()`, and `isIOS()` utility functions using `@capacitor/core` Capacitor API
- [x] T011 [P] Modify `src/components/ui/pwa-install-prompt.tsx` — add early return when `isNativePlatform()` is true to suppress PWA install prompt in Capacitor context
- [x] T012 [P] Modify `src/lib/hooks/use-pwa-install.ts` — skip all PWA install logic (deferred prompt, install detection) when running inside Capacitor
- [ ] T013 Verify app loads correctly in iOS Simulator: run `npx cap run ios`, confirm the Vercel-hosted app loads in WebView, navigation works, and no console errors **[MANUAL — requires macOS with Xcode]**
- [ ] T014 Verify Convex real-time subscriptions work in WebView: open the app on iOS Simulator, create/modify data in another tab, confirm the mobile app updates in real-time **[MANUAL — requires macOS with Xcode]**
- [ ] T015 Verify existing offline indicator and service worker behavior in Capacitor WebView: disconnect network on simulator, confirm offline.html fallback or offline indicator appears **[MANUAL — requires macOS with Xcode]**

**Checkpoint**: Foundation ready — Capacitor shell loads FinanSEAL, PWA prompts suppressed, real-time sync verified

---

## Phase 3: User Story 1 — Access FinanSEAL via Native Mobile App (Priority: P1) MVP

**Goal**: All existing FinanSEAL features work identically in the Capacitor iOS shell, including authentication (email/password + OAuth), session persistence, and native look-and-feel.

**Independent Test**: Install via TestFlight, log in, navigate expenses/invoices/analytics/chat/settings. All features work identically to web.

### Implementation for User Story 1

- [x] T016 [US1] Create `src/lib/capacitor/auth-bridge.ts` — detect OAuth sign-in attempts in Capacitor context, open OAuth URL via `Browser.open()` (SFSafariViewController), listen for `appUrlOpen` callback, parse auth tokens, call Clerk `setActive()`
- [x] T017 [US1] Register `finanseal://` custom URL scheme in `ios/App/App/Info.plist` for OAuth callback deep links — **automated in `scripts/setup-ios.sh`**
- [x] T018 [US1] Install `@capacitor/browser`: `npm install @capacitor/browser && npx cap sync ios`
- [x] T019 [US1] Integrate auth bridge into the Clerk sign-in flow — created `NativeSignIn`/`NativeSignUp` components in `src/components/capacitor/native-sign-in.tsx`, modified sign-in/sign-up pages to conditionally use native components when `isNativePlatform()` is true
- [x] T020 [US1] Configure `@capacitor/status-bar` in `capacitor.config.ts` and add initialization in app entry — set status bar style for light/dark mode (FR-008)
- [x] T021 [US1] Configure `@capacitor/splash-screen` — set `launchAutoHide: false` in config, add manual `SplashScreen.hide()` call after app content is interactive (FR-007)
- [ ] T022 [US1] Verify email/password sign-in flow works directly in WebView (no bridge needed — Clerk form submits within same origin) **[MANUAL — requires device testing]**
- [ ] T023 [US1] Verify Google OAuth flow end-to-end on physical iOS device **[MANUAL — requires device testing]**
- [ ] T024 [US1] Verify session persistence **[MANUAL — requires device testing]**
- [ ] T025 [US1] Verify all major features on iOS Simulator **[MANUAL — requires macOS with Xcode]**
- [x] T026 [US1] Run existing web app build (`npm run build`) to confirm no regressions introduced by Capacitor packages or code changes (FR-010)

**Checkpoint**: User Story 1 complete — all existing features work in Capacitor shell with full auth support

---

## Phase 4: User Story 2 — Capture Receipts with Native Camera (Priority: P2)

**Goal**: Receipt capture uses the native iOS camera with full device resolution instead of the browser camera API.

**Independent Test**: Open expense submission, tap camera, native camera opens, capture receipt at full resolution.

### Implementation for User Story 2

- [x] T027 [P] [US2] Create `src/lib/capacitor/camera-bridge.ts` — export `capturePhoto()` that uses `Camera.getPhoto()` (quality: 90, `CameraResultType.Uri`, `CameraSource.Camera`) on native, delegates to existing `getUserMedia()` on web
- [x] T028 [US2] Modify `src/domains/expense-claims/components/mobile-camera-capture.tsx` — import camera bridge, conditionally use native camera when `isNativePlatform()`, preserve all existing browser camera functionality for web users
- [x] T029 [US2] Add `NSCameraUsageDescription` to `ios/App/App/Info.plist` — **automated in `scripts/setup-ios.sh`**
- [x] T030 [US2] Handle camera permission denial in camera-bridge.ts — detect `denied` permission state, display clear message with instructions to enable in iOS Settings, provide deep link to Settings app
- [x] T031 [US2] Run `npx cap sync ios` to sync camera plugin to native project — **automated in `scripts/setup-ios.sh`**
- [ ] T032 [US2] Verify on physical iOS device **[MANUAL — requires device testing]**
- [ ] T033 [US2] Verify web regression: open expense submission on web browser **[MANUAL — requires device testing]**

**Checkpoint**: User Story 2 complete — native camera for receipts, web camera unchanged

---

## Phase 5: User Story 3 — Receive Push Notifications for Approvals (Priority: P3)

**Goal**: Managers receive push notifications on iOS when expense claims require their approval. Tapping the notification opens the relevant approval.

**Independent Test**: Submit expense as employee, verify approver receives push notification on iOS device, tap to open approval.

### Backend — Schema & Functions

- [x] T034 [US3] Add `push_subscriptions` table to `convex/schema.ts` with fields: userId (v.id("users")), businessId (v.id("businesses")), platform (v.literal("ios")), deviceToken (v.string()), isActive (v.boolean()), createdAt (v.number()), updatedAt (v.number()). Add indexes: by_userId, by_deviceToken, by_userId_platform
- [x] T035 [US3] Add `app_versions` table to `convex/schema.ts` with fields: platform (v.literal("ios")), minimumVersion (v.string()), latestVersion (v.string()), forceUpdateMessage (v.string()), softUpdateMessage (v.string()), updatedAt (v.number()), updatedBy (v.id("users")). Add index: by_platform
- [x] T036 [US3] Run `npx convex deploy --yes` to deploy schema changes to production
- [x] T037 [P] [US3] Create `convex/functions/pushSubscriptions.ts` — implement `register` public mutation (upsert by userId+platform+deviceToken), `unregister` public mutation (set isActive=false), and `getByUserId` internal query per contracts/push-subscriptions.md
- [x] T038 [P] [US3] Create `convex/functions/appVersions.ts` — implement `getAppVersion` public query (by platform) and `updateAppVersion` mutation (admin-only) per contracts/push-subscriptions.md
- [x] T039 [US3] Modify `convex/functions/notifications.ts` — after creating a notification of type `approval`, schedule `sendPushNotification` internalAction via `ctx.scheduler.runAfter(0, ...)` to send push to all active subscriptions for the recipient user
- [x] T040 [US3] Run `npx convex deploy --yes` to deploy function changes to production

### Backend — APNs Infrastructure

- [x] T041 [P] [US3] Create `infra/lib/apns-stack.ts` (CDK) — define SSM parameters: `/finanseal/prod/apns-private-key` (SecureString), `/finanseal/prod/apns-key-id` (String), `/finanseal/prod/apns-team-id` (String)
- [ ] T042 [US3] Deploy CDK stack: `cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2` **[MANUAL — requires AWS credentials]**
- [ ] T043 [US3] Create APNs authentication key (P8) in Apple Developer Portal **[MANUAL — requires Apple Developer Portal access]**

### Backend — API Route

- [x] T044 [US3] Create `src/app/api/v1/notifications/send-push/route.ts` — implement POST handler per contracts/send-push.md: validate request, retrieve APNs credentials from SSM (cached), sign JWT with ES256, send HTTP/2 POST to `api.push.apple.com`, handle error codes (410→deactivate subscription, 429→retry)

### Client — Capacitor Push Registration

- [x] T045 [US3] Create `src/lib/capacitor/push-notifications.ts` — implement `initPushNotifications()`: request permissions, call `PushNotifications.register()`, listen for `registration` event to get device token, send token to Convex `pushSubscriptions.register` mutation
- [x] T046 [US3] Add push notification listener for `pushNotificationActionPerformed` in `src/lib/capacitor/push-notifications.ts` — extract `resourceUrl` from notification data, navigate to corresponding route in WebView
- [x] T047 [US3] Call `initPushNotifications()` on app launch (in layout or provider) when `isNativePlatform()` is true — wired in `CapacitorProvider.tsx`
- [x] T048 [US3] Enable Push Notifications capability in Xcode project — **automated in `scripts/setup-ios.sh`** (aps-environment entitlement)
- [x] T049 [US3] Add `NSUserNotificationUsageDescription` to `ios/App/App/Info.plist` — **automated in `scripts/setup-ios.sh`**
- [x] T050 [US3] Run `npx cap sync ios` to sync push notification plugin to native project — **automated in `scripts/setup-ios.sh`**
- [ ] T051 [US3] Verify full push flow on physical device **[MANUAL — requires device testing]**
- [ ] T052 [US3] Verify notification permission denial **[MANUAL — requires device testing]**
- [ ] T053 [US3] Verify background/killed notification **[MANUAL — requires device testing]**

**Checkpoint**: User Story 3 complete — push notifications for approvals, full APNs pipeline working

---

## Phase 6: User Story 5 — Navigate to App Content via Deep Links (Priority: P5)

**Goal**: External URLs from email or shared links open directly to in-app content when the FinanSEAL app is installed.

**Independent Test**: Tap a FinanSEAL link on a device with the app installed → app opens to correct content.

### Implementation for User Story 5

- [x] T054 [US5] Configure Associated Domains capability in Xcode — **automated in `scripts/setup-ios.sh`** (App.entitlements)
- [x] T055 [US5] Create `public/.well-known/apple-app-site-association` file (AASA) on Vercel — configure to match all URL paths to the app bundle ID `com.hellogroot.finanseal`
- [x] T056 [US5] Create `src/lib/capacitor/deep-links.ts` — listen for `App.addListener('appUrlOpen', ...)`, parse incoming URL path, navigate WebView to corresponding Next.js route
- [x] T057 [US5] Run `npx cap sync ios` to sync Associated Domains configuration — **automated in `scripts/setup-ios.sh`**
- [ ] T058 [US5] Verify deep link on physical device **[MANUAL — requires device testing]**
- [ ] T059 [US5] Verify fallback **[MANUAL — requires device testing]**

**Checkpoint**: User Story 5 complete — deep links resolve to in-app content

---

## Phase 7: User Story 4 — Install from App Store (Priority: P4)

**Goal**: FinanSEAL is published on the Apple App Store and discoverable by users.

**Independent Test**: Search "FinanSEAL" in the App Store, install, complete login-to-expense-submission flow.

**Note**: This phase depends on all prior stories being complete and validated. US4 is the distribution milestone.

### Implementation for User Story 4

- [ ] T060 [US4] Create app in App Store Connect **[MANUAL — requires Apple Developer Portal]**
- [ ] T061 [US4] Prepare App Store metadata **[MANUAL — requires App Store Connect]**
- [ ] T062 [P] [US4] Generate App Store screenshots **[MANUAL — requires device screenshots]**
- [ ] T063 [P] [US4] Configure App Privacy labels in App Store Connect **[MANUAL — requires App Store Connect]**
- [ ] T064 [US4] Archive app in Xcode **[MANUAL — requires Xcode on macOS]**
- [ ] T065 [US4] Distribute TestFlight build to internal team **[MANUAL — requires App Store Connect]**
- [ ] T066 [US4] Internal team runs through all acceptance scenarios **[MANUAL — requires physical devices]**
- [ ] T067 [US4] Fix any issues found during TestFlight beta testing **[MANUAL — iterative]**
- [ ] T068 [US4] Fill in App Store review information **[MANUAL — requires App Store Connect]**
- [ ] T069 [US4] Submit app for App Store review **[MANUAL — requires App Store Connect]**
- [ ] T070 [US4] Address any App Store rejection feedback **[MANUAL — iterative]**

**Checkpoint**: User Story 4 complete — FinanSEAL available in the Apple App Store

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Update mechanism, crash monitoring, and production hardening

- [x] T071 [P] Create `src/lib/capacitor/update-checker.ts` — on app launch, query `appVersions.getAppVersion` from Convex, compare native app version (via `@capacitor/app` `App.getInfo()`) against `minimumVersion` and `latestVersion`, return update status (force/soft/none)
- [x] T072 [P] Create `src/components/ui/app-update-prompt.tsx` — two variants: (1) full-screen blocking modal for force update with "Update Now" button linking to App Store, (2) dismissible banner for soft update with "Update" and "Later" actions
- [x] T073 Integrate update checker into app initialization — wired in `CapacitorProvider.tsx`, queries Convex `appVersions.getAppVersion`, renders `ForceUpdatePrompt` or `SoftUpdateBanner`
- [ ] T074 [P] Install Sentry Capacitor: `npm install @sentry/capacitor@^2.4.1 && npx cap sync ios` **[BLOCKED — @sentry/capacitor@2.x incompatible with @sentry/nextjs@^9.47.1]**
- [x] T075 [P] Create `src/lib/capacitor/sentry-init.ts` — conditional Sentry initialization (stub — version compat deferred)
- [ ] T076 Create separate Sentry project `finanseal-mobile` in Sentry **[MANUAL — requires Sentry access]**
- [ ] T077 Add Xcode build phase for dSYM upload **[MANUAL — requires Xcode on macOS]**
- [ ] T078 Verify crash monitoring **[MANUAL — requires device testing]**
- [x] T079 Run `npm run build` to confirm final build passes with all changes — no TypeScript errors, no lint failures (FR-010, build-fix loop)
- [x] T080 Seed initial `app_versions` record in Convex for platform "ios" — `getAppVersion` returns defaults (1.0.0) when no record exists, so no manual seeding needed

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — core shell + auth must work first
- **US2 (Phase 4)**: Depends on Foundational — can run in parallel with US1 (different files)
- **US3 (Phase 5)**: Depends on Foundational — can run in parallel with US1/US2 (backend + client, different files)
- **US5 (Phase 6)**: Depends on Foundational — can run in parallel with US1/US2/US3
- **US4 (Phase 7)**: Depends on US1, US2, US3, US5 all being complete — this is the App Store submission
- **Polish (Phase 8)**: Can start after Foundational; crash monitoring and update mechanism are independent of user stories

### User Story Dependencies

- **US1 (P1 — Core App)**: No story dependencies. Foundational phase provides the shell.
- **US2 (P2 — Camera)**: Independent of US1. Only needs Capacitor shell (foundational).
- **US3 (P3 — Push)**: Independent of US1/US2. Builds on existing Convex notification system. Notification tap uses deep link handler (can be simple initially, refined in US5).
- **US5 (P5 — Deep Links)**: Independent of US1/US2/US3. Pure configuration + URL handler.
- **US4 (P4 — App Store)**: Depends on ALL other stories being complete and tested. This is the distribution gate.

### Within Each User Story

- Schema changes before functions (T034-T036 before T037-T040)
- Infrastructure before API routes (T041-T043 before T044)
- Backend before client (T037-T044 before T045-T050)
- Implementation before verification (all impl tasks before test/verify tasks)

### Parallel Opportunities

**After Foundational phase, these can run simultaneously (different files, no conflicts)**:
- US1 auth bridge (`src/lib/capacitor/auth-bridge.ts`) — Developer A
- US2 camera bridge (`src/lib/capacitor/camera-bridge.ts`) — Developer A (or B)
- US3 backend (Convex schema + functions + API route) — Developer B
- US5 deep links (Xcode config + AASA file + URL handler) — Developer C
- Polish: crash monitoring (`src/lib/capacitor/sentry-init.ts`) — Developer C

**Within US3 (Push Notifications), parallel opportunities**:
- T037 pushSubscriptions.ts and T038 appVersions.ts — different files, parallel
- T041 apns-stack.ts (CDK) and T037-T038 (Convex functions) — different systems, parallel
- T044 API route and T045 client push registration — different layers, but API route should be done first

---

## Parallel Example: After Foundational Phase

```bash
# Developer A — auth + camera (US1 + US2):
Task: T016 [US1] Create auth-bridge.ts
Task: T027 [US2] Create camera-bridge.ts    # [P] — different file

# Developer B — push notification backend (US3):
Task: T034 [US3] Add push_subscriptions table to schema
Task: T041 [US3] Create apns-stack.ts CDK    # [P] — different system
Task: T037 [US3] Create pushSubscriptions.ts  # [P] — after schema deploy

# Developer C — deep links + monitoring (US5 + Polish):
Task: T054 [US5] Configure Associated Domains in Xcode
Task: T074 Install @sentry/capacitor          # [P] — different concern
Task: T075 Create sentry-init.ts              # [P] — different file
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T009)
2. Complete Phase 2: Foundational (T010-T015)
3. Complete Phase 3: User Story 1 — Core App (T016-T026)
4. **STOP and VALIDATE**: App loads, auth works (email + OAuth), all features accessible
5. Deploy to TestFlight for internal validation

### Incremental Delivery

1. Setup + Foundational → Capacitor shell loads FinanSEAL
2. US1 (Core App + Auth) → Full app works in native shell → TestFlight (MVP!)
3. US2 (Native Camera) → Receipt capture upgraded → TestFlight update
4. US3 (Push Notifications) → Approval alerts working → TestFlight update
5. US5 (Deep Links) → External links resolve in-app → TestFlight update
6. US4 (App Store) → All stories validated → Submit to Apple
7. Polish → Update mechanism + crash monitoring → Post-launch update

### Critical Path

```
Setup → Foundational → US1 (auth) → US4 (App Store submission)
                     → US2 (camera) ↗
                     → US3 (push)   ↗
                     → US5 (links)  ↗
                     → Polish       → Post-launch update
```

US4 is the convergence point — all stories must be complete before App Store submission.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps each task to its user story for traceability
- No automated tests — validation is manual via TestFlight per spec and clarification decisions
- `npx convex deploy --yes` is MANDATORY after any Convex schema or function changes (T036, T040)
- `npx cap sync ios` is required after any npm package install or Capacitor config change
- Apple Developer Portal tasks (T043 APNs key, T060 App Store Connect) require manual action in Apple's web interface
- Commit after each task or logical group. Follow git author rules from CLAUDE.md
