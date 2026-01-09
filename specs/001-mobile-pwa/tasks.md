# Tasks: Mobile-First Testing & PWA Enhancements

**Input**: Design documents from `/specs/001-mobile-pwa/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests are included in Phase 8 as mobile E2E tests using BrowserStack + Playwright (per research.md decision).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and dependency installation

- [x] T001 Install PWA dependencies: `npm install @serwist/next browser-image-compression idb`
- [x] T002 [P] Install testing dependencies: `npm install -D @playwright/test`
- [x] T003 Create public/icons/ directory structure for PWA icons
- [x] T004 [P] Create placeholder PWA icons: public/icons/icon-192.png, icon-512.png, icon-maskable-192.png, icon-maskable-512.png

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core PWA infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Service Worker Foundation

- [x] T005 Create service worker entry point in src/lib/pwa/sw.ts with @serwist/next
- [x] T006 Configure next.config.ts with withSerwist() wrapper (disable in dev mode)
- [x] T007 Create service worker registration in src/lib/pwa/service-worker.ts

### Web App Manifest

- [x] T008 Create web app manifest in public/manifest.json per data-model.md schema
- [x] T009 Add manifest link to app/layout.tsx metadata

### IndexedDB Foundation

- [x] T010 Create IndexedDB database schema in src/lib/pwa/offline-queue.ts with finanseal_pwa database
- [x] T011 [P] Create cache metadata store in src/lib/pwa/cache-manager.ts per data-model.md CacheMetadata interface

### Connectivity Infrastructure

- [x] T012 Create connectivity monitor in src/lib/pwa/connectivity-monitor.ts with online/offline event listeners

### Testing Infrastructure

- [x] T013 Configure playwright.config.ts with BrowserStack integration per research.md device matrix
- [x] T014 [P] Add BrowserStack environment variables to .env.example (BROWSERSTACK_USERNAME, BROWSERSTACK_ACCESS_KEY)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Mobile Receipt Capture (Priority: P1) 🎯 MVP

**Goal**: Field employees can photograph receipts on mobile, with client-side compression to 2MB max

**Independent Test**: Submit a receipt photo on a real mobile device and verify it processes correctly through the expense workflow

### Implementation for User Story 1

- [ ] T015 [US1] Create image compression utility in src/lib/pwa/image-compression.ts using browser-image-compression (2MB max, 1920px max dimension, 0.85 quality)
- [ ] T016 [US1] Enhance src/domains/expense-claims/components/mobile-camera-capture.tsx to integrate image compression before upload
- [ ] T017 [US1] Add camera permission denial handling in mobile-camera-capture.tsx with recovery instructions
- [ ] T018 [US1] Add flash/light assistance toggle in mobile-camera-capture.tsx for low-light environments
- [ ] T019 [US1] Add visual upload progress feedback in mobile-camera-capture.tsx
- [ ] T020 [US1] Test camera initialization on iOS Safari and Android Chrome (manual verification)

**Checkpoint**: User Story 1 (Mobile Receipt Capture) is fully functional and testable independently

---

## Phase 4: User Story 2 - Offline App Access (Priority: P1) 🎯 MVP

**Goal**: Business owners can access cached dashboard data when offline, with queued actions syncing on reconnect

**Independent Test**: Load the app with connectivity, enable airplane mode, and verify cached data displays correctly

### Implementation for User Story 2

- [ ] T021 [US2] Implement useOfflineStatus hook in src/lib/hooks/use-offline-status.ts per contracts/pwa-hooks.ts interface
- [ ] T022 [US2] Create offline-indicator.tsx component in src/components/ui/ showing offline status and pending action count
- [ ] T023 [US2] Implement queueOfflineAction function in src/lib/pwa/offline-queue.ts per contracts/pwa-hooks.ts
- [ ] T024 [US2] Implement processOfflineQueue function in src/lib/pwa/offline-queue.ts with FIFO order and retry logic (max 3 attempts)
- [ ] T025 [US2] Implement auto-sync on connectivity restore in src/lib/pwa/offline-queue.ts
- [ ] T026 [US2] Add "last synced" timestamp display in offline-indicator.tsx
- [ ] T027 [US2] Implement stale data warning (24h threshold) in src/lib/pwa/cache-manager.ts per data-model.md freshness rules
- [ ] T028 [US2] Create StaleDataWarning component in src/components/ui/stale-data-warning.tsx
- [ ] T029 [US2] Implement server-wins conflict resolution in src/lib/pwa/offline-queue.ts per contracts/offline-sync-api.ts SyncConflictDetails
- [ ] T030 [US2] Add sync success/failure toast notifications using existing toast system
- [ ] T031 [US2] Integrate offline-indicator.tsx into app shell (app/layout.tsx or root layout)

**Checkpoint**: User Story 2 (Offline App Access) is fully functional and testable independently

---

## Phase 5: User Story 3 - Add to Home Screen (PWA) (Priority: P2)

**Goal**: Frequent users can add FinanSEAL to their home screen for app-like access (browser feature, not native app)

**Independent Test**: Trigger the "Add to Home Screen" prompt on a mobile browser and verify the web app installs to the home screen with correct icon and name

### Implementation for User Story 3

- [ ] T032 [US3] Implement usePWAInstall hook in src/lib/hooks/use-pwa-install.ts per contracts/pwa-hooks.ts interface
- [ ] T033 [US3] Create pwa-install-prompt.tsx component in src/components/ui/ for Android/Chrome install prompt
- [ ] T034 [US3] Create iOS installation instructions modal in pwa-install-prompt.tsx (iOS lacks beforeinstallprompt)
- [ ] T035 [US3] Implement install prompt timing logic (show on second visit) in usePWAInstall hook
- [ ] T036 [US3] Implement prompt dismissal persistence (7-day cooldown) per data-model.md PWAInstallState
- [ ] T037 [US3] Integrate pwa-install-prompt.tsx into app shell with conditional rendering based on usePWAInstall state
- [ ] T038 [US3] Test standalone mode launch (display-mode: standalone) after installation

**Checkpoint**: User Story 3 (Add to Home Screen) is fully functional and testable independently

---

## Phase 6: User Story 4 - Expense Approval on Mobile (Priority: P2)

**Goal**: Managers can efficiently review and approve expense claims on mobile with minimal taps

**Independent Test**: Log in as a manager on a mobile device and complete an approval workflow end-to-end

### Implementation for User Story 4

- [ ] T039 [US4] Audit existing expense approval UI in src/domains/expense-claims/ for mobile responsiveness
- [ ] T040 [US4] Add notification badge for pending approvals in navigation/header
- [ ] T041 [US4] Create mobile-optimized approval card layout with larger touch targets (44x44px minimum)
- [ ] T042 [US4] Implement swipe gesture for approve/reject actions using touch events or gesture library
- [ ] T043 [US4] Add haptic feedback on approval actions (navigator.vibrate API with graceful degradation)
- [ ] T044 [US4] Reduce approval flow to maximum 2 taps (view → action)
- [ ] T045 [US4] Test approval flow on iPhone SE (320px baseline) for layout validation

**Checkpoint**: User Story 4 (Expense Approval on Mobile) is fully functional and testable independently

---

## Phase 7: User Story 5 - Mobile Dashboard Experience (Priority: P2)

**Goal**: Business owners can scan key financial metrics in under 10 seconds on mobile

**Independent Test**: Load the dashboard on iPhone SE and verify all key metrics are visible without horizontal scrolling

### Implementation for User Story 5

- [ ] T046 [US5] Audit existing dashboard in src/domains/analytics/ for mobile responsiveness at 320px viewport
- [ ] T047 [US5] Implement mobile-specific dashboard layout with stacked metrics (no horizontal scroll)
- [ ] T048 [US5] Create bottom-nav.tsx component in src/components/ui/ per contracts/pwa-hooks.ts BottomNavProps
- [ ] T049 [US5] Add touch-friendly chart tooltips (larger tap targets, appropriate positioning)
- [ ] T050 [US5] Integrate bottom-nav.tsx into mobile layout (conditional render based on viewport/device)
- [ ] T051 [US5] Ensure all dashboard elements meet 44x44px touch target minimum
- [ ] T052 [US5] Test dashboard load on iPhone SE and Samsung Galaxy A14 (manual verification)

**Checkpoint**: User Story 5 (Mobile Dashboard Experience) is fully functional and testable independently

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Testing, validation, and improvements that affect multiple user stories

### Mobile E2E Testing (BrowserStack)

- [ ] T053 [P] Create PWA installation test in tests/e2e/mobile/pwa-install.spec.ts
- [ ] T054 [P] Create offline dashboard test in tests/e2e/mobile/offline-dashboard.spec.ts
- [ ] T055 [P] Create camera capture test in tests/e2e/mobile/camera-capture.spec.ts
- [ ] T056 Run E2E tests on BrowserStack device matrix (iPhone SE, iPhone 14, Samsung Galaxy A14)

### Integration Testing

- [ ] T057 [P] Create service worker registration test in tests/integration/pwa/service-worker.test.ts
- [ ] T058 [P] Create offline queue sync test in tests/integration/pwa/offline-queue.test.ts

### Validation & Documentation

- [ ] T059 Run Lighthouse mobile audit and achieve score 80+ (per SC-003)
- [ ] T060 Validate all touch targets meet 44x44px minimum (per SC-008)
- [ ] T061 Validate no horizontal scrolling at 320px viewport (per SC-009)
- [ ] T062 Run quickstart.md validation checklist
- [ ] T063 Update CLAUDE.md with PWA implementation notes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - US1 (P1) and US2 (P1) are both MVP candidates - implement in parallel or sequentially
  - US3-US5 (P2) can follow after P1 stories
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 4 (P2)**: Can start after Foundational (Phase 2) - Benefits from US2 offline indicator but not blocking
- **User Story 5 (P2)**: Can start after Foundational (Phase 2) - No dependencies on other stories

### Within Each User Story

- Infrastructure tasks before UI components
- Core functionality before enhancements
- Manual verification before moving to next story

### Parallel Opportunities

- T001 and T002 can run in parallel (different dependency groups)
- T003 and T004 can run in parallel (directory creation vs file creation)
- T010 and T011 can run in parallel (different IndexedDB stores)
- T013 and T014 can run in parallel (config file vs env variables)
- All Phase 8 test tasks marked [P] can run in parallel
- US1 and US2 can be worked on in parallel after Phase 2 completion

---

## Parallel Example: Foundational Phase

```bash
# After T005-T009 (sequential service worker setup):
# Launch IndexedDB and cache manager in parallel:
Task T010: "Create IndexedDB database schema in src/lib/pwa/offline-queue.ts"
Task T011: "Create cache metadata store in src/lib/pwa/cache-manager.ts"

# Launch testing config in parallel:
Task T013: "Configure playwright.config.ts with BrowserStack"
Task T014: "Add BrowserStack environment variables to .env.example"
```

## Parallel Example: MVP Stories (P1)

```bash
# After Foundational phase complete, launch both P1 stories:
# Developer A: User Story 1 (Mobile Receipt Capture)
Task T015: "Create image compression utility..."
Task T016: "Enhance mobile-camera-capture.tsx..."

# Developer B: User Story 2 (Offline App Access)
Task T021: "Implement useOfflineStatus hook..."
Task T022: "Create offline-indicator.tsx..."
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Mobile Receipt Capture)
4. Complete Phase 4: User Story 2 (Offline App Access)
5. **STOP and VALIDATE**: Test both P1 stories independently
6. Deploy/demo if ready - this is MVP!

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Core camera works
3. Add User Story 2 → Test independently → Offline access works (MVP!)
4. Add User Story 3 → Test independently → PWA installable
5. Add User Story 4 → Test independently → Mobile approvals work
6. Add User Story 5 → Test independently → Dashboard optimized
7. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (Camera)
   - Developer B: User Story 2 (Offline)
3. After P1 complete:
   - Developer A: User Story 3 (PWA Install)
   - Developer B: User Story 4 (Approvals)
   - Developer C: User Story 5 (Dashboard)
4. Stories complete and integrate independently

---

## Summary

| Phase | Tasks | Stories | Parallel Opportunities |
| ----- | ----- | ------- | ---------------------- |
| Setup | T001-T004 | - | 2 pairs |
| Foundational | T005-T014 | - | 3 pairs |
| US1 (P1) | T015-T020 | Mobile Receipt Capture | 1 (after foundation) |
| US2 (P1) | T021-T031 | Offline App Access | 1 (after foundation) |
| US3 (P2) | T032-T038 | Add to Home Screen | 1 (after foundation) |
| US4 (P2) | T039-T045 | Expense Approval Mobile | 1 (after foundation) |
| US5 (P2) | T046-T052 | Mobile Dashboard | 1 (after foundation) |
| Polish | T053-T063 | - | 4 pairs (tests) |

**Total Tasks**: 63
**MVP Scope**: Phase 1-4 (28 tasks) = Setup + Foundation + US1 + US2
**Suggested First Milestone**: Complete through Phase 4, validate Lighthouse score

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- iOS limitations: No beforeinstallprompt, no background sync - use feature detection and graceful degradation
