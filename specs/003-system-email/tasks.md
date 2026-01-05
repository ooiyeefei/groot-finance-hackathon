# Tasks: Critical Transactional Emails

**Input**: Design documents from `/specs/003-system-email/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests are NOT explicitly requested in the specification. Test tasks are excluded unless needed for validation.

**Organization**: Tasks grouped by user story for independent implementation. Note: US1 and US2 are Stripe-delegated (configuration only), US3 and US4 require custom implementation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1-US4) or infrastructure task
- Paths based on plan.md project structure

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: AWS CDK project initialization and dependencies

- [ ] T001 Create `infra/` directory structure per plan.md
- [ ] T002 Initialize CDK project with `cdk init app --language typescript` in `infra/`
- [ ] T003 [P] Add CDK dependencies: `@aws-cdk/aws-lambda`, `@aws-cdk/aws-ses`, `@aws-cdk/aws-sns`
- [ ] T004 [P] Create `lambda/` directory structure with `welcome-workflow/`, `delivery-handler/`, `shared/`
- [ ] T005 [P] Initialize Lambda packages with `package.json` in each Lambda directory
- [ ] T006 Add AWS SDK dependencies to main Next.js app: `@aws-sdk/client-lambda`, `@aws-sdk/client-ses`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before user story implementation

**Warning**: No user story work can begin until this phase is complete

### Database Schema (Convex)

- [ ] T007 Add email validators to `convex/lib/validators.ts` per data-model.md
- [ ] T008 Add `email_preferences` table to `convex/schema.ts`
- [ ] T009 [P] Add `email_logs` table to `convex/schema.ts`
- [ ] T010 [P] Add `email_suppressions` table to `convex/schema.ts`
- [ ] T011 [P] Add `workflow_executions` table to `convex/schema.ts`
- [ ] T012 Run `npx convex dev` to validate schema changes

### CDK Infrastructure

- [ ] T013 Create CDK app entry point in `infra/bin/system-email.ts`
- [ ] T014 Create main stack in `infra/lib/system-email-stack.ts` with empty constructs
- [ ] T015 [P] Create SES domain verification construct in `infra/lib/constructs/ses-domain.ts` per research.md
- [ ] T016 [P] Create SES configuration set with SNS event destinations in `infra/lib/system-email-stack.ts`
- [ ] T017 [P] Create SNS topic for email delivery events in `infra/lib/system-email-stack.ts`
- [ ] T018 Run `cdk synth` to validate CDK stack

### Convex Functions

- [ ] T019 Create `convex/functions/emails.ts` with `isEmailSuppressed` query
- [ ] T020 [P] Add `getEmailPreferences` query to `convex/functions/emails.ts`
- [ ] T021 [P] Add `logEmailSend` mutation to `convex/functions/emails.ts`
- [ ] T022 [P] Add `logDeliveryEvent` mutation to `convex/functions/emails.ts`
- [ ] T023 [P] Add `markEmailUndeliverable` mutation to `convex/functions/emails.ts`
- [ ] T024 Create `convex/functions/workflows.ts` with `getByExecutionId` query (idempotency)
- [ ] T025 [P] Add `createWorkflowExecution` mutation to `convex/functions/workflows.ts`
- [ ] T026 [P] Add `updateWorkflowStatus` mutation to `convex/functions/workflows.ts`

### Shared Email Service

- [ ] T027 Create SES email service wrapper in `lambda/shared/email-service.ts`
- [ ] T028 [P] Create welcome email HTML template in `lambda/shared/templates/welcome-new-user.html`
- [ ] T029 [P] Create team member welcome template in `lambda/shared/templates/welcome-team-member.html`
- [ ] T030 [P] Create invitation email template in `lambda/shared/templates/invitation.html` (migrate from Resend)

**Checkpoint**: Foundation ready - run `cdk synth && npx convex dev` to validate

---

## Phase 3: User Story 1 & 2 - Stripe Billing Emails (Priority: P1) - MVP

**Goal**: Enable Stripe-native trial reminder and payment failure emails

**Independent Test**: Create trial subscription, verify Stripe sends reminder 7 days before expiration. Trigger test payment failure, confirm Stripe sends notification.

**Note**: These are Stripe Dashboard configurations, not code changes.

### Implementation for User Stories 1 & 2

- [ ] T031 [US1] Configure Stripe Customer Portal settings (allow payment method updates, cancellation)
- [ ] T032 [US1] Enable trial reminder emails in Stripe Dashboard (7 days before expiration)
- [ ] T033 [US2] Enable Smart Retries in Stripe Dashboard billing settings
- [ ] T034 [US2] Enable payment failure customer emails in Stripe Dashboard
- [ ] T035 [US2] Enable payment recovery confirmation emails in Stripe Dashboard
- [ ] T036 [US1][US2] Document Stripe configuration in `specs/003-system-email/stripe-config.md`

**Checkpoint**: Stripe billing emails configured - test with trial subscription and failed payment

---

## Phase 4: User Story 3 - Welcome Email (Priority: P2)

**Goal**: Send welcome email within 5 minutes of signup via Lambda Durable Functions

**Independent Test**: Create new user account, verify Lambda workflow execution starts, confirm welcome email arrives within 5 minutes

### Lambda Welcome Workflow

- [ ] T037 [US3] Create Lambda Durable Function handler in `lambda/welcome-workflow/index.ts` per research.md
- [ ] T038 [US3] Create send-welcome step in `lambda/welcome-workflow/steps/send-welcome.ts`
- [ ] T039 [US3] Create checkpoint step in `lambda/welcome-workflow/steps/checkpoint.ts`
- [ ] T040 [US3] Add durable workflow construct in `infra/lib/constructs/durable-workflow.ts`
- [ ] T041 [US3] Grant SES send permissions to Lambda in CDK stack
- [ ] T042 [US3] Deploy Lambda with `cdk deploy`

### Clerk Webhook Integration

- [ ] T043 [US3] Create Clerk webhook route at `src/app/api/v1/webhooks/clerk/route.ts` per research.md
- [ ] T044 [US3] Implement Svix signature verification using `@clerk/nextjs/webhooks`
- [ ] T045 [US3] Add idempotency check using `svix-id` header (query `workflow_executions`)
- [ ] T046 [US3] Create AWS Lambda client in `src/lib/aws/lambda-client.ts`
- [ ] T047 [US3] Implement `triggerWelcomeWorkflow()` function using AWS SDK `invoke()`
- [ ] T048 [US3] Handle `user.created` event to trigger welcome workflow
- [ ] T049 [US3] Differentiate new signup vs invited team member (check `public_metadata`)

### Delivery Tracking

- [ ] T050 [US3] Create delivery handler Lambda in `lambda/delivery-handler/index.ts` per research.md
- [ ] T051 [US3] Subscribe delivery handler to SNS topic in CDK stack
- [ ] T052 [US3] Implement bounce/complaint handling to update `email_suppressions`

### Environment Configuration

- [ ] T053 [US3] Add `CLERK_WEBHOOK_SIGNING_SECRET` to `.env.local` template
- [ ] T054 [US3] Add AWS credentials to `.env.local` template
- [ ] T055 [US3] Add `SES_CONFIGURATION_SET` and `SES_FROM_EMAIL` to `.env.local` template

**Checkpoint**: Welcome workflow functional - create new user, verify email arrives within 5 minutes

---

## Phase 5: User Story 4 - Email Preference Management (Priority: P3)

**Goal**: Allow users to manage email preferences and unsubscribe

**Independent Test**: Click unsubscribe link, verify marketing emails stop while transactional emails continue

### Email Preferences API

- [ ] T056 [US4] Create email preferences GET route at `src/app/api/v1/email-preferences/route.ts` per email-api.yaml
- [ ] T057 [US4] Implement PATCH handler for updating preferences in same route
- [ ] T058 [US4] Add `updateEmailPreferences` mutation to `convex/functions/emails.ts`
- [ ] T059 [US4] Add `getOrCreateEmailPreferences` query to `convex/functions/emails.ts`

### Unsubscribe Endpoints

- [ ] T060 [US4] Create unsubscribe GET route at `src/app/api/v1/unsubscribe/route.ts` (render page)
- [ ] T061 [US4] Implement POST handler for processing unsubscribe in same route
- [ ] T062 [US4] Create one-click unsubscribe route at `src/app/api/v1/unsubscribe/one-click/route.ts` (RFC 8058)
- [ ] T063 [US4] Implement JWT-based unsubscribe token generation in `src/lib/services/email-service.ts`
- [ ] T064 [US4] Implement JWT token verification for unsubscribe links
- [ ] T065 [US4] Create simple unsubscribe confirmation HTML page

### Email Template Updates

- [ ] T066 [US4] Add unsubscribe link with JWT token to all email templates
- [ ] T067 [US4] Add List-Unsubscribe and List-Unsubscribe-Post headers to SES emails

### Suppression Check Integration

- [ ] T068 [US4] Add suppression check before sending in `lambda/shared/email-service.ts`
- [ ] T069 [US4] Add preference check before sending marketing emails

**Checkpoint**: Email preferences functional - test unsubscribe flow, verify transactional emails still delivered

---

## Phase 6: Migration - Resend to SES

**Goal**: Migrate existing invitation emails from Resend to SES

**Independent Test**: Send invitation, verify it arrives via SES with correct branding

### Migration Tasks

- [ ] T070 Create feature flag `EMAIL_PROVIDER` in environment config
- [ ] T071 Update `src/lib/services/email-service.ts` to support SES as provider
- [ ] T072 Implement SES send function using `@aws-sdk/client-ses`
- [ ] T073 Add dual-write capability (send via both Resend and SES during transition)
- [ ] T074 Update invitation flow to use new email service
- [ ] T075 Validate SES deliverability over 2-week period
- [ ] T076 Remove Resend fallback code after validation
- [ ] T077 Remove `resend` package dependency from `package.json`

**Checkpoint**: Migration complete - all emails sending via SES

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and cross-story improvements

- [ ] T078 [P] Update quickstart.md with final setup steps
- [ ] T079 [P] Add CloudWatch alarms for Lambda errors and SES bounce rate
- [ ] T080 [P] Create admin email logs API at `src/app/api/v1/admin/email-logs/route.ts` per email-api.yaml
- [ ] T081 [P] Create admin email stats API at `src/app/api/v1/admin/email-stats/route.ts`
- [ ] T082 Run full quickstart.md validation checklist
- [ ] T083 Run `npm run build` to validate all changes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **US1 & US2 (Phase 3)**: Can start after Setup (Stripe config, no code dependency)
- **US3 (Phase 4)**: Depends on Foundational completion
- **US4 (Phase 5)**: Depends on Foundational completion
- **Migration (Phase 6)**: Depends on Foundational + US3 for SES infrastructure
- **Polish (Phase 7)**: Depends on US3 and US4 completion

### User Story Dependencies

```
Phase 1: Setup ─────────────────────────────────────────────────┐
                                                                │
Phase 2: Foundational ──────────────────────────────────────────┤
         (blocks US3, US4)                                      │
                                                                ▼
Phase 3: US1 & US2 (Stripe Config) ◄──── Can start after Setup (parallel)
         No code dependencies

Phase 4: US3 (Welcome Email) ◄───────── Depends on Foundational
         Lambda + Webhook implementation

Phase 5: US4 (Preferences) ◄─────────── Depends on Foundational
         Can run parallel to US3

Phase 6: Migration ◄─────────────────── Depends on US3 (SES infrastructure)

Phase 7: Polish ◄────────────────────── Depends on US3, US4
```

### Within Each User Story

- Database schema before functions
- Functions before API routes
- Lambda implementation before webhook integration
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

**Phase 1 (Setup)**:
- T003, T004, T005 can run in parallel

**Phase 2 (Foundational)**:
- T009, T010, T011 can run in parallel (different tables)
- T015, T016, T017 can run in parallel (CDK constructs)
- T020, T021, T022, T023 can run in parallel (Convex functions)
- T025, T026 can run in parallel
- T028, T029, T030 can run in parallel (templates)

**Phase 3 (US1 & US2)**:
- Can run parallel to Phase 2 (Stripe config vs code)

**Phase 4 (US3) & Phase 5 (US4)**:
- Can run in parallel after Foundational completion

---

## Parallel Example: User Story 3

```bash
# After Foundational phase, launch Lambda and Webhook in parallel:
Developer A: T037-T042 (Lambda Durable Function)
Developer B: T043-T049 (Clerk Webhook Route)

# Then integrate:
Both: T050-T055 (Delivery tracking and config)
```

## Parallel Example: Phase 2

```bash
# Launch all table additions together:
Task: T008 "Add email_preferences table"
Task: T009 "Add email_logs table"
Task: T010 "Add email_suppressions table"
Task: T011 "Add workflow_executions table"

# Launch all Convex functions together (after schema):
Task: T020 "Add getEmailPreferences query"
Task: T021 "Add logEmailSend mutation"
Task: T022 "Add logDeliveryEvent mutation"
Task: T023 "Add markEmailUndeliverable mutation"
```

---

## Implementation Strategy

### MVP First (US1 + US2 + US3)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL)
3. Complete Phase 3: US1 & US2 (Stripe config - can do during Phase 2)
4. Complete Phase 4: US3 (Welcome email)
5. **STOP and VALIDATE**:
   - Verify Stripe trial reminders work
   - Verify Stripe payment failure emails work
   - Verify welcome email arrives within 5 minutes
6. Deploy MVP

### Incremental Delivery

1. Setup + Foundational + US1/US2 → Stripe billing emails live
2. Add US3 → Welcome emails live
3. Add US4 → Preference management live
4. Add Migration → Consolidated to SES
5. Each increment adds value without breaking previous features

### Suggested MVP Scope

**MVP = Phase 1 + Phase 2 + Phase 3 + Phase 4**

This delivers:
- Trial ending reminders (Stripe-native)
- Payment failure recovery (Stripe-native)
- Welcome emails (Custom Lambda)

US4 (Preferences) and Migration can follow as Phase 2 deployment.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- US1 & US2 are Stripe Dashboard config only - no code changes
- US3 requires most implementation work (Lambda + Webhook + Delivery)
- US4 is self-contained preference management
- Migration phase can be deferred if Resend is working
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
