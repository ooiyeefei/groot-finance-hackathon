# Tasks: Error Logging & Monitoring (Sentry Integration)

**Feature Branch**: `003-sentry-integration`
**Input**: Design documents from `/specs/003-sentry-integration/`
**GitHub Issue**: [#82](https://github.com/grootdev-ai/finanseal-mvp/issues/82)

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/webhook-api.yaml, quickstart.md

**Tests**: Not explicitly requested in spec - test tasks omitted. Manual verification via quickstart.md scenarios.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

**Note**: Sentry API key available in `.env.local` (`SENTRY_API_KEY`) with full scopes for programmatic configuration.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Exact file paths included in descriptions

## Path Conventions

Based on plan.md structure (Next.js 15 App Router):
- Sentry configs: `src/` root (per Next.js convention)
- Domain code: `src/domains/system/lib/`
- API routes: `src/app/api/v1/system/webhooks/`
- Error boundaries: `src/app/`
- Trigger.dev tasks: `src/trigger/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install SDK, configure environment, basic project setup

- [x] T001 Install `@sentry/nextjs` package via `npm install @sentry/nextjs`
- [x] T002 [P] Add Sentry environment variables to `.env.example` (NEXT_PUBLIC_SENTRY_DSN, SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT)
- [x] T003 [P] Create `src/domains/system/` directory structure with `lib/` subdirectory
- [x] T004 [P] Create `src/domains/system/CLAUDE.md` documenting system domain purpose

**Checkpoint**: SDK installed, environment structure ready

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core Sentry SDK initialization that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Create `sentry.client.config.ts` at project root with basic DSN configuration
- [x] T006 [P] Create `sentry.server.config.ts` at project root with server-side configuration
- [x] T007 [P] Create `sentry.edge.config.ts` at project root with edge runtime configuration
- [x] T008 Create `src/instrumentation.ts` to initialize Sentry on server startup
- [x] T009 Wrap `next.config.ts` with `withSentryConfig` for source map upload
- [x] T010 Run `npm run build` to verify SDK integration and source map upload succeeds

**Checkpoint**: Foundation ready - Sentry SDK initialized on client, server, and edge. Source maps uploading. User story implementation can begin.

---

## Phase 3: User Story 1 - Team Receives Error Alerts (Priority: P1) MVP

**Goal**: Capture all unhandled exceptions and notify team via email alerts

**Independent Test**: Trigger an intentional error in production, verify it appears in Sentry dashboard within 1 minute and team receives email notification.

**FR Coverage**: FR-001, FR-006, FR-007, FR-008

### Implementation for User Story 1

- [ ] T011 [US1] Configure Sentry alert rules programmatically via API in setup script at `scripts/setup-sentry-alerts.ts` (use SENTRY_API_KEY)
- [ ] T012 [P] [US1] Create global error boundary at `src/app/global-error.tsx` with Sentry error capture
- [ ] T013 [P] [US1] Create route-level error boundary at `src/app/error.tsx` with Sentry error capture
- [ ] T014 [US1] Verify error grouping works by triggering identical errors (Sentry auto-groups by default)
- [ ] T015 [US1] Add test error page at `src/app/test-error/page.tsx` for manual verification (remove before production)

**Checkpoint**: User Story 1 complete - errors captured, team notified via email, errors grouped to prevent spam

---

## Phase 4: User Story 2 - Developer Investigates Production Errors (Priority: P1)

**Goal**: Readable stack traces with user context and PII scrubbing

**Independent Test**: Trigger error while authenticated, verify stack trace shows TypeScript line numbers and includes user_id/business_id but no sensitive headers.

**FR Coverage**: FR-002, FR-003, FR-004, FR-005

### Implementation for User Story 2

- [ ] T016 [US2] Create Sentry helper module at `src/domains/system/lib/sentry.ts` with `setUserContext()` and `setBusinessContext()` functions
- [ ] T017 [US2] Implement `beforeSend` hook in `sentry.client.config.ts` to scrub sensitive data (Authorization, cookies, passwords)
- [ ] T018 [US2] Integrate user context in auth flow - call `Sentry.setUser()` after Clerk authentication in `src/app/layout.tsx` or provider
- [ ] T019 [US2] Add domain tags helper (`setDomainTag()`) to `src/domains/system/lib/sentry.ts` for filtering errors by domain
- [ ] T020 [US2] Verify source maps upload by checking Sentry release artifacts after `npm run build`
- [ ] T021 [US2] Test authenticated error capture - verify user_id and business_id appear in Sentry event

**Checkpoint**: User Story 2 complete - stack traces readable, user context attached, PII scrubbed

---

## Phase 5: User Story 3 - Monitor Application Performance (Priority: P2)

**Goal**: Track page loads, API calls, and background jobs with 10% sampling

**Independent Test**: Navigate through app, verify performance traces appear in Sentry Performance tab showing page load times and Core Web Vitals.

**FR Coverage**: FR-009, FR-010, FR-011

### Implementation for User Story 3

- [ ] T022 [US3] Enable tracesSampleRate (0.1 for production, 1.0 for development) in `sentry.client.config.ts`
- [ ] T023 [P] [US3] Enable server-side tracing in `sentry.server.config.ts` with same sampling rate
- [ ] T024 [US3] Add Sentry browser tracing integration for Core Web Vitals (automatic with SDK)
- [ ] T025 [US3] Install `@sentry/node` for Trigger.dev tasks via `npm install @sentry/node`
- [ ] T026 [P] [US3] Create Sentry task wrapper helper at `src/trigger/utils/sentry-wrapper.ts` with error capture and domain tagging
- [ ] T027 [US3] Instrument `src/trigger/extract-invoice-data.ts` with Sentry wrapper
- [ ] T028 [P] [US3] Instrument `src/trigger/extract-receipt-data.ts` with Sentry wrapper
- [ ] T029 [P] [US3] Instrument `src/trigger/classify-document.ts` with Sentry wrapper
- [ ] T030 [P] [US3] Instrument `src/trigger/convert-pdf-to-image.ts` with Sentry wrapper
- [ ] T031 [US3] Verify performance traces appear in Sentry dashboard (page loads, API calls, job durations)

**Checkpoint**: User Story 3 complete - performance monitoring active with 10% sampling, Trigger.dev jobs instrumented

---

## Phase 6: User Story 4 - Forward Alerts to Messaging Platforms (Priority: P3)

**Goal**: Forward critical error alerts to Telegram via webhook

**Independent Test**: Trigger a new error, verify Telegram channel receives alert message with error summary and Sentry link.

**FR Coverage**: FR-012, FR-013, FR-014

### Implementation for User Story 4

- [ ] T032 [P] [US4] Add Telegram environment variables to `.env.example` (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, SENTRY_WEBHOOK_SECRET)
- [ ] T033 [US4] Create Telegram notifier at `src/domains/system/lib/telegram-notifier.ts` with `sendAlert()` function
- [ ] T034 [US4] Create webhook route at `src/app/api/v1/system/webhooks/sentry/route.ts` implementing contract from webhook-api.yaml
- [ ] T035 [US4] Implement webhook secret validation using `SENTRY_WEBHOOK_SECRET` header check
- [ ] T036 [US4] Filter webhook processing - only forward `triggered` actions with `error`/`fatal` severity
- [ ] T037 [US4] Format Telegram message with HTML (error type, message, user context, Sentry link)
- [ ] T038 [US4] Configure Sentry webhook integration programmatically via API (use SENTRY_API_KEY)
- [ ] T039 [US4] Test end-to-end: trigger error -> Sentry webhook -> Telegram message

**Checkpoint**: User Story 4 complete - Telegram alerts working for critical errors

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, cleanup, and documentation

- [ ] T040 [P] Update `specs/003-sentry-integration/quickstart.md` with actual setup steps used
- [ ] T041 [P] Remove test error page (`src/app/test-error/page.tsx`) before production deployment
- [ ] T042 Add Sentry DSN and tokens to Vercel environment variables (document in quickstart.md)
- [ ] T043 Run full `npm run build` and verify no TypeScript errors
- [ ] T044 Perform security audit: verify no sensitive data (passwords, tokens, PII) in Sentry test events
- [ ] T045 Update `.env.example` with all required environment variables and documentation comments
- [ ] T046 Run quickstart.md validation scenarios (error capture, stack trace, user context, Telegram)

**Checkpoint**: Feature complete and production-ready

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - US1 and US2 are both P1 - can run in parallel
  - US3 depends on US1/US2 foundation but is independently testable
  - US4 depends on error capture working (US1) but is independently testable
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 2 - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Phase 2 - No dependencies on other stories (parallel with US1)
- **User Story 3 (P2)**: Can start after Phase 2 - Independent but builds on error capture
- **User Story 4 (P3)**: Can start after Phase 2 - Requires error capture working for end-to-end test

### Within Each User Story

- Config before helpers
- Helpers before integrations
- Core implementation before verification
- Story complete before moving to next priority

### Parallel Opportunities

**Phase 1** (all [P] tasks can run in parallel):
- T002, T003, T004

**Phase 2** (some [P] tasks can run in parallel):
- T006, T007 (after T005 creates client config pattern)

**Phase 3-4** (US1 and US2 can run in parallel):
- T012, T013 can run in parallel
- T016-T021 can run parallel to T011-T015

**Phase 5** (multiple Trigger.dev tasks in parallel):
- T027, T028, T029, T030 can all run in parallel

**Phase 6** (after US1 error capture working):
- T032 can run parallel to other US4 tasks

**Phase 7** (all [P] tasks can run in parallel):
- T040, T041

---

## Parallel Example: Trigger.dev Instrumentation

```bash
# Launch all Trigger.dev task instrumentation together:
Task: "Instrument src/trigger/extract-invoice-data.ts with Sentry wrapper"
Task: "Instrument src/trigger/extract-receipt-data.ts with Sentry wrapper"
Task: "Instrument src/trigger/classify-document.ts with Sentry wrapper"
Task: "Instrument src/trigger/convert-pdf-to-image.ts with Sentry wrapper"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T010) - CRITICAL
3. Complete Phase 3: User Story 1 - Error Alerts (T011-T015)
4. Complete Phase 4: User Story 2 - Developer Investigation (T016-T021)
5. **STOP and VALIDATE**: Test error capture, stack traces, user context
6. Deploy to staging

**MVP delivers**: Error capture with readable stack traces, user context, and email alerts

### Incremental Delivery

1. **Setup + Foundational** -> SDK integrated, source maps uploading
2. **Add US1 + US2** -> Test independently -> Deploy (MVP complete!)
3. **Add US3** -> Performance monitoring active -> Deploy
4. **Add US4** -> Telegram alerts working -> Deploy (Feature complete!)
5. Each story adds value without breaking previous stories

### Programmatic Sentry Configuration

Since `SENTRY_API_KEY` is available with full scopes, these tasks can be automated:
- T011: Alert rules creation
- T038: Webhook integration setup

This eliminates manual Sentry dashboard configuration.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- `SENTRY_API_KEY` enables programmatic setup of alerts and webhooks
- Verify `npm run build` passes after each phase
