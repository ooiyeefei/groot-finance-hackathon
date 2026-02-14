# Tasks: Stripe Key Migration to AWS SSM

**Input**: Design documents from `/specs/014-stripe-catalog-sync/`
**Prerequisites**: plan.md (required), spec.md (required)

**Context**: The Stripe catalog sync feature is already implemented (T001-T021 complete). This task list migrates the secret key from Convex plaintext to AWS SSM Parameter Store and moves Stripe-touching operations from Convex actions to Next.js API routes.

## Format: `[ID] [P?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Exact file paths included in descriptions

---

## Phase 1: Setup (Shared SSM Utility)

**Purpose**: Extract SSM client into shared utility, refactor existing CloudFront usage

- [x] T001 Create shared SSM utility with createSSMClient, getSSMParameter, putSSMParameter, deleteSSMParameter in src/lib/aws-ssm.ts
- [x] T002 Refactor cloudfront-signer.ts to import createSSMClient from src/lib/aws-ssm.ts instead of inline SSM client

**Checkpoint**: Shared SSM utility ready. CloudFront signer still works via shared utility.

---

## Phase 2: Foundational (Convex Schema & Function Migration)

**Purpose**: Remove stripeSecretKey from Convex, convert internal functions to public with auth, add updateConnection mutation

**CRITICAL**: Must complete before API routes can work

- [x] T003 Remove stripeSecretKey field from stripe_integrations table in convex/schema.ts
- [x] T004 Rewrite convex/functions/stripeIntegrations.ts — remove connect action, getIntegrationInternal, upsertIntegration; keep getConnection, disconnect; add updateConnection mutation for API route to write metadata
- [x] T005 Rewrite convex/functions/catalogItems.ts — remove syncFromStripe action and all internal helpers (verifyFinanceAdminRole, hasRunningSync, getStripeSyncedItems, createSyncLog, updateSyncLog, upsertSyncedItem, deactivateSyncedItem, updateIntegrationLastSync); convert to public query/mutation with auth checks; keep getSyncProgress, restoreFromStripe, list, deactivate

**Checkpoint**: Convex schema clean (no secret key), all DB operations are public with auth checks.

---

## Phase 3: API Routes — Connect & Disconnect

**Purpose**: Move Stripe connect/disconnect from Convex actions to Next.js API routes with SSM key storage

- [x] T006 [P] Create POST /api/v1/stripe-integration/connect route — Clerk auth, validate key with Stripe API, store in SSM, update Convex metadata via authenticated ConvexHttpClient in src/app/api/v1/stripe-integration/connect/route.ts
- [x] T007 [P] Create POST /api/v1/stripe-integration/disconnect route — Clerk auth, delete SSM param, update Convex status via authenticated ConvexHttpClient in src/app/api/v1/stripe-integration/disconnect/route.ts

**Checkpoint**: Connect and disconnect work via API routes. Secret key stored in SSM, never touches Convex.

---

## Phase 4: API Route — Sync

**Purpose**: Move Stripe catalog sync from Convex action to Next.js API route, reading key from SSM

- [x] T008 Create POST /api/v1/stripe-integration/sync route — Clerk auth, check concurrent sync via Convex query, fetch key from SSM, call Stripe API, upsert catalog items via Convex mutations, track progress in sync_logs, deactivate orphans in src/app/api/v1/stripe-integration/sync/route.ts

**Checkpoint**: Full sync works via API route. Key read from SSM, progress written to Convex for real-time UI.

---

## Phase 5: Frontend Hook Migration

**Purpose**: Switch frontend hooks from Convex useAction/useMutation to fetch() API calls

- [x] T009 Update use-stripe-integration.ts — change useStripeConnect from useAction to fetch('/api/v1/stripe-integration/connect'), change useStripeDisconnect from useMutation to fetch('/api/v1/stripe-integration/disconnect') in src/domains/sales-invoices/hooks/use-stripe-integration.ts
- [x] T010 [P] Update stripe-integration-card.tsx — adapt to new hook signatures (fetch-based connect/disconnect) in src/domains/account-management/components/stripe-integration-card.tsx
- [x] T011 [P] Update stripe-sync-button.tsx — change from useAction(syncFromStripe) to fetch('/api/v1/stripe-integration/sync'), keep useQuery(getSyncProgress) for real-time progress in src/domains/sales-invoices/components/stripe-sync-button.tsx

**Checkpoint**: All UI operations route through API routes. Convex only used for real-time status/progress.

---

## Phase 6: Deploy & Build Validation

**Purpose**: Push Convex changes, validate full build

- [x] T012 Run npx convex dev --once to deploy schema and function changes
- [x] T013 Run npm run build to verify TypeScript and Next.js compilation
- [x] T014 Update convex/_generated/api.d.ts if npx convex dev doesn't regenerate correctly (not needed — auto-generated correctly)

**Checkpoint**: Build passes. All Convex functions synced.

---

## Phase 7: Polish & Cross-Cutting

**Purpose**: IAM policy, cleanup, documentation

- [x] T015 [P] Document IAM policy update for FinanSEAL-Vercel-S3-Role — ssm:GetParameter, ssm:PutParameter, ssm:DeleteParameter on arn:aws:ssm:us-west-2:837224017779:parameter/finanseal/stripe/*
- [x] T016 [P] Update UAT test cases in specs/014-stripe-catalog-sync/uat-test-cases.md to reflect API route architecture (key stored in SSM not Convex)
- [x] T017 Verify no unused imports, dead code, or stale references across all modified files

**Checkpoint**: Clean codebase, documented IAM requirements, updated test cases.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Can start after Phase 1
- **Phase 3 (Connect/Disconnect API)**: Depends on Phase 1 + Phase 2
- **Phase 4 (Sync API)**: Depends on Phase 1 + Phase 2
- **Phase 5 (Frontend)**: Depends on Phase 3 + Phase 4
- **Phase 6 (Deploy)**: Depends on Phase 2 + Phase 5
- **Phase 7 (Polish)**: Depends on Phase 6

### Parallel Opportunities

- T006 and T007 (connect + disconnect API routes) can run in parallel
- T010 and T011 (integration card + sync button UI) can run in parallel
- T015 and T016 (IAM docs + UAT update) can run in parallel

---

## Summary

- **Total tasks**: 17
- **Phase 1 (Setup)**: 2 tasks
- **Phase 2 (Foundational)**: 3 tasks
- **Phase 3 (Connect/Disconnect)**: 2 tasks
- **Phase 4 (Sync)**: 1 task
- **Phase 5 (Frontend)**: 3 tasks
- **Phase 6 (Deploy)**: 3 tasks
- **Phase 7 (Polish)**: 3 tasks
