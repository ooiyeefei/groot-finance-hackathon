# Implementation Plan: EventBridge Migration for Scheduled Intelligence Jobs

**Branch**: `030-eventbridge-migration` | **Date**: 2026-03-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/030-eventbridge-migration/spec.md`

## Summary

Migrate 8 heavy Convex cron jobs to AWS EventBridge + Lambda to reduce Convex bandwidth from ~446 MB/month to ~25 MB/month (94% reduction). Deploy 2 Lambda functions: (1) Node.js dispatcher for analysis/digest/monitoring jobs, (2) existing Python DSPy optimizer for training. All EventBridge rules + Lambdas deployed via single CDK stack. After 48-hour verification, delete migrated Convex cron code.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (Node.js 20), Python 3.11 (DSPy optimizer, already exists)
**Primary Dependencies**:
- AWS CDK v2 (EventBridge, Lambda, SQS, CloudWatch, SNS)
- @aws-sdk/client-lambda (Node.js Lambda → Python Lambda invocation)
- Convex HTTP API (not Convex SDK — external read/write)
- Node.js 20 runtime (ARM_64 architecture for cost optimization)

**Storage**:
- Convex production deployment (`https://kindhearted-lynx-129.convex.cloud`)
- AWS SSM Parameter Store (Convex deployment key, SecureString)
- AWS S3 `finanseal-bucket` (DSPy model artifacts, already configured)

**Testing**:
- Integration tests (EventBridge trigger → Lambda → Convex HTTP API round-trip)
- Verification: 48-hour live monitoring, bandwidth measurement, output comparison

**Target Platform**: AWS Lambda (Node.js 20 ARM_64 + Python 3.11 x86_64 Docker)

**Project Type**: Infrastructure migration (CDK stack + Lambda functions)

**Performance Goals**:
- Daily jobs complete within 5 minutes
- Weekly DSPy optimization jobs complete within 15 minutes
- Convex HTTP API calls add <100ms overhead vs native Convex runtime

**Constraints**:
- AWS Free Tier only (EventBridge 14M events, Lambda 1M requests, CloudWatch 10 alarms, SNS 1K emails)
- Zero Convex cron bandwidth after migration (<10 MB/month from HTTP API calls)
- Preserve identical business logic (no behavioral changes)
- All-at-once migration (no incremental cutover)

**Scale/Scope**:
- 8 migrated crons + 2 re-enabled crons + 3 new crons = 13 total EventBridge rules
- 2 Lambda functions (1 new Node.js dispatcher + 1 existing Python optimizer)
- ~240 Lambda invocations/month (~24 per job)
- 15 lightweight Convex crons remain unchanged

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**No constitution file exists** — project uses CLAUDE.md for architectural rules. Key constraints extracted:

### Critical Rules from CLAUDE.md

1. **AWS CDK First (MANDATORY)**: All infrastructure via CDK. Never ad-hoc CLI changes. Single source of truth.
   - ✅ **PASS**: Single CDK stack (`scheduled-intelligence-stack.ts`) defines all resources

2. **Security — Least Privilege**: IAM policies scoped to specific resources, secrets in SSM SecureString.
   - ✅ **PASS**: Convex deployment key in SSM, Lambda execution roles least-privilege, no hardcoded secrets

3. **EventBridge-First for Heavy Jobs (Rule 6)**: Scheduled jobs reading >10 docs use EventBridge → Lambda → Convex HTTP API.
   - ✅ **PASS**: This migration implements Rule 6 enforcement

4. **Cost Optimization — Free Tier First**: Prefer AWS free tier, ARM_64 Lambda, mark @aws-sdk/* as external.
   - ✅ **PASS**: Node.js Lambda uses ARM_64, stays within free tier, external modules bundling

5. **MCP as Single Intelligence Engine**: All agent tools via MCP, not duplicated in tool factory.
   - ⚠️ **NOT APPLICABLE**: This migration moves cron scheduling, not agent tools

6. **Git Author CRITICAL**: All commits must use `grootdev-ai` identity.
   - ✅ **PASS**: Standard git workflow applies

### Post-Design Re-Check

**Status**: Constitution check PASSED. No violations requiring justification.

## Project Structure

### Documentation (this feature)

```text
specs/030-eventbridge-migration/
├── plan.md              # This file
├── research.md          # Phase 0: Convex HTTP API, EventBridge patterns, cron logic extraction
├── data-model.md        # Phase 1: CDK stack entities, Lambda event schema
├── quickstart.md        # Phase 1: Migration runbook (deploy, verify, cleanup)
├── contracts/           # Phase 1: Lambda event payloads, Convex HTTP API contracts
└── tasks.md             # Phase 2: /speckit.tasks output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
# CDK Infrastructure
infra/lib/
└── scheduled-intelligence-stack.ts    # NEW: EventBridge rules + Node.js Lambda + alarms

# Lambda Source Code
src/lambda/
└── scheduled-intelligence/            # NEW: Node.js 20 dispatcher
    ├── index.ts                       # Lambda handler (module dispatch)
    ├── modules/                       # Job-specific logic
    │   ├── proactive-analysis.ts
    │   ├── ai-discovery.ts
    │   ├── notification-digest.ts
    │   ├── einvoice-monitoring.ts
    │   ├── ai-daily-digest.ts         # Re-enabled
    │   ├── einvoice-dspy-digest.ts    # Re-enabled
    │   ├── chat-agent-optimization.ts # New
    │   ├── weekly-email-digest.ts     # New
    │   └── scheduled-reports.ts       # New
    ├── lib/
    │   ├── convex-client.ts           # Convex HTTP API wrapper
    │   ├── lambda-invoker.ts          # Invoke Python DSPy optimizer
    │   └── types.ts                   # Event payload types
    ├── package.json
    └── tsconfig.json

# Existing: Python DSPy Optimizer (no changes)
src/lambda/einvoice-form-fill-python/
└── optimization_handler.py            # Already exists in DocumentProcessingStack

# Convex Functions (modified)
convex/crons.ts                         # Delete migrated cron definitions after 48h verification
```

**Structure Decision**: Single CDK stack pattern (follows existing `document-processing-stack.ts`). Node.js Lambda uses esbuild bundling via `aws-lambda-nodejs.NodejsFunction`. Python Lambda already exists as Docker image.

## Complexity Tracking

> **No violations** — all patterns follow CLAUDE.md architectural rules.

## Phase 0: Research & Investigation

### Research Tasks

1. **Convex HTTP API Patterns** (Agent dispatched)
   - Endpoint structure (`/api/query`, `/api/mutation`)
   - Authentication via deployment key
   - Request/response format
   - Error handling

2. **Cron Job Logic Extraction** (Agent dispatched)
   - Read 8 Convex function files
   - Document query patterns, mutations, business logic
   - Identify dependencies and external API calls

3. **EventBridge Scheduling** (Agent dispatched)
   - Cron expression syntax
   - CDK patterns for Rule + Lambda target
   - DLQ and retry configuration
   - CloudWatch alarm integration

4. **Lambda Invocation Patterns**
   - Node.js → Python Lambda cross-invocation
   - Event payload structure
   - Error propagation
   - Concurrency limits

### Unknowns Requiring Research

- **Convex HTTP API auth**: How to pass deployment key? Header format? Token structure?
- **Convex query pagination**: Do heavy queries need pagination? Cursor-based or offset?
- **DSPy optimizer invocation**: Can Node.js Lambda directly invoke Python Lambda? Async or sync? Event payload format?
- **EventBridge to Convex schedule mapping**: Exact cron expression translation (Convex `hourUTC: 6, minuteUTC: 30` → EventBridge `cron(30 6 * * ? *)`)?

### Decisions Pending Research

- **Lambda timeout values**: 5 min for daily jobs, 15 min for DSPy? Or dynamic based on job type?
- **Concurrency limits**: 1 per job or 1 shared across all jobs?
- **CloudWatch alarm thresholds**: Alert on 1 failure or 2 consecutive failures?
- **SQS DLQ retention**: 14 days or 7 days?

**Output**: `research.md` with all findings consolidated from background agents.

## Phase 1: Design & Contracts

*Prerequisites: Phase 0 research.md complete*

### Data Model (`data-model.md`)

Entities:
1. **EventBridge Rule** — schedule trigger
2. **Lambda Event** — dispatched payload
3. **Convex HTTP Request/Response** — API contract
4. **CloudWatch Alarm** — failure detection
5. **SQS DLQ Message** — failed invocation record

### API Contracts (`contracts/`)

Files to generate:
1. `lambda-event-schema.json` — EventBridge → Lambda payload
2. `convex-http-query.json` — Lambda → Convex read
3. `convex-http-mutation.json` — Lambda → Convex write
4. `dspy-optimizer-event.json` — Node.js → Python Lambda invocation

### Quickstart (`quickstart.md`)

Migration runbook:
1. Deploy CDK stack
2. Monitor CloudWatch for 48 hours
3. Compare outputs (Convex cron vs EventBridge Lambda)
4. Measure bandwidth
5. Delete Convex cron code
6. Verify cleanup

### Agent Context Update

Run `.specify/scripts/bash/update-agent-context.sh claude` to add:
- AWS EventBridge Rules
- AWS Lambda (Node.js 20 ARM_64 + Python 3.11 Docker)
- AWS SQS (DLQ)
- AWS CloudWatch Alarms
- AWS SNS (email notifications)
- Convex HTTP API (external Lambda invocation pattern)

**Output**: `data-model.md`, `/contracts/*`, `quickstart.md`, agent context file updated.

## Phase 2: Task Breakdown

*Generated by `/speckit.tasks` command (not part of `/speckit.plan`).*

Expected task groups:
1. **CDK Stack Creation** — EventBridge rules, Lambda function, IAM roles, alarms, SNS
2. **Lambda Implementation** — Node.js dispatcher with module routing
3. **Module Logic Migration** — Port 8 Convex cron jobs to Lambda modules
4. **Integration Testing** — EventBridge trigger → Lambda → Convex round-trip
5. **Verification & Cleanup** — 48-hour monitoring, bandwidth measurement, Convex cron deletion

## Phase 3: Implementation

*Executed by `/speckit.implement` command (not part of `/speckit.plan`).*

Implementation sequence:
1. Create CDK stack skeleton
2. Implement Convex HTTP API client wrapper
3. Implement Lambda module dispatcher
4. Port each cron job logic to Lambda module (8 jobs)
5. Add 2 re-enabled jobs (ai-daily-digest, einvoice-dspy-digest)
6. Add 3 new jobs (chat-agent-optimization, weekly-email-digest, scheduled-reports)
7. Configure CloudWatch alarms + SNS
8. Deploy to AWS
9. Run 48-hour verification
10. Delete Convex cron code

## Notes

- **48-hour verification window**: Manual step, not automated
- **Bandwidth measurement**: Use Convex dashboard, not programmatic
- **Python DSPy optimizer**: Zero changes required, already exists
- **Convex deployment key**: Already in SSM `/finanseal/convex-deployment-key` (to be confirmed in research)
- **SES email sending**: Already configured in `system-email-stack.ts`, no changes needed
