# Tasks: User Feedback Collection

**Input**: Design documents from `/specs/001-user-feedback/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/feedback-api.yaml

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US5)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependencies, and basic structure

- [x] T001 Install dependencies: `npm install html2canvas @octokit/rest`
- [x] T002 [P] Create feedback domain directory structure at `src/domains/feedback/`
- [x] T003 [P] Add environment variables to `.env.local`: GITHUB_TOKEN, GITHUB_REPO, FEEDBACK_NOTIFICATION_EMAILS
- [x] T004 [P] Create TypeScript types in `src/domains/feedback/types/feedback.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 Add feedback table schema to `convex/schema.ts` with indexes (by_status, by_type, by_business, by_user, by_creation)
- [ ] T006 Create Convex feedback mutations in `convex/feedback.ts`:
  - generateUploadUrl
  - create
  - updateStatus
  - list (with filters)
  - get (single item)
- [ ] T007 [P] Create API route structure at `src/app/api/v1/feedback/`
- [ ] T008 [P] Create base feedback widget component shell at `src/domains/feedback/components/feedback-widget.tsx`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Submit Bug Report (Priority: P1)

**Goal**: Logged-in users can quickly report bugs using simple language, with automatic GitHub issue creation

**Independent Test**: Log in, click feedback button, select "Report a Problem", describe issue in plain language, capture screenshot, submit. Verify feedback stored and GitHub issue created with "bug" label.

### Implementation for User Story 1

- [ ] T009 [US1] Create feedback form component in `src/domains/feedback/components/feedback-form.tsx`:
  - Type selector with user-friendly labels ("Report a Problem", "Suggest an Idea", "Share Feedback")
  - Textarea with friendly placeholder text ("What went wrong?")
  - Character counter in friendly terms
  - Submit button
- [ ] T010 [US1] Create screenshot button component in `src/domains/feedback/components/screenshot-button.tsx`:
  - One-click capture using html2canvas
  - Visual preview thumbnail
  - Remove screenshot option
  - Graceful failure handling with friendly message
- [ ] T011 [US1] Create feedback modal component in `src/domains/feedback/components/feedback-modal.tsx`:
  - Modal overlay with proper z-index
  - Step flow: type selection -> form -> confirmation
  - Close button and click-outside-to-close
- [ ] T012 [US1] Implement feedback submission API route in `src/app/api/v1/feedback/route.ts`:
  - POST handler with FormData parsing
  - Clerk auth validation
  - Screenshot upload to Convex storage
  - Feedback record creation
  - Fire-and-forget GitHub issue trigger
- [ ] T013 [US1] Create GitHub integration service in `src/domains/feedback/services/github-integration.ts`:
  - Issue creation function using @octokit/rest
  - Issue body formatting with feedback details
  - Label mapping (bug -> "bug")
- [ ] T014 [US1] Implement GitHub issue creation API route in `src/app/api/v1/feedback/github/route.ts`:
  - POST handler to create GitHub issue
  - Update feedback record with issue URL/number
  - Error handling with console logging
- [ ] T015 [US1] Create feedback confirmation component in `src/domains/feedback/components/feedback-confirmation.tsx`:
  - Success message: "Thank you! We'll look into this."
  - Auto-close modal after 3 seconds
- [ ] T016 [US1] Create use-feedback hook in `src/domains/feedback/hooks/use-feedback.ts`:
  - Form state management
  - Submission handler
  - Loading and error states
  - Input preservation on failure
- [ ] T017 [US1] Add FeedbackWidget to dashboard layout in `src/app/(dashboard)/layout.tsx`:
  - Import and render FeedbackWidget component
  - Position: fixed bottom-right
  - Only render for authenticated users

**Checkpoint**: Bug report submission fully functional with GitHub issue creation

---

## Phase 4: User Story 2 - Submit Feature Request (Priority: P1)

**Goal**: Logged-in users can suggest features using simple language, with automatic GitHub issue creation

**Independent Test**: Log in, click feedback button, select "Suggest an Idea", describe feature in plain language, submit. Verify feedback stored and GitHub issue created with "feature-request" label.

### Implementation for User Story 2

- [ ] T018 [US2] Update feedback form placeholder text for feature type in `src/domains/feedback/components/feedback-form.tsx`:
  - Placeholder: "What would make this better?"
- [ ] T019 [US2] Update GitHub integration for feature requests in `src/domains/feedback/services/github-integration.ts`:
  - Label mapping (feature -> "feature-request")
  - Issue title format for features
- [ ] T020 [US2] Verify GitHub issue creation works for feature type:
  - Test submission creates issue with correct label
  - Verify issue body includes all details

**Checkpoint**: Feature request submission fully functional with GitHub issue creation

---

## Phase 5: User Story 3 - Submit General Feedback (Priority: P2)

**Goal**: Users can submit general feedback with optional anonymity

**Independent Test**: Log in, click feedback button, select "Share Feedback", check anonymous option, submit. Verify feedback stored without user identity.

### Implementation for User Story 3

- [ ] T021 [US3] Update feedback form placeholder text for general type in `src/domains/feedback/components/feedback-form.tsx`:
  - Placeholder: "Tell us what's on your mind..."
- [ ] T022 [US3] Add anonymous submission checkbox to `src/domains/feedback/components/feedback-form.tsx`:
  - Checkbox: "Submit anonymously"
  - When checked, userId not sent to API
- [ ] T023 [US3] Update API route to handle anonymous submissions in `src/app/api/v1/feedback/route.ts`:
  - Check isAnonymous flag
  - Store feedback with userId undefined if anonymous
- [ ] T024 [US3] Verify general feedback does NOT create GitHub issue:
  - GitHub trigger only fires for bug/feature types

**Checkpoint**: General feedback submission fully functional with anonymous option

---

## Phase 6: User Story 4 - Admin Feedback Management (Priority: P2)

**Goal**: Administrators can view all feedback and manage status with GitHub issue links

**Independent Test**: Log in as admin, navigate to /admin/feedback, view feedback list with filters, see GitHub issue links, update status.

### Implementation for User Story 4

- [ ] T025 [US4] Create admin feedback page at `src/app/(dashboard)/admin/feedback/page.tsx`:
  - Table/list view of all feedback
  - Columns: type, message preview, status, date, GitHub link, user (or "Anonymous")
  - Empty state when no feedback
- [ ] T026 [US4] Implement feedback list API with filters in `src/app/api/v1/feedback/route.ts`:
  - GET handler (admin only)
  - Query params: type, status, limit, cursor
  - Return paginated results with user info
- [ ] T027 [US4] Add filter controls to admin page in `src/app/(dashboard)/admin/feedback/page.tsx`:
  - Type filter dropdown (All, Bug, Feature, General)
  - Status filter dropdown (All, New, Reviewed, Resolved)
- [ ] T028 [US4] Create feedback detail view/modal in `src/app/(dashboard)/admin/feedback/page.tsx`:
  - Full message display
  - Screenshot preview (if exists)
  - Page URL and user agent
  - GitHub issue link (clickable)
- [ ] T029 [US4] Add status update functionality in `src/app/api/v1/feedback/[feedbackId]/route.ts`:
  - PATCH handler for status updates
  - Admin role validation
  - Status transition validation (no backward transitions)
- [ ] T030 [US4] Add status dropdown to admin feedback view in `src/app/(dashboard)/admin/feedback/page.tsx`:
  - Status badges with colors (New=blue, Reviewed=yellow, Resolved=green)
  - Dropdown to change status

**Checkpoint**: Admin can fully manage feedback with status updates and GitHub links

---

## Phase 7: User Story 5 - Team Notification (Priority: P3)

**Goal**: Team members receive notifications when new feedback is submitted

**Independent Test**: Configure notification email, submit feedback, verify team receives email notification.

### Implementation for User Story 5

- [ ] T031 [US5] Research existing notification infrastructure in codebase:
  - Check `src/lib/` for email service
  - Check `src/domains/system/` for notification patterns
  - Identify Resend/SendGrid or existing provider
- [ ] T032 [US5] Create notification service in `src/domains/feedback/services/notification.ts`:
  - Send email function
  - Email template for feedback notification
  - Parse FEEDBACK_NOTIFICATION_EMAILS env var
- [ ] T033 [US5] Trigger notification on feedback submission in `src/app/api/v1/feedback/route.ts`:
  - Fire-and-forget notification call after successful submission
  - Include feedback type, preview, and link to admin view

**Checkpoint**: Team receives email notifications for all new feedback

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T034 [P] Add rate limiting to feedback submission (max 10/hour per user) in `src/app/api/v1/feedback/route.ts`
- [ ] T035 [P] Add retry logic with exponential backoff for GitHub API failures in `src/domains/feedback/services/github-integration.ts`
- [ ] T036 [P] Ensure all UI text uses non-technical language (review all components)
- [ ] T037 [P] Add accessibility attributes (aria-labels, keyboard navigation) to feedback widget
- [ ] T038 Run build validation: `npm run build`
- [ ] T039 Run quickstart.md validation steps

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - US1 (Bug Report) and US2 (Feature Request) share GitHub integration - can be done together
  - US3 (General Feedback) is independent
  - US4 (Admin) is independent but benefits from existing feedback data
  - US5 (Notification) is fully independent
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 Bug Report (P1)**: Core story - start first
- **US2 Feature Request (P1)**: Extends US1 GitHub integration - can run in parallel
- **US3 General Feedback (P2)**: Independent - can run in parallel with US1/US2
- **US4 Admin Management (P2)**: Independent - can start after US1 has data
- **US5 Team Notification (P3)**: Fully independent - can start anytime after foundation

### Parallel Opportunities

- T002, T003, T004 can run in parallel (Setup phase)
- T007, T008 can run in parallel (Foundational phase)
- US1 and US2 can be worked on in parallel (shared GitHub infrastructure)
- US3 can be worked on in parallel with US1/US2
- US4 and US5 can be worked on in parallel
- All Phase 8 tasks marked [P] can run in parallel

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: US1 (Bug Report)
4. **STOP and VALIDATE**: Test bug submission end-to-end
5. Deploy/demo if ready

### Full P1 Delivery (US1 + US2)

1. Complete Setup + Foundational
2. Add US1 (Bug Report) -> Test independently
3. Add US2 (Feature Request) -> Test independently
4. Both P1 stories complete and working

### Incremental Delivery

1. Setup + Foundational -> Foundation ready
2. US1 + US2 (P1) -> MVP with bug/feature reporting
3. US3 (P2) -> Add general feedback
4. US4 (P2) -> Add admin management
5. US5 (P3) -> Add notifications
6. Polish -> Production ready

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Each user story is independently testable
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
- All UI must use non-technical language per FR-004
