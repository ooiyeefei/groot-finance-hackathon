# Implementation Plan: Critical Transactional Emails

**Branch**: `003-system-email` | **Date**: 2026-01-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-system-email/spec.md`

## Summary

Implement critical transactional email system for FinanSEAL with a hybrid architecture:
- **Stripe-delegated** (P1): Trial ending reminders (7-day) and payment failure/recovery emails via Stripe's native automation
- **Custom implementation** (P2): Welcome emails via AWS Lambda Durable Functions, with SES for delivery
- **Migration**: Consolidate existing Resend invitation emails to Amazon SES

Technical approach uses AWS Lambda Durable Functions (Dec 2025 release) for long-running workflow orchestration, API Gateway with IAM authentication for security, and Amazon SES for unified email delivery.

## Technical Context

**Language/Version**: TypeScript 5.9+ (Next.js 15.5), Node.js 22.x (Lambda Durable Functions)
**Primary Dependencies**:
- AWS Lambda Durable Functions SDK (`@aws-sdk/client-lambda`)
- AWS CDK v2 (infrastructure as code)
- Amazon SES SDK (`@aws-sdk/client-ses`)
- Clerk webhooks (user creation events)
- Stripe Dashboard (billing email configuration)

**Storage**:
- Convex (email preferences, email logs)
- Lambda Durable Functions state (workflow checkpoints - managed by AWS)
- SES SNS notifications (delivery tracking)

**Testing**:
- Vitest (unit tests)
- Playwright (E2E tests)
- AWS CDK assertions (infrastructure tests)

**Target Platform**: AWS Lambda (Node.js 22.x runtime), Next.js on Vercel

**Project Type**: Web application (Next.js frontend + AWS serverless backend)

**Performance Goals**:
- Welcome email delivery within 5 minutes of signup (FR-008)
- Email delivery success rate above 98% (SC-010)

**Constraints**:
- Lambda Durable Functions max execution: 1 year
- SES sending limits: Requires warmup plan for new domain
- Lambda invoked via AWS SDK from Next.js (Clerk uses Svix, not IAM SigV4)

**Scale/Scope**:
- Initial: ~100-500 emails/day (welcome + invitations)
- Future: ~1000-5000 emails/day (including drip sequences)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Note**: Project constitution is template placeholder. Using implicit gates based on codebase patterns:

| Gate | Status | Notes |
|------|--------|-------|
| No public Lambda endpoints | ✅ PASS | Lambda invoked via AWS SDK from Next.js (FR-022, FR-024) |
| Infrastructure as Code | ✅ PASS | CDK provisioning specified (FR-026) |
| Single email provider | ✅ PASS | Consolidating to SES, deprecating Resend (FR-027, FR-031) |
| Existing patterns followed | ✅ PASS | Uses Convex for storage (matches existing), TypeScript throughout |
| Security-first | ✅ PASS | Svix HMAC-SHA256 for webhooks, IAM for Lambda invocation |

## Project Structure

### Documentation (this feature)

```text
specs/003-system-email/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── webhooks.yaml    # Clerk webhook contract
│   └── email-api.yaml   # Internal email service API
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
# AWS CDK Infrastructure (NEW)
infra/
├── bin/
│   └── system-email.ts          # CDK app entry point
├── lib/
│   ├── system-email-stack.ts    # Main stack (Lambda, SES, SNS)
│   └── constructs/
│       ├── durable-workflow.ts  # Lambda Durable Function construct
│       ├── ses-domain.ts        # SES domain verification construct
│       └── delivery-handler.ts  # SNS → Lambda for delivery events
├── cdk.json
├── package.json
└── tsconfig.json

# Lambda Durable Functions (NEW)
lambda/
├── welcome-workflow/
│   ├── index.ts                 # Durable function handler
│   ├── steps/
│   │   ├── send-welcome.ts      # Welcome email step
│   │   └── checkpoint.ts        # Checkpoint for future drips
│   └── package.json
└── shared/
    ├── email-service.ts         # SES wrapper (replaces Resend)
    └── templates/
        ├── welcome-new-user.html
        ├── welcome-team-member.html
        └── invitation.html       # Migrated from Resend

# Existing Next.js Application (MODIFY)
src/
├── lib/
│   ├── services/
│   │   └── email-service.ts     # UPDATE: Replace Resend with SES SDK
│   └── aws/
│       └── lambda-client.ts     # NEW: AWS SDK Lambda invocation
├── domains/
│   └── users/
│       └── lib/
│           └── email-preferences.service.ts  # NEW: Preference management
└── app/
    └── api/
        └── v1/
            ├── webhooks/
            │   └── clerk/
            │       └── route.ts     # NEW: Clerk webhook (Svix verification)
            └── email-preferences/
                └── route.ts     # NEW: Unsubscribe endpoint

# Convex (MODIFY)
convex/
├── schema.ts                    # UPDATE: Add emailPreferences, emailLogs tables
└── functions/
    └── emails.ts                # NEW: Email preference mutations/queries

# Tests
tests/
├── unit/
│   └── email-service.test.ts
├── integration/
│   └── welcome-workflow.test.ts
└── e2e/
    └── email-preferences.spec.ts
```

**Structure Decision**: Hybrid structure with new `infra/` directory for AWS CDK and `lambda/` for Lambda Durable Functions, while integrating with existing Next.js app in `src/`. This separation allows independent deployment of email infrastructure while maintaining integration with the existing Convex-based data layer.

## Complexity Tracking

> No constitution violations requiring justification.

| Decision | Rationale | Alternative Considered |
|----------|-----------|------------------------|
| Separate `infra/` directory | CDK projects have different build/deploy lifecycle than Next.js | Inline CDK in src/ - rejected due to conflicting tsconfig requirements |
| Lambda Durable Functions | Future-proof for multi-day drip sequences, built-in checkpointing | Trigger.dev - already in use but doesn't support year-long workflows |
| SES over Resend | Cost savings (~10x), native AWS integration, single provider | Keep Resend - rejected due to provider fragmentation |

## Phase 0: Research Topics ✅ COMPLETED

1. **AWS Lambda Durable Functions patterns** - ✅ `context.step()` for checkpointing, `context.wait()` for delays
2. **Clerk webhook security** - ✅ Uses Svix HMAC-SHA256 (NOT IAM SigV4) - architecture revised
3. **SES domain verification via CDK** - ✅ `ses.EmailIdentity` with `Identity.domain()` auto-handles DKIM
4. **SES SNS delivery notifications** - ✅ `ConfigurationSet.addEventDestination()` with SNS topic
5. **Convex email preference schema** - ✅ Follow existing `audit_events` and `stripe_events` patterns

See [research.md](./research.md) for detailed findings.

## Phase 1: Design Outputs ✅ COMPLETED

- [x] `research.md` - Resolved unknowns, identified architecture revision
- [x] `data-model.md` - Convex schema for email preferences, logs, workflow state
- [x] `contracts/webhooks.yaml` - Clerk webhook payload contract (Svix-based)
- [x] `contracts/email-api.yaml` - Internal email service API
- [x] `quickstart.md` - Developer setup guide for local development

## Phase 2: Task Breakdown ✅ COMPLETED

*Generated by `/speckit.tasks` command*

See [tasks.md](./tasks.md) for complete task breakdown:

| Metric | Value |
|--------|-------|
| Total Tasks | 83 |
| Phase 1 (Setup) | 6 tasks |
| Phase 2 (Foundational) | 24 tasks |
| Phase 3 (US1 & US2 - Stripe) | 6 tasks |
| Phase 4 (US3 - Welcome Email) | 19 tasks |
| Phase 5 (US4 - Preferences) | 14 tasks |
| Phase 6 (Migration) | 8 tasks |
| Phase 7 (Polish) | 6 tasks |

**MVP Scope**: Phase 1 + Phase 2 + Phase 3 + Phase 4 (55 tasks)

**Parallel Opportunities**:
- Setup tasks can run in parallel
- Foundational tasks can run in parallel by category (schema, CDK, Convex functions)
- US3 and US4 can run in parallel after Foundational
- US1/US2 (Stripe config) can run parallel to code phases
