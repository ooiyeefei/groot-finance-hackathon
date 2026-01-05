# Implementation Plan: Lambda Durable Functions Migration

**Branch**: `004-lambda-durable-migration` | **Date**: 2026-01-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-lambda-durable-migration/spec.md`

## Summary

Migrate FinanSeal's document processing pipeline from Trigger.dev v3 to AWS Lambda Durable Functions (released Dec 2025). The migration consolidates 4 scattered tasks (classify-document, convert-pdf-to-image, extract-invoice-data, extract-receipt-data) into a single unified workflow with automatic checkpointing, replay, and wait/resume capabilities. Technical approach uses CDK TypeScript for infrastructure, Lambda Layers for Python dependencies (pdf2image/poppler-utils), and existing Vercel OIDC for secure invocation.

## Technical Context

**Language/Version**: TypeScript 5.9+ (CDK & Lambda handler), Python 3.11 (Lambda Layer for pdf2image)
**Primary Dependencies**: AWS CDK 2.x, @aws/durable-execution-sdk-js, @sentry/aws-serverless, @aws-sdk/client-lambda
**Storage**: AWS S3 (existing finanseal-bucket), Convex (existing - unchanged)
**Testing**: Vitest for unit tests, AWS SAM Local for Lambda integration testing
**Target Platform**: AWS Lambda (Node.js 22.x runtime), invoked from Vercel serverless
**Project Type**: Infrastructure (CDK) + Lambda handler code
**Performance Goals**: 60s for single-page processing (vs 90s current), <3s cold start, 100 concurrent workflows
**Constraints**: 1024 MB memory, no public Lambda endpoints, OIDC-only invocation
**Scale/Scope**: ~6,600 documents/month within free tier

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Domain-Driven Architecture | Feature code in `src/domains/`? API in `/api/v1/{domain}/`? | ✓ API routes remain in `/api/v1/documents/` and `/api/v1/expense-claims/` |
| II. Semantic Design System | UI uses semantic tokens only? No hardcoded colors? | N/A - No UI changes |
| III. Build Validation | `npm run build` passes? | ☐ Pending implementation |
| IV. Simplicity First | Minimal changes? No over-engineering? | ✓ Single unified workflow vs 4 separate tasks |
| V. Background Jobs | Long tasks use Trigger.dev? Fire-and-forget pattern? | ⚠️ VIOLATION - See Complexity Tracking |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle V: Using Lambda Durable Functions instead of Trigger.dev | GitHub Issue #85 explicitly requests migration for performance improvement; Lambda Durable Functions provides native AWS checkpointing, better integration with existing OIDC, and 30% cost reduction target | Trigger.dev has slower task orchestration (~90s vs target 60s), separate billing, and lacks native AWS integration for checkpoint/replay |

**Note**: This migration constitutes a constitutional amendment proposal for Principle V. After successful deployment, the constitution should be updated to allow Lambda Durable Functions as an alternative to Trigger.dev for background jobs.

## Project Structure

### Documentation (this feature)

```text
specs/004-lambda-durable-migration/
├── plan.md              # This file
├── research.md          # Phase 0 output - Lambda Durable Functions patterns
├── data-model.md        # Phase 1 output - Workflow state and entities
├── quickstart.md        # Phase 1 output - Local development setup
├── contracts/           # Phase 1 output - Lambda invocation schemas
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
# CDK Infrastructure (NEW)
infra/
├── bin/
│   └── finanseal-lambda.ts          # CDK app entry point
├── lib/
│   ├── document-processing-stack.ts # Main stack with Lambda + IAM
│   └── lambda-layer-stack.ts        # Python dependencies layer
├── cdk.json
├── package.json
└── tsconfig.json

# Lambda Handler Code (NEW)
src/lambda/
├── document-processor/
│   ├── index.ts                     # Durable function handler
│   ├── steps/
│   │   ├── classify.ts              # Step 1: Document classification
│   │   ├── convert-pdf.ts           # Step 2: PDF to image conversion
│   │   ├── extract-invoice.ts       # Step 3a: Invoice extraction
│   │   └── extract-receipt.ts       # Step 3b: Receipt extraction
│   ├── utils/
│   │   ├── s3-client.ts             # S3 operations (presigned URLs)
│   │   ├── convex-client.ts         # Convex status updates
│   │   └── gemini-client.ts         # AI extraction calls
│   └── types.ts                     # Shared types
└── layers/
    └── python-pdf/
        ├── requirements.txt         # pdf2image, Pillow
        └── python/                  # Layer structure

# Existing Code (MODIFIED)
src/app/api/v1/documents/[id]/process/
└── route.ts                         # Update to invoke Lambda instead of Trigger.dev

src/app/api/v1/expense-claims/[id]/process/
└── route.ts                         # Update to invoke Lambda instead of Trigger.dev

src/lib/
└── lambda-invoker.ts                # NEW: Lambda SDK invocation with OIDC

# Removed After Migration (CLEANUP)
src/trigger/                         # DELETE: All Trigger.dev tasks
├── classify-document.ts
├── convert-pdf-to-image.ts
├── extract-invoice-data.ts
└── extract-receipt-data.ts
trigger.config.ts                    # DELETE: Trigger.dev config
requirements.txt                     # MOVE: To Lambda layer
```

**Structure Decision**: Separate CDK infrastructure in `infra/` directory following AWS best practices. Lambda handler code in `src/lambda/` to co-locate with existing Next.js source while maintaining clear separation. Existing API routes modified minimally to call Lambda instead of Trigger.dev.

## Phase 0: Research Findings

See [research.md](./research.md) for detailed findings on:
- Lambda Durable Functions SDK patterns
- Lambda Layer creation for Python dependencies
- Vercel OIDC → Lambda invocation flow
- Sentry integration for AWS Lambda

## Phase 1: Design Artifacts

- [data-model.md](./data-model.md) - Workflow state, processing steps, error handling
- [contracts/](./contracts/) - Lambda invocation payload schemas
- [quickstart.md](./quickstart.md) - Local development and deployment guide

## Implementation Phases

### Phase 1: Infrastructure Setup
1. Create CDK project in `infra/` directory
2. Define Lambda function with durable execution enabled
3. Create Python Lambda Layer with poppler-utils, pdf2image
4. Configure IAM roles (Lambda execution + Vercel invocation)
5. Deploy to staging environment

### Phase 2: Lambda Handler Implementation
1. Port classification logic from `classify-document.ts`
2. Port PDF conversion from `convert-pdf-to-image.ts` (using Lambda Layer)
3. Port invoice extraction from `extract-invoice-data.ts`
4. Port receipt extraction from `extract-receipt-data.ts`
5. Implement `context.step()` checkpointing between stages
6. Add Sentry integration with @sentry/aws-serverless

### Phase 3: Integration
1. Create `src/lib/lambda-invoker.ts` for OIDC-authenticated invocation
2. Update API routes to invoke Lambda instead of Trigger.dev
3. Test end-to-end flow in staging

### Phase 4: Cutover & Cleanup
1. Deploy Lambda to production
2. Switch API routes to Lambda (big bang cutover)
3. Monitor for 24 hours (rollback period)
4. Remove Trigger.dev dependencies and code
5. Update constitution to reflect new background job pattern

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Lambda Layer size exceeds 250MB limit | Use Docker-based layer build to minimize size; poppler-utils ~50MB |
| Cold start exceeds 3s target | ARM64 architecture + 1024MB memory; SnapStart if available |
| OIDC token expiration during long workflows | Lambda Durable Functions handles token refresh automatically |
| Rollback needed after cutover | Keep Trigger.dev code on separate branch for 7 days post-deployment |
