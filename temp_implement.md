# System Email Implementation Tracking

**Feature**: Critical Transactional Emails (GitHub Issue #81)
**Started**: 2025-01-04
**Tasks File**: `specs/003-system-email/tasks.md`

---

## Phase 1: Setup (T001-T006) ✅ COMPLETED

### T001 - Create infra/ directory structure
- Created `infra/bin/`, `infra/lib/constructs/` directories
- CDK project structure for AWS infrastructure

### T002 - Create CDK package.json
- Created `infra/package.json` with:
  - `aws-cdk-lib@^2.180.0`
  - `constructs@^10.4.0`
  - `source-map-support`, `typescript`, `ts-node`

### T003 - Create CDK tsconfig.json
- Created `infra/tsconfig.json` configured for Node.js 18+
- ES2022 target, CommonJS module

### T004 - Create CDK cdk.json
- Created `infra/cdk.json` with app entry point
- Watch configuration for development

### T005 - Create lambda/ directory structure
- Created `lambda/welcome-workflow/steps/`
- Created `lambda/delivery-handler/`
- Created `lambda/shared/templates/`

### T006 - Add AWS SDK dependencies to main package.json
- Added `@aws-sdk/client-lambda@^3.750.0`
- Added `@aws-sdk/client-ses@^3.750.0`

---

## Phase 2: Foundational - CDK Infrastructure (T013-T018) ✅ COMPLETED

### T013 - Create CDK app entry point
- Created `infra/bin/system-email.ts`
- App instantiation with environment configuration

### T014 - Create main stack file
- Created `infra/lib/system-email-stack.ts`
- Orchestrates SES, SNS, Lambda constructs
- Creates SES Configuration Set for delivery tracking

### T015 - Create SES domain construct
- Created `infra/lib/constructs/ses-domain.ts`
- Email identity with DKIM verification
- MAIL FROM domain configuration
- Output: Verified identity ARN

### T016 - Create Lambda Durable Function construct
- Created `infra/lib/constructs/durable-workflow.ts`
- Node.js 20 runtime with ARM64
- SES send permissions
- Output: Function ARN

### T017 - Create delivery handler construct
- Created `infra/lib/constructs/delivery-handler.ts`
- SNS subscription for SES delivery events
- Handles bounce, complaint, delivery notifications

### T018 - Wire constructs in main stack
- Connected all constructs in `system-email-stack.ts`
- SNS topic for delivery events
- Configuration Set with SNS destination

---

## Phase 2: Foundational - Email Templates (T027-T030) ✅ COMPLETED

### T027 - Create Lambda handlers
- Created `lambda/welcome-workflow/index.ts` - Main workflow handler
- Created `lambda/welcome-workflow/steps/send-welcome.ts` - Email step
- Created `lambda/welcome-workflow/steps/checkpoint.ts` - Convex sync step
- Created `lambda/delivery-handler/index.ts` - SNS event processor

### T028 - Create shared email service
- Created `lambda/shared/email-service.ts`
- SES wrapper with template rendering
- Supports `{{placeholder}}` variable substitution

### T029 - Create template loader
- Created `lambda/shared/templates/index.ts`
- Dynamic template loading from filesystem
- Subject line management

### T030 - Create HTML email templates
- Created `lambda/shared/templates/welcome-new-user.html`
- Created `lambda/shared/templates/welcome-team-member.html`
- Created `lambda/shared/templates/invitation.html`
- All templates include unsubscribe links and company footer

---

## Phase 2: Foundational - Database Schema (T007-T012) ✅ COMPLETED

### T007-T008 - Add email constants to statuses.ts
- Added `EMAIL_TEMPLATE_TYPES`: welcome_new_user, welcome_team_member, invitation, onboarding_day1/3/7, password_reset, email_verification
- Added `EMAIL_STATUSES`: sent, delivered, bounced, complained, rejected, opened, clicked
- Added `EMAIL_SUPPRESSION_REASONS`: bounce, complaint, unsubscribe
- Added `WORKFLOW_TYPES`: welcome_new_user, welcome_team_member
- Added `WORKFLOW_STATUSES`: running, paused, completed, failed

### T009-T010 - Add validators to convex/lib/validators.ts
- Added `emailTemplateTypeValidator`
- Added `emailStatusValidator`
- Added `emailSuppressionReasonValidator`
- Added `workflowTypeValidator`
- Added `workflowStatusValidator`

### T011-T012 - Add tables to convex/schema.ts
- **email_preferences**: User-level email preferences (marketing, onboarding tips, product updates, global unsubscribe)
- **email_logs**: Track all email sends with SES message ID, delivery status, engagement metrics
- **email_suppressions**: Track undeliverable addresses (bounces, complaints, unsubscribes)
- **workflow_executions**: Track Lambda Durable Function state (executionId = Svix webhook ID for idempotency)

---

## Phase 2: Foundational - Convex Functions (T019-T026) ✅ COMPLETED

### T019-T022 - Email functions (convex/functions/emails.ts)
**Queries:**
- `isEmailSuppressed`: Check if email address is suppressed
- `getEmailSuppression`: Get suppression details
- `getEmailPreferences`: Get user preferences (returns defaults if not set)
- `getEmailLogByMessageId`: Lookup by SES Message ID
- `getEmailLogsForUser`: User email history
- `getEmailLogsForBusiness`: Admin view of business emails

**Mutations:**
- `logEmailSend`: Log email after SES send
- `logDeliveryEvent`: Update status from SNS notifications
- `markEmailUndeliverable`: Add to suppression list
- `updateEmailPreferences`: Update user preferences
- `getOrCreateEmailPreferences`: Ensure preferences exist

### T023-T026 - Workflow functions (convex/functions/workflows.ts)
**Queries:**
- `getByExecutionId`: Idempotency check using Svix webhook ID
- `getById`: Get workflow by Convex ID
- `getWorkflowsForUser`: User's workflow history
- `getRunningWorkflows`: Monitoring query
- `getFailedWorkflows`: Debugging query

**Mutations:**
- `createWorkflowExecution`: Create with idempotency check
- `updateWorkflowStatus`: Update stage/status
- `completeWorkflow`: Mark completed
- `failWorkflow`: Mark failed with error message

---

## Build Configuration

### tsconfig.json Update
- Excluded `infra/**` and `lambda/**` from Next.js TypeScript compilation
- CDK and Lambda have their own tsconfig files

---

## Phase 3: Stripe Configuration (T031-T036) ✅ COMPLETED

### T031 - Customer Portal Configuration (API)
- Created billing portal config via Stripe CLI: `bpc_1SlzV02VdEm3MQFk8hlpHR1O`
- Features enabled:
  - Customer Update (email, name)
  - Invoice History
  - Payment Method Update
  - Subscription Cancel (end of period, with reasons)
- Cancellation reasons: too_expensive, missing_features, switched_service, unused, other
- Business profile: Privacy policy and ToS URLs configured

### T032-T035 - Email Automation (Manual Dashboard Required)
**Note**: Stripe API does NOT support programmatic configuration of email automation.

Manual steps documented in `specs/003-system-email/stripe-config.md`:
- T032: Trial reminder emails (7 days before expiration)
- T033: Smart Retries enabled
- T034: Payment failure customer emails
- T035: Payment recovery confirmation emails

### T036 - Documentation
- Created `specs/003-system-email/stripe-config.md` with:
  - All configuration details
  - Manual dashboard steps
  - Production deployment checklist
  - API code examples for billing portal sessions

---

## Phase 4: US3 Welcome Email (T037-T055) ✅ COMPLETED

### T037-T042 - Lambda Client Setup ✅
- Created `src/lib/aws/lambda-client.ts`:
  - `getLambdaClient()`: Singleton Lambda client with AWS SDK v3
  - `WelcomeWorkflowPayload` interface: userId, clerkUserId, email, firstName, executionId, isTeamMember
  - `triggerWelcomeWorkflow()`: Async invocation (fire-and-forget) with StatusCode 202
  - `isWelcomeWorkflowConfigured()`: Graceful degradation check for WELCOME_WORKFLOW_LAMBDA_ARN

### T043-T049 - Clerk Webhook Integration ✅
- Updated `src/domains/system/lib/webhook.service.ts`:
  - Added imports for `triggerWelcomeWorkflow`, `isWelcomeWorkflowConfigured`, `WelcomeWorkflowPayload`
  - Modified `handleClerkUserCreated(user, svixId?)` to accept optional svixId parameter
  - Added welcome workflow trigger after successful user creation
  - Graceful degradation: Logs info message if Lambda not configured (dev mode)
  - Non-blocking: Email failure doesn't fail the webhook

- Updated `src/app/api/v1/system/webhooks/clerk/route.ts`:
  - Passes `svixId` to `handleClerkUserCreated()` for idempotency

**Key Implementation Details:**
- Uses `svix-id` header as `executionId` for Lambda workflow idempotency
- `isTeamMember = (result.action === 'invitation_linked')` distinguishes signup scenarios
- Lambda invocation uses `InvocationType: 'Event'` for async processing

### T050-T052 - Delivery Tracking ✅ (Completed in Phase 2)
- `lambda/delivery-handler/index.ts`: Full SNS event processing
- `infra/lib/constructs/delivery-handler.ts`: CDK construct with SNS subscription
- Handles: Bounce, Complaint, Delivery, Open, Click events
- Writes to Convex: `emails:logDeliveryEvent`, `emails:markEmailUndeliverable`

### T053-T055 - Environment Configuration ✅
- Updated `.env.example` with AWS SES variables:
  - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
  - `WELCOME_WORKFLOW_LAMBDA_ARN` (empty for dev graceful degradation)
  - `SES_FROM_EMAIL`, `SES_CONFIGURATION_SET`

---

## Phase 5: US4 Email Preferences (T056-T069) ✅ COMPLETED

### T056-T057 - Email Preferences API ✅
- Created `src/app/api/v1/email-preferences/route.ts`
- GET: Retrieve user preferences (Clerk auth required)
- PATCH: Update preferences with field validation
- Uses `api.functions.emails.getEmailPreferences` and `updateEmailPreferences`

### T058-T059 - Convex Functions ✅ (Already Existed)
- `convex/functions/emails.ts` already contains:
  - `getEmailPreferences`: Returns defaults if none set
  - `updateEmailPreferences`: Creates or updates preferences
  - `getOrCreateEmailPreferences`: Ensures preferences exist

### T060-T061 - Unsubscribe Routes ✅
- Created `src/app/api/v1/unsubscribe/route.ts`
- GET: Renders HTML confirmation page with token verification
- POST: Processes unsubscribe request and updates Convex
- Includes HTML templates for confirmation and error pages

### T062 - One-Click Unsubscribe (RFC 8058) ✅
- Created `src/app/api/v1/unsubscribe/one-click/route.ts`
- POST: Handles RFC 8058 one-click unsubscribe from email clients
- GET: Redirects to main unsubscribe page
- Email clients send `List-Unsubscribe=One-Click` in POST body

### T063-T064 - JWT Unsubscribe Token Service ✅
- Created `src/lib/services/unsubscribe-token.ts`
- `generateUnsubscribeToken()`: Creates 7-day JWT with userId, email, type
- `verifyUnsubscribeToken()`: Validates signature and expiration
- `generateUnsubscribeUrl()`: Full URL for GET requests
- `generateOneClickUrl()`: URL for RFC 8058 POST requests
- `generateUnsubscribeHeaders()`: List-Unsubscribe headers for emails

### T065 - Unsubscribe Confirmation Page ✅
- Created `src/app/api/v1/unsubscribe/success/route.ts`
- Clean HTML success page with:
  - Visual confirmation icon
  - Explanation of what was unsubscribed
  - Note about transactional emails still being sent
  - Links to FinanSEAL and preference management

### T066-T067 - Email Templates Updated ✅
- Updated `lambda/shared/email-service.ts`:
  - Switched to `SendRawEmailCommand` for custom headers
  - Added `buildRawEmail()` function for MIME message construction
  - Injects RFC 8058 `List-Unsubscribe` and `List-Unsubscribe-Post` headers
  - Templates already have `{{unsubscribeUrl}}` placeholder

### T068-T069 - Suppression Check Integration ✅
- Enhanced `lambda/shared/email-service.ts`:
  - `isEmailSuppressed()`: Checks Convex email_suppressions table
  - `isEmailTypeDisabled()`: Checks user preferences by email type
  - Both functions use Convex HTTP API for Lambda compatibility
  - Fail-open pattern: allows sending if check fails

---

## Notes

- **Idempotency Pattern**: Using Svix webhook ID (`svix-id` header) as `executionId` to prevent duplicate webhook processing
- **Architecture**: Lambda Durable Functions with `context.step()` checkpointing for long-running workflows
- **Email Delivery**: Amazon SES with Configuration Sets and SNS delivery notifications
