# Tasks: In-App & Email Notification System

**Input**: Design documents from `/specs/018-app-email-notif/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not requested — manual testing via Convex dashboard + `npm run build` verification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create notification domain directory structure and documentation

- [x] T001 Create domain directory structure: `src/domains/notifications/components/`, `src/domains/notifications/hooks/`, `src/domains/notifications/lib/`
- [x] T002 Create domain documentation in `src/domains/notifications/CLAUDE.md` describing the notification domain purpose, directory structure, key components, hooks, Convex functions, and integration points

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the notification data layer — schema, Convex queries, mutations, and internal functions that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Add `notifications` table, `notification_digests` table, and `notificationPreferences` embedded object on users table to `convex/schema.ts` per data-model.md — include all fields, validators, and indexes (`by_recipient_business_status`, `by_recipient_business_created`, `by_business_type`, `by_createdAt`, `by_sourceEvent` for notifications; `by_userId_businessId` for notification_digests)
- [x] T004 Implement client-facing queries in `convex/functions/notifications.ts`: `listForUser` (paginated, filtered by status/type, sorted by createdAt desc), `getUnreadCount` (lightweight count for bell badge), `getPreferences` (returns notificationPreferences with defaults applied) — all with auth via `getAuthenticatedUser` and business membership verification per contracts/convex-functions.md
- [x] T005 Implement client-facing mutations in `convex/functions/notifications.ts`: `markAsRead` (set status=read, readAt=now), `markAllAsRead` (batch update for user+business), `dismiss` (set status=dismissed, dismissedAt=now), `updatePreferences` (merge into user.notificationPreferences) — all with auth and ownership verification per contracts/convex-functions.md
- [x] T006 Implement internal mutations in `convex/functions/notifications.ts`: `create` (single-user notification with preference check, dedup via sourceEvent, returns notification ID), `createForRole` (broadcast to users with specific roles in a business via business_memberships lookup), `deleteExpired` (cleanup notifications older than 90 days via by_createdAt index) per contracts/convex-functions.md
- [x] T007 Add `notification-cleanup` cron job in `convex/crons.ts` — daily at 2:00 AM UTC calling `internal.functions.notifications.deleteExpired`, following the existing cron pattern used by `cleanup-expired-insights`
- [x] T008 Deploy Convex schema and functions to production: `npx convex deploy --yes`

**Checkpoint**: Notification data layer ready — all queries, mutations, and internal functions operational. User story implementation can now begin.

---

## Phase 3: User Story 1 - In-App Notification Center (Priority: P1) MVP

**Goal**: Notification bell icon in header with real-time unread count badge, side panel showing notification list with severity indicators, click-through navigation to linked resources, mark-as-read and dismiss actions.

**Independent Test**: Create a notification via Convex dashboard → verify bell badge updates in real-time → open panel → click notification → navigate to linked resource → badge count decrements.

### Implementation for User Story 1

- [x] T009 [P] [US1] Create `useNotifications` hook in `src/domains/notifications/hooks/use-notifications.ts` — subscribe to `notifications.listForUser` and `notifications.getUnreadCount` via Convex `useQuery`, expose `markAsRead`/`markAllAsRead`/`dismiss` via `useMutation`, handle pagination with cursor, return `{ notifications, unreadCount, loading, markAsRead, markAllAsRead, dismiss, loadMore, hasMore }` per contracts/components.md
- [x] T010 [P] [US1] Create `NotificationItem` component in `src/domains/notifications/components/notification-item.tsx` — severity color-coded dot (critical=destructive, warning=amber, info=blue using semantic tokens), type icon from lucide-react (approval=CheckCircle, anomaly=AlertTriangle, compliance=Shield, insight=Lightbulb, invoice_processing=FileText), unread highlight (bg-muted/50), title (bold if unread) + body (truncated 2 lines), relative timestamp, click handler for navigation + mark-as-read, dismiss button (X icon) per contracts/components.md
- [x] T011 [US1] Create `NotificationPanel` component in `src/domains/notifications/components/notification-panel.tsx` — use Sheet (side="right") from ui/sheet.tsx, header with "Notifications" title + "Mark all as read" button + settings gear link, scrollable body rendering NotificationItem list, empty state ("No notifications yet" with Bell icon), uses useNotifications hook, "Load more" button for pagination per contracts/components.md
- [x] T012 [US1] Create `NotificationBell` component in `src/domains/notifications/components/notification-bell.tsx` — Bell icon (lucide-react) as ghost Button, Badge showing unread count (hidden when 0), click toggles NotificationPanel open state, subscribes to unreadCount via useNotifications hook, uses `useActiveBusiness()` for businessId per contracts/components.md
- [x] T013 [US1] Add NotificationBell to app header in `src/components/ui/header-with-user.tsx` — insert between the actions slot and FeedbackButton in the right section, pass businessId from context, import NotificationBell from notifications domain
- [x] T014 [US1] Verify build passes: `npm run build`

**Checkpoint**: User Story 1 complete — notification bell visible in header, panel opens with notification list, click-through works, real-time badge updates. MVP is functional.

---

## Phase 4: User Story 2 - Notification Preferences (Priority: P2)

**Goal**: User-configurable notification preferences with per-category toggles for in-app and email channels, digest frequency selection, integrated into existing settings page.

**Independent Test**: Navigate to profile settings → see notification preferences grid → toggle "Anomaly Alerts" off for in-app → create an anomaly notification via Convex dashboard → verify it does NOT appear in notification panel.

### Implementation for User Story 2

- [x] T015 [P] [US2] Create `useNotificationPreferences` hook in `src/domains/notifications/hooks/use-notification-preferences.ts` — subscribe to `notifications.getPreferences` via Convex `useQuery`, expose `updatePreferences` via `useMutation`, return `{ preferences, loading, updatePreferences }` per contracts/components.md
- [x] T016 [US2] Create `NotificationPreferencesForm` component in `src/domains/notifications/components/notification-preferences-form.tsx` — grid layout with rows for each category (Approval Requests, Anomaly Alerts, Compliance Warnings, AI Insights, Invoice Processing) and columns for In-App and Email toggles using Switch or Checkbox components, digest frequency Select (Daily/Weekly), Save button calling updatePreferences mutation, loading skeleton while fetching, success toast on save, uses semantic tokens (bg-card, text-foreground) per contracts/components.md
- [x] T017 [US2] Add NotificationPreferencesForm section to user profile in `src/domains/account-management/components/user-profile-section.tsx` — add a "Notification Preferences" card/section below existing content, lazy-import NotificationPreferencesForm component
- [x] T018 [US2] Verify build passes: `npm run build`

**Checkpoint**: User Story 2 complete — notification preferences configurable from settings, filtering applied to notification creation.

---

## Phase 5: User Story 3 - Approval Workflow Notifications (Priority: P2)

**Goal**: Automatic notifications triggered by expense claim workflow transitions — approver notified on submission, submitter notified on approval/rejection, with transactional email for approval requests.

**Independent Test**: Submit an expense claim → approver sees in-app notification with claim details and link → approve the claim → submitter sees approval confirmation notification → verify approver also receives an email if email notifications enabled.

### Implementation for User Story 3

- [x] T019 [P] [US3] Create notification trigger helper in `src/domains/notifications/lib/notification-triggers.ts` — export functions `notifyApprovalRequest(claimId, businessId, approverId, submitterName, amount, description)`, `notifyApprovalStatus(claimId, businessId, submitterId, status, approverName, reason?)`, and `notifyComplianceOverride(claimId, businessId, overrideDetails)` that call Convex internal mutations `notifications.create` with appropriate type, severity, title, body, resourceType='expense_claim', and resourceUrl
- [x] T020 [P] [US3] Create approval request email template (`notification_approval_request`) in `lambda/shared/templates/index.ts` — HTML template with placeholders for `{{approverName}}`, `{{submitterName}}`, `{{claimAmount}}`, `{{claimDescription}}`, `{{reviewUrl}}`, `{{unsubscribeUrl}}`, following the existing welcome email template pattern with RFC 8058 unsubscribe headers
- [x] T021 [P] [US3] Create approval status email template (`notification_approval_status`) in `lambda/shared/templates/index.ts` — HTML template with placeholders for `{{submitterName}}`, `{{status}}` (Approved/Rejected), `{{amount}}`, `{{approverName}}`, `{{reason}}` (for rejections), `{{claimUrl}}`, `{{unsubscribeUrl}}`
- [x] T022 [US3] Implement `sendTransactionalEmail` internal action in `convex/functions/notifications.ts` — call Lambda email service or directly call SES via the existing `sendEmail` pattern in `lambda/shared/email-service.ts`, generate unsubscribe token, check `emailPreferences.globalUnsubscribe` before sending, update notification record with `emailSent=true` and `emailMessageId` on success, per contracts/convex-functions.md
- [x] T023 [US3] Activate notification triggers in `src/domains/expense-claims/lib/enhanced-workflow-engine.ts` — replace the console.log placeholder at line 414 with calls to notification trigger helpers: on `submit` action call `notifyApprovalRequest` for manager recipients, on `approve` action call `notifyApprovalStatus` for submitter, on `reject` action call `notifyApprovalStatus` with rejection reason, on `override_approve` call `notifyComplianceOverride` — use claim data and context available in `executePostTransitionActions`
- [x] T024 [US3] Wire transactional email into notification creation: when a notification of type `approval` is created, check recipient's `notificationPreferences.email.approval` and `emailPreferences.globalUnsubscribe`, if both allow email then schedule `sendTransactionalEmail` action with the appropriate template
- [x] T025 [US3] Deploy Convex (`npx convex deploy --yes`) and verify build (`npm run build`)

**Checkpoint**: User Story 3 complete — expense claim workflow generates notifications for approvers and submitters, transactional emails sent for approval requests.

---

## Phase 6: User Story 4 - Email Digest for Managers (Priority: P3)

**Goal**: Scheduled email digest aggregating unactioned notifications by category, sent daily or weekly per user preference, with direct links to each item.

**Independent Test**: Generate several notifications for a user → trigger the digest job manually → verify email received with notifications grouped by category → verify no email sent when no new notifications exist.

### Implementation for User Story 4

- [x] T026 [P] [US4] Create digest email template (`notification_digest`) in `lambda/shared/templates/index.ts` — HTML template with sections for each notification category (Approvals, Anomalies, Insights, Compliance), each section shows count + list of items with title, severity badge, and "View Details" link, includes `{{recipientName}}`, `{{digestPeriod}}` (Daily/Weekly), `{{totalCount}}`, `{{categoryGroups}}` (iterable), `{{unsubscribeUrl}}`
- [x] T027 [US4] Create `convex/functions/notificationJobs.ts` with `runDigest` internal mutation — query all businesses, for each business find users with digest enabled (check `notificationPreferences.digestFrequency` matches current schedule), query unread/unactioned notifications since `notification_digests.lastDigestSentAt`, skip if zero notifications (FR-013), group by category, call `sendDigest` action per user, update `notification_digests` record with new `lastDigestSentAt`
- [x] T028 [US4] Implement `sendDigest` internal action in `convex/functions/notifications.ts` (or `notificationJobs.ts`) — render digest template with grouped notifications, call email service via SES with RFC 8058 headers, update `notification_digests` record on success, per contracts/convex-functions.md
- [x] T029 [US4] Add `notification-digest` cron job in `convex/crons.ts` — daily at 8:00 AM UTC calling `internal.functions.notificationJobs.runDigest`, following the existing cron pattern
- [x] T030 [US4] Deploy Convex (`npx convex deploy --yes`) and verify build (`npm run build`)

**Checkpoint**: User Story 4 complete — scheduled digest emails sent with aggregated notifications, empty digests suppressed.

---

## Phase 7: User Story 5 - Proactive Anomaly & Insight Alerts (Priority: P3)

**Goal**: Automatic notifications from anomaly detection and AI insight pipeline — critical anomalies trigger immediate in-app notifications + transactional email, high-priority insights create notifications for digest inclusion.

**Independent Test**: Trigger the proactive analysis cron job → verify a critical anomaly creates a notification for all finance admins → verify critical anomaly also sends a transactional email.

### Implementation for User Story 5

- [x] T031 [P] [US5] Create critical anomaly email template (`notification_critical_anomaly`) in `lambda/shared/templates/index.ts` — HTML template with `{{recipientName}}`, `{{anomalyTitle}}`, `{{anomalyDescription}}`, `{{severity}}`, `{{detectedAt}}`, `{{recommendedAction}}`, `{{viewUrl}}`, `{{unsubscribeUrl}}`
- [x] T032 [US5] Augment `actionCenterInsights.internalCreate` in `convex/functions/actionCenterInsights.ts` — after creating an insight, call `notifications.createForRole` with targetRoles `["owner", "finance_admin"]`, map insight category/priority to notification type/severity (anomaly→anomaly, compliance→compliance, deadline/cashflow/optimization→insight), set resourceType='insight' and resourceUrl to Action Center path, use insight `_id` as sourceEvent for deduplication
- [x] T033 [US5] Wire transactional email for critical anomaly notifications: when a notification of type `anomaly` with severity `critical` is created, check recipient's email preferences and schedule `sendTransactionalEmail` with the `notification_critical_anomaly` template — follow the same pattern established in T024 for approval transactional emails
- [x] T034 [US5] Deploy Convex (`npx convex deploy --yes`) and verify build (`npm run build`)

**Checkpoint**: User Story 5 complete — anomaly detection and insight pipeline create notifications for finance admins, critical anomalies trigger transactional emails.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, bulk batching, and final verification across all stories

- [x] T035 Handle deleted resource click-through edge case in `src/domains/notifications/components/notification-item.tsx` — when navigating to resourceUrl, if the resource no longer exists (404 or null query result), display "Resource no longer available" message instead of broken link or error page
- [x] T036 Implement bulk batching logic in `convex/functions/notifications.ts` `create` internal mutation — before creating a notification, check if 5+ notifications of the same type from the same sourceEvent prefix exist within the last 60 seconds for the same recipient; if so, create a single summary notification (e.g., "5 new expense claims submitted") instead of individual notifications (FR-012)
- [x] T037 Final build verification: `npm run build`
- [x] T038 Final Convex production deploy: `npx convex deploy --yes`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational (Phase 2) — No dependencies on other stories
- **US2 (Phase 4)**: Depends on Foundational (Phase 2) — Can run in parallel with US1
- **US3 (Phase 5)**: Depends on Foundational (Phase 2) — Can run in parallel with US1/US2, but benefits from US1 for visual verification
- **US4 (Phase 6)**: Depends on Foundational (Phase 2) — Can run in parallel, but logically follows US2 (preferences) for digest frequency
- **US5 (Phase 7)**: Depends on Foundational (Phase 2) — Can run in parallel with others
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

```
Phase 1: Setup
    ↓
Phase 2: Foundational (BLOCKS ALL)
    ↓
    ├── Phase 3: US1 - Notification Center (P1) ← MVP
    ├── Phase 4: US2 - Preferences (P2) ← can parallel with US1
    ├── Phase 5: US3 - Approval Triggers (P2) ← can parallel with US1/US2
    ├── Phase 6: US4 - Email Digest (P3) ← benefits from US2
    └── Phase 7: US5 - Anomaly Alerts (P3) ← can parallel
         ↓
    Phase 8: Polish
```

### Within Each User Story

- Hooks before components that use them
- Presentational components before container components
- Backend changes (Convex functions, templates) before frontend integration
- Build verification as final task in each phase

### Parallel Opportunities

**Within Phase 2 (Foundational)**:
- T004, T005, T006 are sequential (same file: `notifications.ts`) but can be written in one session

**Within Phase 3 (US1)**:
- T009 [P] (hook) and T010 [P] (NotificationItem) can run in parallel — different files
- T011 (panel) depends on T010; T012 (bell) depends on T009 + T011; T013 depends on T012

**Within Phase 5 (US3)**:
- T019 [P] (trigger helpers), T020 [P] (approval request template), T021 [P] (status template) — all different files
- T022 depends on templates; T023 depends on T019; T024 depends on T022

**Within Phase 7 (US5)**:
- T031 [P] (anomaly template) can parallel with T032 (insight augmentation) — different files

**Cross-Story Parallelism**:
- After Phase 2, different developers can work on US1, US2, US3, US4, US5 simultaneously

---

## Parallel Example: User Story 1

```bash
# Launch hook and component in parallel (different files):
Task: "Create useNotifications hook in src/domains/notifications/hooks/use-notifications.ts"
Task: "Create NotificationItem component in src/domains/notifications/components/notification-item.tsx"

# Then sequentially:
Task: "Create NotificationPanel (depends on NotificationItem)"
Task: "Create NotificationBell (depends on hook + panel)"
Task: "Add to header (depends on bell)"
```

## Parallel Example: User Story 3

```bash
# Launch all three in parallel (different files):
Task: "Create notification trigger helpers in src/domains/notifications/lib/notification-triggers.ts"
Task: "Create approval request email template in lambda/shared/templates/index.ts"
Task: "Create approval status email template in lambda/shared/templates/index.ts"

# Then sequentially:
Task: "Implement sendTransactionalEmail action (depends on templates)"
Task: "Activate triggers in workflow engine (depends on trigger helpers)"
Task: "Wire email into creation flow (depends on sendTransactionalEmail)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 — In-App Notification Center
4. **STOP and VALIDATE**: Create test notifications via Convex dashboard, verify bell badge, panel, click-through
5. Deploy/demo if ready — users can now see in-app notifications

### Incremental Delivery

1. Setup + Foundational → Data layer ready
2. Add US1 → In-app notifications working → Deploy (MVP!)
3. Add US2 → Users can control their preferences → Deploy
4. Add US3 → Expense claim workflow triggers notifications + emails → Deploy
5. Add US4 → Managers receive scheduled digests → Deploy
6. Add US5 → Anomaly pipeline triggers notifications → Deploy
7. Polish → Edge cases, bulk batching → Final deploy

### Recommended Single-Developer Order

For one developer working sequentially in priority order:

1. Phase 1 → Phase 2 → Phase 3 (US1) → **validate MVP**
2. Phase 4 (US2) → Phase 5 (US3) → **validate approval flow end-to-end**
3. Phase 6 (US4) → Phase 7 (US5) → **validate email delivery**
4. Phase 8 (Polish) → **final validation**

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- MANDATORY: Run `npx convex deploy --yes` after ANY Convex-related change (schema, functions, crons)
- MANDATORY: Run `npm run build` before considering any phase complete
- Git author must be set per CLAUDE.md: `git config user.name "grootdev-ai"` / `git config user.email "dev@hellogroot.com"`
