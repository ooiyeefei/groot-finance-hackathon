# Feature Specification: EventBridge Migration for Scheduled Intelligence Jobs

**Feature Branch**: `030-eventbridge-migration`
**Created**: 2026-03-19
**Status**: Draft
**Input**: User description: "Migrate DSPy crons + heavy analysis to EventBridge -- stop burning Convex bandwidth (94% reduction)"

## Clarifications

### Session 2026-03-20

- **Q: Should crons be migrated incrementally (one at a time) or all at once?** → A: All at once. Deploy all EventBridge rules + Lambda in one CDK deploy, verify outputs for 48 hours, then remove all migrated Convex crons in one commit. CDK stack as single source of truth — no ad-hoc resource creation.
- **Q: Should there be one Lambda or multiple Lambdas for isolation?** → A: **Two Lambdas**: (1) **`finanseal-scheduled-intelligence`** (Node.js 20, ARM_64) for analysis/digest/monitoring jobs with `module` parameter dispatch, (2) **`finanseal-dspy-optimizer`** (Python 3.11, Docker, x86_64, **already exists**) for DSPy training. The Node.js Lambda invokes the Python Lambda when `module` starts with `dspy-`. This balances isolation (runtime separation) with maintainability (no 8× CDK definitions).
- **Q: What is the rollback strategy if a migrated job has a bug discovered after Convex cron deletion?** → A: Fix forward. If a bug is discovered post-migration, fix the Lambda code forward. Convex cron code is deleted immediately after 48-hour verification window, not kept as commented fallback. Proper cleanup: one commit removes all migrated cron definitions from `convex/crons.ts`.
- **Q: Should failed jobs trigger active alerts or rely on passive CloudWatch logs + DLQ?** → A: CloudWatch alarm → SNS email notification if any daily job fails or misses its schedule. Weekly jobs tolerate one missed execution silently (only alert on 2+ consecutive failures). Fully within AWS Free Tier (10 alarms free, 1,000 SNS emails free).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Migrate Heavy Scanning Crons to EventBridge (Priority: P1)

As the platform operator, I need the 8 heaviest Convex cron jobs migrated to AWS EventBridge so that Convex bandwidth consumption drops from ~446 MB/month to ~25 MB/month, keeping the system safely within the Free plan's 2 GB limit and preventing service degradation.

**Why this priority**: This is the bandwidth emergency. The 8 heavy crons account for ~430 MB/month of Convex bandwidth -- nearly 22% of the Free plan ceiling. Any growth in business count or data volume risks hitting the 2 GB wall and causing service disruption. Every day these crons run inside Convex, bandwidth is burned unnecessarily.

**Independent Test**: Deploy all EventBridge rules and Lambda handlers in one CDK deploy, verify each job executes at its configured time for 48 hours, then remove all migrated Convex crons in one commit. Confirm Convex bandwidth for these jobs drops to under 10 MB/month.

**Acceptance Scenarios**:

1. **Given** all 8 migrated crons and the 2 Lambda functions are deployed via CDK, **When** the first scheduled execution time arrives for each job, **Then** the EventBridge rule triggers the appropriate Lambda (Node.js dispatcher or Python DSPy optimizer), which reads data via Convex HTTP API, processes externally, and writes results back.

2. **Given** the `proactive-analysis` cron currently runs daily at 6:30 AM UTC inside Convex and scans invoices, expenses, and journal_entries for all businesses, **When** it is migrated to EventBridge, **Then** an EventBridge rule triggers the Node.js Lambda at 6:30 AM UTC with `module: "proactive-analysis"`, which reads the same data via Convex HTTP API, runs the same analysis logic, and writes `actionCenterInsights` back via Convex HTTP mutation.

3. **Given** the 4 weekly DSPy optimization crons (`dspy-fee-optimization`, `bank-recon-optimization`, `po-match-optimization`, `ar-match-dspy-optimization`) currently run inside Convex on Sundays, **When** they are migrated to EventBridge, **Then** each triggers the Node.js Lambda at its respective hour (2/3/4/5 AM UTC Sunday) with `module: "dspy-fee"` (etc.), which reads corrections via Convex HTTP API, invokes the Python `finanseal-dspy-optimizer` Lambda for training, and writes model version results back.

4. **Given** the `ai-discovery` cron currently runs daily at 7 AM UTC scanning multiple tables plus making LLM calls per business, **When** it is migrated to EventBridge, **Then** the Node.js Lambda handles both the data reads and LLM calls externally, only writing discovered insights back to Convex.

5. **Given** the `notification-digest` cron reads notifications per user daily at 8 AM UTC, **When** it is migrated to EventBridge, **Then** the Node.js Lambda reads unread notification counts via Convex HTTP API and triggers digest emails via SES, without Convex re-reading notification tables reactively.

6. **Given** the `einvoice-monitoring` cron runs daily at 8:30 AM UTC scanning e-invoice records, **When** it is migrated to EventBridge, **Then** the Node.js Lambda reads e-invoice error data via Convex HTTP API, categorizes failures externally, and writes results back.

7. **Given** all EventBridge-triggered jobs have run successfully for 48 hours, **When** the verification window closes, **Then** all migrated cron definitions are removed from `convex/crons.ts` in one commit with no commented-out code left behind.

8. **Given** all 8 crons have been migrated and Convex cron code deleted, **When** Convex bandwidth is measured over a 7-day period, **Then** the combined bandwidth from these jobs is under 10 MB/month (down from ~430 MB/month).

---

### User Story 2 - Re-enable Disabled Scheduled Jobs via EventBridge (Priority: P2)

As the platform operator, I need to re-enable the `ai-daily-digest` and `einvoice-dspy-weekly-digest` jobs that were disabled due to bandwidth pressure, but route them through EventBridge so they consume negligible Convex bandwidth.

**Why this priority**: These jobs provide genuine intelligence value (daily AI digests, e-invoice DSPy performance summaries) but were disabled because running them inside Convex was too expensive. EventBridge makes them viable again at near-zero Convex bandwidth cost.

**Independent Test**: Deploy EventBridge rules for the re-enabled jobs and verify they execute on schedule. Confirm the `ai-daily-digest` produces a daily intelligence summary and the `einvoice-dspy-weekly-digest` produces a weekly e-invoice performance email, each consuming under 1 MB/month of Convex bandwidth.

**Acceptance Scenarios**:

1. **Given** the `ai-daily-digest` was disabled (commented out in crons.ts) because it was consuming ~1.96 GB/month as an hourly Convex cron, **When** it is re-enabled as a daily EventBridge rule (not hourly), **Then** it runs once per day, reads summarized data via Convex HTTP API, generates the digest externally, and writes it back, consuming under 2 MB/month of Convex bandwidth.

2. **Given** the `einvoice-dspy-weekly-digest` was disabled (commented out in crons.ts), **When** it is re-enabled as a weekly EventBridge rule running Monday 1 AM UTC, **Then** the Node.js Lambda queries e-invoice DSPy dashboard data via Convex HTTP API and emails the dev team with success rates, tier usage, and failure categories.

---

### User Story 3 - Add New Scheduled Intelligence Jobs via EventBridge (Priority: P3)

As the platform operator, I need new scheduled intelligence capabilities (chat agent DSPy optimization, weekly email digest, scheduled reports) added as EventBridge-triggered jobs from the start, following the established pattern.

**Why this priority**: These are new capabilities that do not exist yet. They should be built EventBridge-first to avoid repeating the bandwidth mistake. They add intelligence value but are not blocking any current issue.

**Independent Test**: Deploy EventBridge rules for each new job and verify execution. Confirm the chat-agent-optimization runs weekly and produces a trained model version. Confirm the weekly-email-digest sends a summary email to business admins.

**Acceptance Scenarios**:

1. **Given** chat agent corrections are being collected in the `chat_agent_corrections` table, **When** the `chat-agent-optimization` EventBridge rule fires weekly (Sunday 6 AM UTC), **Then** the Node.js Lambda reads corrections via Convex HTTP API, invokes the Python `finanseal-dspy-optimizer` Lambda for chat module training, and writes model version results back to Convex.

2. **Given** a business has financial activity in the past week, **When** the `weekly-email-digest` EventBridge rule fires (Monday 8 AM UTC), **Then** the Node.js Lambda reads summarized weekly metrics via Convex HTTP API and sends a formatted digest email to the business admin via SES.

3. **Given** a business admin has configured scheduled reports, **When** the `scheduled-reports` EventBridge rule fires daily, **Then** the Node.js Lambda reads the report configuration and necessary data via Convex HTTP API, generates the report externally, and delivers it via the configured channel (email or in-app).

---

### User Story 4 - Clean Up crons.ts and Document the Pattern (Priority: P4)

As a developer, I need the migrated crons removed from `convex/crons.ts` (not just commented out) and the EventBridge-first pattern documented, so future developers do not accidentally re-add heavy crons inside Convex.

**Why this priority**: Leaving dead code and commented-out crons in crons.ts creates confusion and risks accidental re-enablement. Clear documentation prevents repeating the bandwidth mistake.

**Independent Test**: After migration, verify crons.ts contains only the lightweight crons (<10 doc reads each). Verify a developer reference exists explaining when to use Convex crons vs EventBridge.

**Acceptance Scenarios**:

1. **Given** all 8 heavy crons and 2 re-enabled crons have been migrated to EventBridge and verified for 48 hours, **When** a developer reviews `convex/crons.ts`, **Then** it contains only the lightweight crons (deadline-tracking, cleanup-*, mark-overdue, generate-recurring, expire-credit-packs, attendance, timesheet, PDPA retention, manual-subscription-expiry) with zero commented-out cron definitions.

2. **Given** a developer wants to add a new scheduled job, **When** they read the inline documentation at the top of crons.ts, **Then** they find a clear decision rule: "If the job reads >10 documents or scans tables for all businesses, use EventBridge (see infra/lib/scheduled-intelligence-stack.ts). Otherwise, use a Convex cron."

3. **Given** the EventBridge rules are deployed, **When** a developer reviews the CDK stack (`infra/lib/scheduled-intelligence-stack.ts`), **Then** each rule has a descriptive name, schedule expression, and comment linking back to the original cron it replaced (or noting if it's a new job).

---

### Edge Cases

- **Convex HTTP API unavailability**: If the Convex HTTP API is temporarily unavailable during a Lambda invocation, the Lambda retries with exponential backoff (up to 3 attempts) and logs the failure to CloudWatch. EventBridge has built-in retry with dead-letter queue.
- **Lambda timeout**: If a DSPy optimization Lambda exceeds its 15-minute timeout, the EventBridge rule DLQ captures the failure. CloudWatch alarm triggers SNS email if 2+ consecutive DSPy runs fail.
- **Race condition (new business)**: If a new business is created between the Lambda reading the business list and processing each business, the Lambda handles the race gracefully -- missing one business in a daily run is acceptable since it will be picked up the next day.
- **Convex key rotation**: All EventBridge-triggered Lambdas that call Convex HTTP API use the deployment key from SSM Parameter Store (not hardcoded), so rotation only requires updating one SSM parameter.
- **Overlapping executions**: Lambda concurrency is set to 1 per job module to prevent overlapping executions of the same job (e.g., slow DSPy optimization).
- **Migration cutover**: The migration is all-at-once after 48-hour verification. All EventBridge rules deployed first, verified, then all Convex crons deleted in one commit. No rollback capability — if a bug is discovered, fix the Lambda code forward.
- **Alerting false positives**: Weekly DSPy jobs only trigger alerts on 2+ consecutive failures (not single failures), since one missed weekly run is tolerable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST migrate the following 8 Convex crons to EventBridge-triggered Lambda invocations in one CDK deploy: `proactive-analysis`, `ai-discovery`, `dspy-fee-optimization`, `bank-recon-optimization`, `po-match-optimization`, `ar-match-dspy-optimization`, `notification-digest`, `einvoice-monitoring`.
- **FR-002**: System MUST re-enable `ai-daily-digest` (as daily, not hourly) and `einvoice-dspy-weekly-digest` via EventBridge, not as Convex crons.
- **FR-003**: System MUST add new scheduled jobs (`chat-agent-optimization`, `weekly-email-digest`, `scheduled-reports`) as EventBridge rules from inception.
- **FR-004**: Each EventBridge-triggered Lambda MUST read data from Convex via the HTTP API (`https://kindhearted-lynx-129.convex.cloud/api/query`) and write results back via the HTTP mutation API, not by running inside the Convex runtime.
- **FR-005**: Each EventBridge-triggered Lambda MUST authenticate to the Convex HTTP API using a deployment key stored in AWS SSM Parameter Store (SecureString), not hardcoded or passed as a Lambda environment variable in plaintext.
- **FR-006**: System MUST deploy exactly 2 Lambda functions: (1) **`finanseal-scheduled-intelligence`** (Node.js 20, ARM_64) for analysis/digest/monitoring jobs, which accepts a `module` parameter in the EventBridge event payload for job dispatch, and (2) **`finanseal-dspy-optimizer`** (Python 3.11, Docker, x86_64, **already exists**) for DSPy training, invoked by the Node.js Lambda when `module` starts with `dspy-`.
- **FR-007**: Each EventBridge rule MUST have a dead-letter queue (SQS) configured to capture failed invocations for debugging.
- **FR-008**: DSPy optimization jobs (fee, bank-recon, PO-match, AR-match, chat-agent) MUST invoke the existing `finanseal-dspy-optimizer` Lambda via AWS SDK invocation from the Node.js Lambda, not duplicate DSPy logic.
- **FR-009**: System MUST remove all migrated cron definitions from `convex/crons.ts` after 48-hour verification window, leaving only lightweight crons that read fewer than 10 documents per execution. Zero commented-out code allowed.
- **FR-010**: System MUST preserve the exact same execution schedule for migrated jobs (same hour, minute, day-of-week) to avoid behavioral changes.
- **FR-011**: System MUST preserve identical business logic and output for each migrated job -- the only change is where the code executes (Lambda vs Convex runtime), not what it computes.
- **FR-012**: All new AWS infrastructure (EventBridge rules, Lambda functions, SQS DLQs, IAM roles, CloudWatch alarms, SNS topics) MUST be defined in a single CDK stack (`infra/lib/scheduled-intelligence-stack.ts`), not created via ad-hoc CLI commands or spread across multiple stacks. CDK is single source of truth.
- **FR-013**: The Node.js Lambda function MUST use Node.js 20 runtime on ARM_64 architecture to minimize cost and cold start time.
- **FR-014**: System MUST set Lambda reserved concurrency to 1 per job module to prevent overlapping executions of the same job.
- **FR-015**: System MUST log each job execution (start time, duration, documents read, documents written, success/failure, module name) to CloudWatch for observability.
- **FR-016**: Lightweight Convex crons that remain (deadline-tracking, all cleanup-* jobs, mark-overdue-invoices, generate-recurring-invoices, expire-credit-packs, attendance/timesheet jobs, PDPA retention jobs, expire-manual-subscriptions, cleanup-expired-mcp-proposals, cleanup-empty-draft-submissions) MUST NOT be modified or removed.
- **FR-017**: System MUST create CloudWatch alarms for daily jobs (proactive-analysis, ai-discovery, notification-digest, einvoice-monitoring, ai-daily-digest) that trigger SNS email notification if a job fails or misses its schedule.
- **FR-018**: System MUST create CloudWatch alarms for weekly DSPy jobs that trigger SNS email notification only after 2+ consecutive failures (single missed weekly run is tolerated).
- **FR-019**: System MUST NOT implement rollback capability. If a bug is discovered in a migrated Lambda job after Convex cron deletion, fix the Lambda code forward. Convex cron code is permanently deleted after 48-hour verification.

### Key Entities

- **EventBridge Rule**: A scheduled trigger that fires at a defined cron expression (daily or weekly) and invokes a Lambda function with a payload specifying which job module to run. Each migrated Convex cron becomes one EventBridge rule.
- **Scheduled Intelligence Lambda** (`finanseal-scheduled-intelligence`): Node.js 20, ARM_64 Lambda function that handles all non-DSPy jobs (analysis, discovery, digest, monitoring). Receives a `module` parameter in the event payload, dispatches to the appropriate job logic, reads from Convex HTTP API, processes data locally, and writes results back. For DSPy modules, invokes the Python `finanseal-dspy-optimizer` Lambda.
- **DSPy Optimizer Lambda** (`finanseal-dspy-optimizer`): Existing Python 3.11, Docker, x86_64 Lambda function for DSPy training. Invoked by the Node.js Lambda for all `dspy-*` modules.
- **Dead-Letter Queue**: An SQS queue per EventBridge rule that captures failed Lambda invocations for debugging. Retains messages for 14 days.
- **Convex HTTP API Credential**: A Convex deployment key stored in SSM Parameter Store (SecureString) that both Lambdas use to authenticate read/write calls to the Convex HTTP API. Single parameter, shared across all job modules.
- **CloudWatch Alarm + SNS Topic**: One CloudWatch alarm per daily job (5 daily jobs = 5 alarms) and one shared alarm for weekly DSPy jobs (fires on 2+ consecutive failures). Alarms publish to an SNS topic with email subscription to dev team.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Combined Convex bandwidth from all scheduled jobs drops from ~446 MB/month to under 30 MB/month (93%+ reduction), measured over 14 consecutive days after full migration.
- **SC-002**: All 8 migrated jobs produce identical outputs (same insights, same optimized models, same notification digests, same monitoring results) as their Convex cron predecessors, verified by comparing outputs for at least 3 consecutive executions within the 48-hour verification window.
- **SC-003**: All 8 migrated jobs execute on their configured schedule without manual intervention for 14 consecutive days after deployment.
- **SC-004**: Re-enabled jobs (`ai-daily-digest`, `einvoice-dspy-weekly-digest`) successfully produce their outputs on schedule, verified by checking CloudWatch logs and output artifacts for 7 consecutive days.
- **SC-005**: New jobs (`chat-agent-optimization`, `weekly-email-digest`) execute on schedule and produce expected outputs within 14 days of deployment.
- **SC-006**: `convex/crons.ts` contains zero commented-out cron definitions and zero crons that scan more than 10 documents per execution, verified by code review after the 48-hour verification window.
- **SC-007**: No EventBridge-triggered Lambda invocation exceeds 5 minutes for daily jobs or 15 minutes for weekly DSPy optimization jobs, measured over 14 days.
- **SC-008**: Failed job executions are captured in the dead-letter queue and visible in CloudWatch, verified by intentionally triggering one failure during testing. If a daily job fails, the CloudWatch alarm triggers SNS email within 5 minutes.
- **SC-009**: Total AWS cost for all EventBridge rules, Lambda invocations, SQS DLQs, CloudWatch alarms, and SNS notifications remains under $2/month at current scale, fully within AWS Free Tier limits.
- **SC-010**: All AWS infrastructure (EventBridge rules, Lambdas, DLQs, alarms, SNS topics, IAM roles) is defined in a single CDK stack (`infra/lib/scheduled-intelligence-stack.ts`) with zero resources created via ad-hoc CLI commands, verified by CDK diff.

## Assumptions

- The Convex HTTP API (`/api/query` and `/api/mutation` endpoints) supports all the query patterns currently used by the migrated crons, including index-based filtering and multi-table reads.
- The Convex deployment key provides sufficient permissions to read all tables and write all mutations that the migrated crons currently execute.
- The existing `finanseal-dspy-optimizer` Lambda can be invoked from the new Node.js Lambda via AWS SDK Lambda invocation (IAM permissions allow cross-Lambda invocation).
- EventBridge cron expressions support the same scheduling granularity (specific hour + minute, day-of-week) as Convex's `crons.daily()` and `crons.weekly()` APIs.
- The migration is performed all-at-once: CDK deploy creates all infrastructure, 48-hour verification window, then one commit removes all Convex cron code.
- Current business count and data volume are small enough that each Lambda invocation completes well within the 15-minute Lambda timeout, even for the heaviest jobs (proactive-analysis scanning all businesses).
- AWS Free Tier coverage (EventBridge 14M events/month, Lambda 1M requests + 400K GB-seconds, CloudWatch 10 alarms, SNS 1,000 emails, SQS 1M requests) is sufficient for expected workload (~24 invocations/month per job = ~240 total invocations/month, well under 1M requests).
- The dev team's email is configured in CDK for SNS subscription (not hardcoded, passed as CDK parameter or read from SSM).
