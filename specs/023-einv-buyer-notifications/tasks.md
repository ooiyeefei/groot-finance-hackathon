# Tasks: E-Invoice Buyer Notifications

**Input**: Design documents from `/specs/023-einv-buyer-notifications/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Tests are NOT requested in the spec. UAT testing will be performed manually using test accounts per quickstart.md.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, git configuration, and schema extensions that all stories depend on

- [X] T001 Configure git author to `grootdev-ai` / `dev@hellogroot.com` in repository
- [X] T002 Extend `sales_invoices` table in convex/schema.ts with `buyerNotificationLog` optional array field (7 fields: eventType, recipientEmail, timestamp, sendStatus, skipReason, errorMessage, sesMessageId)
- [X] T003 [P] Extend `businesses` table in convex/schema.ts with `einvoiceNotifyBuyerOnValidation` and `einvoiceNotifyBuyerOnCancellation` optional boolean fields (default: true)
- [X] T004 Run `npx convex dev` to sync schema changes to development environment

**Checkpoint**: Schema extensions deployed - all stories can now access notification log and settings fields

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core email service, templates, and Convex mutations that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 [P] Create email templates in src/lib/email/buyer-notification-templates.ts with three functions: `generateValidationEmail()`, `generateCancellationEmail()`, `generateRejectionEmail()` (simple transactional HTML with plain text fallback, MyInvois link, business footer) [NOTE: Email service already exists in buyer-notification-service.ts]
- [X] T006 [P] Extend existing email service in src/lib/services/email-service.ts with `sendBuyerNotificationEmail()` method (accepts eventType, invoice data, business data; calls SES via existing pattern) [NOTE: Implemented in buyer-notification-service.ts as sendBuyerNotification]
- [X] T007 [P] Create idempotency helper in convex/lib/buyer-notification-helper.ts with functions: `hasAlreadySent()`, `shouldNotifyBuyer()`, `validateBuyerEmail()` (Zod RFC 5322 email validation)
- [X] T008 Create internalMutation `appendNotificationLog` in convex/functions/salesInvoices.ts (accepts invoiceId + log entry object, appends to buyerNotificationLog array)
- [X] T009 [P] Create mutation `updateNotificationSettings` in convex/functions/businesses.ts (accepts businessId + einvoiceNotifyBuyerOnValidation + einvoiceNotifyBuyerOnCancellation booleans)
- [X] T010 Create API route in src/app/api/v1/sales-invoices/[invoiceId]/lhdn/notify/route.ts with POST handler (internal service key auth, loads invoice + business, validates email, checks idempotency, calls email service, logs result via T008 mutation)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Buyer Receives Validation Notification (Priority: P1) 🎯 MVP

**Goal**: Buyers receive email when LHDN validates their e-invoice, enabling them to act on officially recognized documents

**Independent Test**: Submit test e-invoice → wait for LHDN validation polling → verify buyer receives email with invoice details + MyInvois link (per quickstart.md Section: End-to-End Test: Validation Notification)

### Implementation for User Story 1

- [X] T011 [US1] Create Convex action `sendValidationNotification` in convex/functions/lhdnJobs.ts (accepts invoiceId + businessId, fetches data, calls notify API route via HTTP)
- [X] T012 [US1] Extend `updateSourceRecord` function in convex/functions/lhdnJobs.ts at line ~288 (after existing issuer notification at line 300): if `args.status === "valid"`, schedule `sendValidationNotification` action with 1-second delay
- [ ] T013 [US1] Test validation flow end-to-end: Create test invoice with real email → submit to LHDN sandbox → verify polling triggers notification → verify email received → verify log entry in `buyerNotificationLog` array

**Checkpoint**: User Story 1 complete - Buyers receive validation notifications independently

---

## Phase 4: User Story 2 - Buyer Receives Cancellation Notification (Priority: P1)

**Goal**: Buyers receive email when issuer cancels an e-invoice, preventing payment of cancelled invoices (financial risk mitigation)

**Independent Test**: Issue validated test e-invoice → cancel via Groot UI (provide reason) → verify buyer receives cancellation email with reason (per quickstart.md Section: End-to-End Test: Cancellation Notification)

### Implementation for User Story 2

- [X] T014 [US2] Create Convex action `sendCancellationNotification` in convex/functions/lhdnJobs.ts (accepts invoiceId + businessId + cancellationReason, fetches data, calls notify API route with eventType="cancellation")
- [X] T015 [US2] Extend cancel route in src/app/api/v1/sales-invoices/[invoiceId]/lhdn/cancel/route.ts after successful LHDN cancellation response (line ~80-100): trigger `sendCancellationNotification` action via Convex HTTP client with cancellation reason from request body
- [ ] T016 [US2] Test cancellation flow end-to-end: Create validated test invoice → cancel with reason "Incorrect amount" → verify buyer receives email with reason → verify log entry

**Checkpoint**: User Stories 1 AND 2 complete - Validation and cancellation notifications both working independently

---

## Phase 5: User Story 3 - Buyer Receives Rejection Confirmation (Priority: P2)

**Goal**: Buyers receive confirmation email when their e-invoice rejection is processed by LHDN, providing complete audit trail

**Independent Test**: Simulate buyer rejection via LHDN polling detection → verify buyer receives confirmation email (per spec acceptance scenarios)

### Implementation for User Story 3

- [X] T017 [US3] Create Convex action `sendRejectionConfirmation` in convex/functions/lhdnJobs.ts (accepts invoiceId + businessId, fetches data, calls notify API route with eventType="rejection")
- [X] T018 [US3] Extend `updateSourceRecord` function in convex/functions/lhdnJobs.ts after line 331 (after existing "invalid" status handling): if `args.status === "rejected"`, schedule `sendRejectionConfirmation` action with 1-second delay
- [ ] T019 [US3] Test rejection flow end-to-end: Submit test invoice → simulate rejection status from LHDN → verify polling detects rejection → verify buyer receives confirmation email → verify log entry

**Checkpoint**: User Stories 1, 2, AND 3 complete - All three notification types working independently

---

## Phase 6: User Story 4 - Business Controls Buyer Notification Preferences (Priority: P2)

**Goal**: Business admins can control which buyer notification emails are sent (validation/cancellation), managing customer communication preferences

**Independent Test**: Navigate to business settings → toggle "Notify buyer on validation" to OFF → submit test invoice → verify validation email is skipped with correct log reason (per quickstart.md Section: End-to-End Test: Settings Toggles)

### Implementation for User Story 4

- [X] T020 [P] [US4] Create React component in src/domains/account-management/components/einvoice-notification-settings.tsx with two Switch toggles (Radix UI): "Notify buyer when e-invoice is validated by LHDN" and "Notify buyer when I cancel an e-invoice", both default checked, uses `useQuery` to load current settings, `useMutation` to save changes via T009 mutation
- [X] T021 [US4] Integrate notification settings component into existing business settings page in src/domains/account-management/components/business-settings-section.tsx or tabbed-business-settings.tsx (add new "E-Invoice Notifications" section with component from T020)
- [ ] T022 [US4] Test settings UI end-to-end: Login as admin → navigate to settings → verify toggles default to ON → toggle validation to OFF → save → verify Convex businesses table updated → create test invoice → submit → verify validation email skipped with log reason "business_settings_disabled"

**Checkpoint**: All user stories complete - Full feature functional with settings control

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, deployment, and documentation updates

- [ ] T023 [P] Verify all three notification email templates render correctly with sample data (validation, cancellation, rejection) - check HTML formatting, MyInvois links, business footer
- [ ] T024 [P] Test idempotency: Manually trigger same notification twice via Convex dashboard → verify second attempt logs "already_sent" skip reason and does not send duplicate email
- [ ] T025 [P] Test graceful handling of edge cases: missing buyer email (skip with "no_email"), invalid email format (skip with "invalid_format"), SES failure (log with "failed" status + error message)
- [X] T026 Update CLAUDE.md Recent Changes section with summary: "023-einv-buyer-notifications: Buyer email notifications for e-invoice validation, cancellation, rejection. Transactional emails via SES, idempotent via audit log, business settings toggles. Extended: sales_invoices (+buyerNotificationLog[]), businesses (+einvoiceNotifyBuyerOn*). New: buyer-notification-templates.ts, notify API route, Convex actions in lhdnJobs.ts."
- [X] T027 Run `npm run build` to verify Next.js build passes without TypeScript errors
- [ ] T028 Run `npx convex deploy --yes` to deploy schema and functions to production
- [ ] T029 Verify production smoke test: Login to production with real account → create test invoice (mark as "Test" in notes) → submit to LHDN production → verify buyer receives validation email

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T004) completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1: US1, US2 → P2: US3, US4)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational - No dependencies on other stories (reuses T010 notify route from Foundational)
- **User Story 3 (P2)**: Can start after Foundational - No dependencies on other stories (reuses T010 notify route)
- **User Story 4 (P2)**: Can start after Foundational - No dependencies on other stories (settings control independent of notification triggers)

### Within Each User Story

- Convex action before trigger integration (e.g., T011 before T012)
- Trigger integration before end-to-end test (e.g., T012 before T013)

### Parallel Opportunities

**Phase 1 (Setup)**: T002 and T003 can run in parallel (different tables in same schema file)

**Phase 2 (Foundational)**: T005, T006, T007, T009 can all run in parallel (different files, no dependencies)

**User Stories**: After Foundational completes, all user stories (US1, US2, US3, US4) can be implemented in parallel by different developers

**Polish**: T023, T024, T025 can run in parallel (independent tests)

---

## Parallel Example: Foundational Phase

```bash
# Launch all foundational tasks together:
Task: "Create email templates in src/lib/email/buyer-notification-templates.ts"
Task: "Extend email service in src/lib/services/email-service.ts"
Task: "Create idempotency helper in convex/lib/buyer-notification-helper.ts"
Task: "Create mutation updateNotificationSettings in convex/functions/businesses.ts"

# Then sequentially:
Task: "Create internalMutation appendNotificationLog" (depends on schema T002)
Task: "Create API route notify/route.ts" (depends on email service T006 + helper T007 + mutation T008)
```

---

## Parallel Example: User Stories (After Foundational)

```bash
# With 4 developers, all can work simultaneously:
Developer A: User Story 1 (T011, T012, T013)
Developer B: User Story 2 (T014, T015, T016)
Developer C: User Story 3 (T017, T018, T019)
Developer D: User Story 4 (T020, T021, T022)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

**Minimum Viable Product**: Buyers receive validation notifications (P1 core feature)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T010) - **CRITICAL BLOCKING PHASE**
3. Complete Phase 3: User Story 1 (T011-T013)
4. **STOP and VALIDATE**: Test validation notification end-to-end per quickstart.md
5. Deploy/demo if ready (validation notification = competitive parity with Remicle for most common event)

### Incremental Delivery

**Recommended approach for production readiness**:

1. **Sprint 1**: Setup + Foundational → Foundation ready (T001-T010)
2. **Sprint 2**: User Story 1 → Test independently → Deploy (MVP: validation notifications)
3. **Sprint 3**: User Story 2 → Test independently → Deploy (cancellation notifications added)
4. **Sprint 4**: User Story 3 → Test independently → Deploy (rejection confirmations added)
5. **Sprint 5**: User Story 4 → Test independently → Deploy (settings control added)
6. **Sprint 6**: Polish → Final validation → Production deployment (T023-T029)

Each story adds value without breaking previous stories.

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together (T001-T010)
2. Once Foundational is done (T010 complete):
   - Developer A: User Story 1 (T011-T013)
   - Developer B: User Story 2 (T014-T016)
   - Developer C: User Story 3 (T017-T019)
   - Developer D: User Story 4 (T020-T022)
3. Stories complete and integrate independently
4. Team reconvenes for Polish phase (T023-T029)

---

## Task Summary

**Total Tasks**: 29
- **Phase 1 (Setup)**: 4 tasks
- **Phase 2 (Foundational)**: 6 tasks (BLOCKING - highest priority)
- **Phase 3 (US1)**: 3 tasks
- **Phase 4 (US2)**: 3 tasks
- **Phase 5 (US3)**: 3 tasks
- **Phase 6 (US4)**: 3 tasks
- **Phase 7 (Polish)**: 7 tasks

**Parallel Opportunities**: 13 tasks marked [P] can run in parallel

**Story Distribution**:
- US1 (P1): 3 tasks
- US2 (P1): 3 tasks
- US3 (P2): 3 tasks
- US4 (P2): 3 tasks
- Foundation/Setup/Polish: 17 tasks

**Independent Test Criteria**: Each user story has clear acceptance criteria from spec.md and testable end-to-end workflow per quickstart.md

**Suggested MVP Scope**: Phase 1 + Phase 2 + Phase 3 (User Story 1 only) = 13 tasks for validation notifications

---

## Notes

- **[P] tasks**: Different files, no dependencies - safe to run in parallel
- **[Story] label**: Maps task to specific user story for traceability and independent testing
- **Each user story is independently completable**: Can deploy US1 without US2/US3/US4
- **No tests requested**: UAT testing via manual flow per quickstart.md (test accounts in `.env.local`)
- **Convex deployment required**: After schema changes (T004) and before production (T028)
- **Internal service key auth**: All Convex → API route calls use `MCP_INTERNAL_SERVICE_KEY` header
- **Idempotency via audit log**: `buyerNotificationLog[]` array prevents duplicate emails (FR-012)
- **Settings default to enabled**: `undefined` treated as `true` for notification toggles
- **Rejection confirmation always sent**: Not configurable (confirms buyer's own action)

---

**Format Validation**: ✅ All tasks follow required checklist format `- [ ] [ID] [P?] [Story?] Description with file path`

**Next Step**: Run `/speckit.implement` to execute these tasks end-to-end with thorough testing.
