# Implementation Tasks: EventBridge Migration for Scheduled Intelligence Jobs

**Branch**: `030-eventbridge-migration` | **Date**: 2026-03-20

## Summary

Total: **52 tasks** across 7 phases

- Phase 1 (Setup): 4 tasks
- Phase 2 (Foundational): 8 tasks
- Phase 3 (US1 - Migrate 8 Heavy Crons): 16 tasks
- Phase 4 (US2 - Re-Enable 2 Disabled Crons): 4 tasks
- Phase 5 (US3 - Add 3 New Crons): 6 tasks
- Phase 6 (US4 - Cleanup & Documentation): 8 tasks
- Phase 7 (Polish): 6 tasks

**Parallel opportunities**: 22 tasks marked with [P] can run in parallel within their phase.

**MVP Scope**: Phase 3 (US1) proves the migration works for 8 heavy crons (94% bandwidth reduction).

---

## Phase 1: Setup (4 tasks)

### Goal
Verify prerequisites, create CDK stack skeleton, set up SSM parameters.

### Tasks

- [ ] T001 Verify finanseal-dspy-optimizer Lambda exists in document-processing-stack.ts (infra/lib/document-processing-stack.ts)
- [ ] T002 Verify Convex deployment key parameter exists in SSM (/finanseal/convex-deployment-key) or create if missing
- [ ] T003 Create scheduled-intelligence-stack.ts skeleton (infra/lib/scheduled-intelligence-stack.ts)
- [ ] T004 Create Lambda source directory structure: src/lambda/scheduled-intelligence/ with index.ts, lib/, modules/

---

## Phase 2: Foundational (8 tasks)

### Goal
Build shared infrastructure that all user stories depend on: Lambda dispatcher, Convex HTTP client, types, CDK patterns.

### Independent Test Criteria
- Lambda handler validates EventBridge event payload and extracts module name
- Convex HTTP client successfully calls internalAction via deployment key
- Module dispatcher routes to correct handler function based on module name
- All shared types compile without errors

### Tasks

- [ ] T005 [P] Create EventBridgeEvent and JobModule types in src/lambda/scheduled-intelligence/lib/types.ts
- [ ] T006 [P] Create JobResult type with status, durationMs, documentsRead, documentsWritten fields in src/lambda/scheduled-intelligence/lib/types.ts
- [ ] T007 [P] Implement Convex HTTP API client with deploymentKey auth in src/lambda/scheduled-intelligence/lib/convex-client.ts
- [ ] T008 [P] Implement Lambda invoker for Python DSPy optimizer in src/lambda/scheduled-intelligence/lib/lambda-invoker.ts
- [ ] T009 Create Lambda handler with module dispatcher switch statement in src/lambda/scheduled-intelligence/index.ts
- [ ] T010 Add error handling wrapper with JobResult error mapping in src/lambda/scheduled-intelligence/index.ts
- [ ] T011 Create package.json with @aws-sdk/client-lambda, @aws-sdk/client-ssm dependencies in src/lambda/scheduled-intelligence/
- [ ] T012 Add tsconfig.json for esbuild bundling in src/lambda/scheduled-intelligence/

---

## Phase 3: US1 - Migrate 8 Heavy Crons to EventBridge (P1)

### Goal
Migrate the 8 heaviest Convex cron jobs to EventBridge + Lambda to reduce bandwidth from ~446 MB/month to ~25 MB/month.

### Independent Test Criteria
- Each of the 8 migrated jobs executes successfully when triggered manually via AWS Lambda invoke
- Each job calls the correct Convex action (verify functionPath in logs)
- Each job returns JobResult with status="success" and expected documentsRead count
- CloudWatch Logs show execution duration < 5 minutes for all jobs
- Manual test: proactive-analysis creates insights in Action Center
- Manual test: notification-digest sends emails at configured time

### Tasks

- [ ] T013 [P] [US1] Create runProactiveAnalysis module calling functions/actionCenterJobs:runProactiveAnalysis (src/lambda/scheduled-intelligence/modules/proactive-analysis.ts)
- [ ] T014 [P] [US1] Create runAIDiscovery module calling functions/actionCenterJobs:runAIDiscovery (src/lambda/scheduled-intelligence/modules/ai-discovery.ts)
- [ ] T015 [P] [US1] Create runNotificationDigest module calling functions/notificationJobs:runDigest (src/lambda/scheduled-intelligence/modules/notification-digest.ts)
- [ ] T016 [P] [US1] Create runEinvoiceMonitoring module calling functions/einvoiceMonitoring:runMonitoringCycle (src/lambda/scheduled-intelligence/modules/einvoice-monitoring.ts)
- [ ] T017 [P] [US1] Create runDspyOptimization dispatcher module that invokes Python Lambda for fee/bank-recon/po-match/ar-match (src/lambda/scheduled-intelligence/modules/dspy-optimization.ts)
- [ ] T018 [US1] Register proactive-analysis handler in index.ts dispatcher switch
- [ ] T019 [US1] Register ai-discovery handler in index.ts dispatcher switch
- [ ] T020 [US1] Register notification-digest handler in index.ts dispatcher switch
- [ ] T021 [US1] Register einvoice-monitoring handler in index.ts dispatcher switch
- [ ] T022 [US1] Register dspy-fee/bank-recon/po-match/ar-match handlers in index.ts dispatcher switch
- [ ] T023 [US1] Add EventBridge rule for proactive-analysis (daily 4am UTC) in scheduled-intelligence-stack.ts
- [ ] T024 [US1] Add EventBridge rule for ai-discovery (daily 7am UTC) in scheduled-intelligence-stack.ts
- [ ] T025 [US1] Add EventBridge rule for notification-digest (daily 8am UTC) in scheduled-intelligence-stack.ts
- [ ] T026 [US1] Add EventBridge rule for einvoice-monitoring (daily 8:30am UTC) in scheduled-intelligence-stack.ts
- [ ] T027 [US1] Add EventBridge rules for dspy-fee (Sun 2am), dspy-bank-recon (Sun 3am), dspy-po-match (Sun 4am), dspy-ar-match (Sun 5am UTC) in scheduled-intelligence-stack.ts
- [ ] T028 [US1] Add Lambda function definition with Node.js 20 ARM_64 512MB 5min timeout in scheduled-intelligence-stack.ts

---

## Phase 4: US2 - Re-Enable 2 Disabled Crons via EventBridge (P2)

### Goal
Re-enable ai-daily-digest (was hourly, now daily) and einvoice-dspy-weekly-digest via EventBridge instead of Convex crons.

### Independent Test Criteria
- ai-daily-digest runs daily (not hourly) and produces digest output
- einvoice-dspy-weekly-digest runs Monday 1am UTC and emails dev team
- Convex bandwidth from these 2 jobs < 2 MB/month combined

### Tasks

- [ ] T029 [P] [US2] Create runAIDailyDigest module calling functions/actionCenterJobs:runAIDailyDigest (src/lambda/scheduled-intelligence/modules/ai-daily-digest.ts)
- [ ] T030 [P] [US2] Create runEinvoiceDspyDigest module calling functions/einvoiceDspyJobs:runWeeklyDigest (src/lambda/scheduled-intelligence/modules/einvoice-dspy-digest.ts)
- [ ] T031 [US2] Add EventBridge rule for ai-daily-digest (daily 6am UTC, NOT hourly) in scheduled-intelligence-stack.ts
- [ ] T032 [US2] Add EventBridge rule for einvoice-dspy-digest (Monday 1am UTC) in scheduled-intelligence-stack.ts

---

## Phase 5: US3 - Add 3 New Crons via EventBridge (P3)

### Goal
Add new scheduled intelligence capabilities (chat-agent-optimization, weekly-email-digest, scheduled-reports) as EventBridge-first from inception.

### Independent Test Criteria
- chat-agent-optimization runs weekly (Sunday 6am UTC) and triggers DSPy training for chat agent
- weekly-email-digest runs Monday 8am UTC and sends business admin digest
- scheduled-reports runs daily and executes configured report jobs

### Tasks

- [ ] T033 [P] [US3] Create runChatAgentOptimization module calling chatOptimizationNew:weeklyOptimization via Convex (src/lambda/scheduled-intelligence/modules/chat-agent-optimization.ts)
- [ ] T034 [P] [US3] Create runWeeklyEmailDigest module calling functions/emailDigestJobs:runWeeklyDigest (src/lambda/scheduled-intelligence/modules/weekly-email-digest.ts)
- [ ] T035 [P] [US3] Create runScheduledReports module calling functions/scheduledReportJobs:runScheduledReports (src/lambda/scheduled-intelligence/modules/scheduled-reports.ts)
- [ ] T036 [US3] Add EventBridge rule for chat-agent-optimization (Sunday 6am UTC) in scheduled-intelligence-stack.ts
- [ ] T037 [US3] Add EventBridge rule for weekly-email-digest (Monday 8am UTC) in scheduled-intelligence-stack.ts
- [ ] T038 [US3] Add EventBridge rule for scheduled-reports (daily 9am UTC) in scheduled-intelligence-stack.ts

---

## Phase 6: US4 - Cleanup & Documentation (P4)

### Goal
Clean up convex/crons.ts, document EventBridge-first pattern, prepare 48-hour verification.

### Independent Test Criteria
- convex/crons.ts contains zero commented-out cron definitions after cleanup
- convex/crons.ts has inline comment: "If job reads >10 docs, use EventBridge (see infra/lib/scheduled-intelligence-stack.ts)"
- CLAUDE.md Rule 6 confirms EventBridge-first pattern for heavy crons
- Quickstart.md contains complete deployment + verification runbook

### Tasks

- [ ] T039 [US4] Add CloudWatch alarm for Lambda errors > 3 in 1 hour in scheduled-intelligence-stack.ts
- [ ] T040 [US4] Add CloudWatch alarm for DLQ depth > 5 messages in scheduled-intelligence-stack.ts
- [ ] T041 [US4] Add SNS topic + email subscription for alarm notifications in scheduled-intelligence-stack.ts
- [ ] T042 [US4] Add SQS DLQ for EventBridge rule failures with 14-day retention in scheduled-intelligence-stack.ts
- [ ] T043 [US4] Deploy CDK stack to staging: npx cdk deploy FinansealScheduledIntelligence-staging
- [ ] T044 [US4] Run 48-hour verification: monitor CloudWatch logs, check all 13 jobs execute successfully
- [ ] T045 [US4] Delete 10 migrated cron definitions from convex/crons.ts (keep lightweight crons only)
- [ ] T046 [US4] Add inline comment to convex/crons.ts header explaining EventBridge-first decision rule

---

## Phase 7: Polish & Cross-Cutting Concerns (6 tasks)

### Goal
Final testing, documentation updates, bandwidth measurement.

### Tasks

- [ ] T047 [P] Update CLAUDE.md with EventBridge-first pattern confirmation (CLAUDE.md)
- [ ] T048 [P] Add Lambda invocation examples to quickstart.md for each job module (specs/030-eventbridge-migration/quickstart.md)
- [ ] T049 Test manual invocation for all 13 jobs via AWS Lambda invoke (see quickstart.md)
- [ ] T050 Measure Convex bandwidth over 7 days post-migration (target <30 MB/month, down from ~446 MB/month)
- [ ] T051 Create migration completion report: bandwidth reduction %, cost savings, lessons learned
- [ ] T052 Update project README or docs/architecture/ with EventBridge migration summary

---

## Dependencies

### User Story Completion Order

```
Phase 1 (Setup)
  ↓
Phase 2 (Foundational)
  ↓
Phase 3 (US1 - Migrate 8 Heavy Crons) ← MVP milestone
  ↓
Phase 4 (US2 - Re-Enable 2 Disabled Crons) ← Independent of US1
  ↓
Phase 5 (US3 - Add 3 New Crons) ← Independent of US1
  ↓
Phase 6 (US4 - Cleanup & Documentation) ← Depends on US1 working
  ↓
Phase 7 (Polish)
```

**Critical path**: Setup → Foundational → US1 → US4 (cleanup after verification)

**Independent stories**: US2, US3 can be implemented in any order after Foundational phase.

---

## Parallel Execution Examples

### Phase 2 (Foundational)
Run in parallel:
- T005, T006 (types)
- T007, T008 (Convex client, Lambda invoker)

Sequential:
- T009 → T010 (handler skeleton → error handling)
- T011 → T012 (package.json → tsconfig)

### Phase 3 (US1 - Migrate 8 Heavy Crons)
Run in parallel:
- T013, T014, T015, T016, T017 (all 5 module files)

Sequential:
- T013-T017 → T018-T022 (modules → handler registration)
- T018-T022 → T023-T027 (handler registration → EventBridge rules)
- T023-T027 → T028 (EventBridge rules → Lambda definition)

### Phase 4 (US2 - Re-Enable 2 Disabled Crons)
Run in parallel:
- T029, T030 (both module files)

Sequential:
- T029-T030 → T031-T032 (modules → EventBridge rules)

### Phase 5 (US3 - Add 3 New Crons)
Run in parallel:
- T033, T034, T035 (all 3 module files)

Sequential:
- T033-T035 → T036-T038 (modules → EventBridge rules)

### Phase 7 (Polish)
Run in parallel:
- T047, T048 (docs updates)

Sequential:
- T049 → T050 → T051 → T052 (testing → measurement → reporting)

---

## Implementation Strategy

**Incremental delivery in 4 milestones:**

1. **MVP: Phase 3 (US1)** — Migrate 8 heavy crons, prove 94% bandwidth reduction
2. **Value-add: Phase 4 (US2)** — Re-enable disabled jobs that provide intelligence value
3. **Future-proofing: Phase 5 (US3)** — Add new jobs EventBridge-first from inception
4. **Production-ready: Phase 6 (US4)** — Clean up Convex crons, document pattern, verify for 48 hours

Each phase is independently testable and deployable.

---

## Validation Checklist

Before marking this feature complete:

- [ ] All 52 tasks completed
- [ ] CDK stack deploys successfully: `npx cdk deploy FinansealScheduledIntelligence-staging`
- [ ] All 13 Lambda modules exist and compile
- [ ] Manual test invocation succeeds for all 13 jobs
- [ ] 48-hour verification complete: all jobs executed successfully, DLQ depth = 0, no CloudWatch alarms
- [ ] Convex bandwidth measured: <30 MB/month (down from ~446 MB/month = 93%+ reduction)
- [ ] Convex crons deleted: zero migrated cron definitions remain in convex/crons.ts
- [ ] Documentation complete: CLAUDE.md, quickstart.md, inline comments in crons.ts
- [ ] Migration report written: bandwidth reduction, cost savings, lessons learned
