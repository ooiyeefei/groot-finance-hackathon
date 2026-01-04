# Tasks: Convex Database Migration

**Input**: Design documents from `/specs/002-convex-migration/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Not explicitly requested - focusing on implementation with manual verification checkpoints.

**Organization**: Tasks are grouped by migration domain to enable incremental, verifiable progress.

---

## 📊 Migration Progress Summary (Updated: 2025-12-31)

| Phase | Domain | Status | Progress |
|-------|--------|--------|----------|
| 1 | Setup | ✅ Mostly Complete | 4/6 tasks |
| 2 | Foundational | ✅ Mostly Complete | 8/9 tasks |
| 3 | Core Domain | 🟡 Functions Only | 3/13 tasks (functions done, no data) |
| 4 | Accounting | 🟡 Partial | 2/12 tasks + **data-access.ts migrated!** |
| 5 | Document | 🟡 Partial | 1/12 tasks + invoices data-access partial |
| 6 | Chat | 🟡 Functions Only | 3/9 tasks |
| 7 | Supporting | 🟡 Functions Only | 2/13 tasks |
| 8 | Query Revamp | ❌ Not Started | 0/14 tasks |
| 9 | Verification | ❌ Not Started | 0/11 tasks |

### ✅ Migrated Data-Access Layers
- `src/domains/accounting-entries/lib/data-access.ts` - **FULLY on Convex**
- `src/domains/invoices/lib/data-access.ts` - **DB on Convex, Storage still on Supabase**

### ❌ Still Using Supabase
- `src/domains/account-management/lib/account-management.service.ts`
- `src/domains/account-management/lib/invitation.service.ts`
- `src/domains/expense-claims/types/enhanced-expense-claims.ts`
- `src/domains/system/lib/health.service.ts`

### 🎯 Next Priority
1. **Data Import**: Export from Supabase → Import to Convex (Core + Accounting domains)
2. **Migrate account-management domain** to Convex (heavily used)
3. **Complete expense-claims migration** (only types file remains)

---

## Format: `[ID] [P?] [Domain] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Domain]**: Which migration domain this task belongs to (CORE, ACCT, DOC, CHAT, SUPPORT, QUERY)
- Include exact file paths in descriptions

## Path Conventions

- **Convex functions**: `convex/` (new directory)
- **Frontend**: `src/app/`, `src/domains/`
- **Library**: `src/lib/`
- **Migrations**: `convex/migrations/`

---

## Phase 1: Setup (Convex Project Initialization)

**Purpose**: Initialize Convex project and configure Next.js integration

- [x] T001 Install Convex dependencies: `npm install convex @convex-dev/auth` ✅ (convex@1.31.2)
- [x] T002 Initialize Convex project: `npx convex init` (creates `convex/` directory) ✅
- [x] T003 Link to Convex Dashboard: `npx convex dev` and create "finanseal-production" project ✅
- [x] T004 [P] Add environment variables to `.env.local`: `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOYMENT` ✅
- [ ] T005 [P] Install AWS S3 dependencies: `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`
- [ ] T006 Add S3 environment variables to `.env.local`: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`

---

## Phase 2: Foundational (Schema & Auth Configuration)

**Purpose**: Core infrastructure that MUST be complete before ANY domain migration

**CRITICAL**: No domain migration can begin until this phase is complete

- [x] T007 Create Convex schema in `convex/schema.ts` with all 12 tables from data-model.md ✅ (11 tables - line_items embedded)
- [x] T008 Deploy schema to Convex: `npx convex dev` (verify tables in dashboard) ✅ (_generated/ exists)
- [x] T009 [P] Create type exports in `convex/types.ts` (Doc, Id types) ✅
- [x] T010 Configure Clerk auth provider in Convex Dashboard (Settings → Authentication) ✅ (auth.config.ts exists)
- [x] T011 Create ConvexProvider wrapper in `src/components/providers/ConvexClientProvider.tsx` using `ConvexProviderWithClerk` ✅
- [x] T012 [P] Create Convex client utility in `src/lib/convex.ts` ✅ (getAuthenticatedConvex)
- [ ] T013 [P] Create S3 client utility in `src/lib/s3-client.ts` with `uploadFile`, `getSignedDownloadUrl`
- [x] T014 Create flexible ID resolver helper in `convex/lib/resolvers.ts` (supports legacyId lookup) ✅
- [x] T015 Verify `npm run build` passes with new providers ✅

**Checkpoint**: Foundation ready - domain migrations can now begin ✅

---

## Phase 3: Core Domain Migration (Priority: P0) - MVP

**Goal**: Migrate users, businesses, and business_memberships - the foundation of multi-tenancy

**Independent Test**: User can sign in, see their business context, and membership role displays correctly

### Data Export (Supabase → JSONL)

- [ ] T016 [CORE] Export users table from Supabase to `/tmp/users.jsonl`
- [ ] T017 [P] [CORE] Export businesses table from Supabase to `/tmp/businesses.jsonl`
- [ ] T018 [P] [CORE] Export business_memberships table from Supabase to `/tmp/business_memberships.jsonl`

### Convex Functions

- [x] T019 [P] [CORE] Create user queries/mutations in `convex/functions/users.ts` (getByClerkId, create, update) ✅
- [x] T020 [P] [CORE] Create business queries/mutations in `convex/functions/businesses.ts` (get, list, create, update) ✅
- [x] T021 [P] [CORE] Create membership queries/mutations in `convex/functions/memberships.ts` (getByUser, getByBusiness, create) ✅

### Data Transform & Import

- [ ] T022 [CORE] Create transform script `scripts/transform-core-domain.ts` (camelCase, legacyId field)
- [ ] T023 [CORE] Import businesses to Convex: `npx convex import --format jsonLines --table businesses`
- [ ] T024 [CORE] Import users to Convex: `npx convex import --format jsonLines --table users`
- [ ] T025 [CORE] Import business_memberships to Convex: `npx convex import --format jsonLines --table business_memberships`

### ID Reference Updates

- [ ] T026 [CORE] Create ID migration mutation in `convex/migrations/updateCoreIdReferences.ts`
- [ ] T027 [CORE] Run ID migration to update businessId references in users table
- [ ] T028 [CORE] Verify row counts match Supabase (users: 3, businesses: 1, memberships: 0)

**Checkpoint**: Core domain migrated - users can authenticate and see business context

---

## Phase 4: Accounting Domain Migration (Priority: P0)

**Goal**: Migrate accounting_entries (with embedded line_items) and expense_claims - the heart of financial tracking

**Independent Test**: Expense claims list displays, transaction entries show with embedded line items

**Schema Note**: `line_items` are EMBEDDED in `accounting_entries.lineItems[]` - NOT a separate table.
This is a Convex optimization: always accessed together, avg 8 items/entry, atomic reads.

**Snapshot Pattern**: Line items exist in source documents (expense_claims.processingMetadata.lineItems, invoices.extractedData.lineItems) during extraction, then are COPIED to accounting_entries.lineItems on posting. accounting_entries track their source via `sourceDocumentId` + `sourceDocumentType` fields. Bidirectional links: expense_claims/invoices have `accountingEntryId`.

### Data Export (Supabase → JSONL)

- [ ] T029 [P] [ACCT] Export accounting_entries table from Supabase to `/tmp/accounting_entries.jsonl`
- [ ] T030 [P] [ACCT] Export line_items table from Supabase to `/tmp/line_items.jsonl` (for embedding)
- [ ] T031 [P] [ACCT] Export expense_claims table from Supabase to `/tmp/expense_claims.jsonl`

### Convex Functions

- [x] T032 [P] [ACCT] Create accounting entry queries/mutations in `convex/functions/accountingEntries.ts` (includes lineItems array) ✅
- [x] T033 [P] [ACCT] Create expense claim queries/mutations in `convex/functions/expenseClaims.ts` ✅
- [ ] T034 [ACCT] Create expense approval mutation in `convex/functions/expenseClaims.ts` (replaces RPC)

### Data Transform & Import

- [ ] T035 [ACCT] Create transform script `scripts/transform-accounting-domain.ts` (EMBEDS line_items into entries)
- [ ] T036 [ACCT] Import accounting_entries (with embedded lineItems) to Convex
- [ ] T037 [ACCT] Import expense_claims to Convex

### ID Reference Updates

- [ ] T038 [ACCT] Create ID migration mutation in `convex/migrations/updateAccountingIdReferences.ts`
- [ ] T039 [ACCT] Run ID migration to update accountingEntryId references
- [ ] T040 [ACCT] Verify row counts (entries: 3 with 24 embedded line items, expense_claims: 24)

**Checkpoint**: Accounting domain migrated - financial data accessible via Convex

---

## Phase 5: Document Domain Migration (Priority: P0)

**Goal**: Migrate invoices table and file storage to AWS S3

**Independent Test**: Invoice list displays, file download works via S3 signed URLs

### Data Export (Supabase → JSONL)

- [ ] T041 [DOC] Export invoices table from Supabase to `/tmp/invoices.jsonl`

### File Storage Migration

- [ ] T042 [DOC] Create S3 bucket `finanseal-documents` in ap-southeast-1 region
- [ ] T043 [DOC] Enable versioning on S3 bucket for audit trails
- [ ] T044 [DOC] Create file migration script `scripts/migrate-storage-to-s3.ts`
- [ ] T045 [DOC] Migrate `invoices` bucket files to S3 preserving path structure
- [ ] T046 [P] [DOC] Migrate `expense_claims` bucket files to S3
- [ ] T047 [P] [DOC] Migrate `business-logos` bucket files to S3

### Convex Functions

- [x] T048 [DOC] Create invoice queries/mutations in `convex/functions/invoices.ts` ✅
- [ ] T049 [DOC] Create storage action in `convex/functions/storage.ts` (getSignedUrl via S3)

### Data Transform & Import

- [ ] T050 [DOC] Create transform script `scripts/transform-document-domain.ts` (update storagePath fields)
- [ ] T051 [DOC] Import invoices to Convex
- [ ] T052 [DOC] Verify invoices count (invoices: 2) and file URLs work

**Checkpoint**: Document domain migrated - files accessible via S3

---

## Phase 6: Chat Domain Migration (Priority: P1) - Real-time

**Goal**: Migrate conversations and messages with Convex native real-time

**Independent Test**: Chat UI shows messages, new messages appear in real-time without refresh

**Schema Note**: Conversations have denormalized fields (`lastMessageContent`, `lastMessageRole`, `messageCount`)
for efficient list rendering. These get updated when messages are sent.

### Data Export (Supabase → JSONL)

- [ ] T053 [P] [CHAT] Export conversations table from Supabase to `/tmp/conversations.jsonl`
- [ ] T054 [P] [CHAT] Export messages table from Supabase to `/tmp/messages.jsonl`

### Convex Functions (Real-time queries)

- [x] T055 [CHAT] Create conversation queries in `convex/functions/conversations.ts` (list, get with real-time) ✅
- [x] T056 [CHAT] Create message queries in `convex/functions/messages.ts` (getByConversation - real-time) ✅
- [x] T057 [CHAT] Create message mutation in `convex/functions/messages.ts` (send + update conversation denormalized fields) ✅

### Data Transform & Import

- [ ] T058 [CHAT] Create transform script `scripts/transform-chat-domain.ts` (includes denormalized fields)
- [ ] T059 [CHAT] Import conversations to Convex (with lastMessageContent, messageCount)
- [ ] T060 [CHAT] Import messages to Convex
- [ ] T061 [CHAT] Verify row counts (conversations: 1, messages: 2)

**Checkpoint**: Chat domain migrated with real-time subscriptions

---

## Phase 7: Supporting Domain Migration (Priority: P1)

**Goal**: Migrate vendors, stripe_events, ocr_usage and set up webhooks

**Independent Test**: Stripe webhooks process correctly, OCR usage tracking works

### Data Export (Supabase → JSONL)

- [ ] T062 [P] [SUPPORT] Export vendors table from Supabase to `/tmp/vendors.jsonl`
- [ ] T063 [P] [SUPPORT] Export stripe_events table from Supabase to `/tmp/stripe_events.jsonl`
- [ ] T064 [P] [SUPPORT] Export ocr_usage table from Supabase to `/tmp/ocr_usage.jsonl`

### Convex Functions

- [x] T065 [P] [SUPPORT] Create vendor queries/mutations in `convex/functions/vendors.ts` ✅
- [x] T066 [P] [SUPPORT] Create billing queries/mutations in `convex/functions/stripeEvents.ts` + `ocrUsage.ts` ✅

### Webhook HTTP Actions

- [ ] T067 [SUPPORT] Create HTTP router in `convex/http.ts`
- [ ] T068 [SUPPORT] Implement Stripe webhook handler at `/stripe-webhook` in `convex/http.ts`
- [ ] T069 [SUPPORT] Implement Trigger.dev callback at `/trigger-callback` in `convex/http.ts`
- [ ] T070 [SUPPORT] Implement Clerk webhook handler at `/clerk-webhook` in `convex/http.ts`

### Data Transform & Import

- [ ] T071 [SUPPORT] Create transform script `scripts/transform-supporting-domain.ts`
- [ ] T072 [SUPPORT] Import vendors to Convex (count: 0)
- [ ] T073 [SUPPORT] Import stripe_events to Convex (count: 0)
- [ ] T074 [SUPPORT] Import ocr_usage to Convex (count: 0)

**Checkpoint**: Supporting domain migrated with webhook handlers active

---

## Phase 8: Frontend Query Revamp (Priority: P0)

**Goal**: Replace all Supabase client calls with Convex hooks

**Independent Test**: All pages load data from Convex, no Supabase client usage remains

### Domain Service Updates

- [ ] T075 [QUERY] Update `src/domains/users/` services to use Convex `useQuery`/`useMutation`
- [ ] T076 [P] [QUERY] Update `src/domains/account-management/` services for Convex
- [ ] T077 [P] [QUERY] Update `src/domains/expense-claims/` services for Convex
- [ ] T078 [P] [QUERY] Update `src/domains/invoices/` services for Convex
- [ ] T079 [P] [QUERY] Update `src/domains/analytics/` services for Convex
- [ ] T080 [P] [QUERY] Update `src/domains/chat/` services for Convex (real-time useQuery)

### API Route Migration

- [ ] T081 [QUERY] Migrate `/api/v1/users/` routes to call Convex functions
- [ ] T082 [P] [QUERY] Migrate `/api/v1/expense-claims/` routes to call Convex functions
- [ ] T083 [P] [QUERY] Migrate `/api/v1/transactions/` routes to call Convex functions
- [ ] T084 [P] [QUERY] Migrate `/api/v1/documents/` routes to call Convex functions
- [ ] T085 [P] [QUERY] Migrate `/api/v1/businesses/` routes to call Convex functions

### Integration Updates

- [ ] T086 [QUERY] Update Trigger.dev tasks to call Convex via HTTP actions
- [ ] T087 [QUERY] Update Stripe webhook endpoint to use Convex HTTP action URL
- [ ] T088 [QUERY] Verify `npm run build` passes with all Convex integrations

**Checkpoint**: All queries use Convex - Supabase client no longer called

---

## Phase 9: Verification & Cleanup (Priority: P1)

**Goal**: Verify data integrity and remove Supabase dependencies

### Data Verification

- [ ] T089 Create verification query in `convex/admin/verify.ts` (count all tables)
- [ ] T090 Run verification: all 11 tables match expected counts (line_items embedded, not separate)
- [ ] T091 Test key business flows: expense submission, approval, document processing

### Supabase Removal

- [ ] T092 [P] Search and remove all `@supabase/supabase-js` imports
- [ ] T093 [P] Remove Supabase client configuration from `src/lib/`
- [ ] T094 Remove Supabase environment variables from `.env.local`
- [ ] T095 Uninstall Supabase packages: `npm uninstall @supabase/supabase-js @supabase/ssr`
- [ ] T096 Final build verification: `npm run build` passes

### Documentation

- [ ] T097 [P] Update CLAUDE.md with Convex architecture
- [ ] T098 [P] Archive Supabase migration scripts to `scripts/archive/`
- [ ] T099 Verify all success criteria from spec.md are met

**Checkpoint**: Migration complete - Supabase fully removed

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all domain migrations
- **Core Domain (Phase 3)**: Depends on Foundational - MVP milestone
- **Accounting Domain (Phase 4)**: Depends on Core Domain (needs businessId, userId references)
- **Document Domain (Phase 5)**: Depends on Core Domain (needs businessId, userId references)
- **Chat Domain (Phase 6)**: Depends on Core Domain (needs userId references)
- **Supporting Domain (Phase 7)**: Depends on Core Domain (needs businessId references)
- **Query Revamp (Phase 8)**: Depends on ALL domain migrations complete
- **Verification (Phase 9)**: Depends on Query Revamp complete

### Domain Dependencies

```
Phase 1: Setup
    ↓
Phase 2: Foundational (BLOCKING)
    ↓
Phase 3: Core Domain (users, businesses) ← MVP
    ↓
    ├──→ Phase 4: Accounting Domain
    ├──→ Phase 5: Document Domain
    ├──→ Phase 6: Chat Domain
    └──→ Phase 7: Supporting Domain
              ↓ (all complete)
         Phase 8: Query Revamp
              ↓
         Phase 9: Verification
```

### Within Each Domain Phase

- Export tasks can run in parallel [P]
- Convex functions can run in parallel [P] (different files)
- Transform script → Import → ID migration (sequential)
- Verification after imports complete

### Parallel Opportunities

- T016, T017, T018: All core domain exports
- T019, T020, T021: All core domain Convex functions
- T029, T030, T031: All accounting domain exports
- T047, T048, T049: All S3 file migrations
- T077-T082: All domain service updates
- T083-T087: All API route migrations

---

## Parallel Example: Core Domain (Phase 3)

```bash
# Launch all exports together:
Task T016: Export users table
Task T017: Export businesses table
Task T018: Export business_memberships table

# Launch all Convex functions together:
Task T019: Create users.ts
Task T020: Create businesses.ts
Task T021: Create memberships.ts

# Sequential (dependencies):
Task T022: Transform script (needs exports)
Task T023-T025: Imports (in order: businesses → users → memberships)
Task T026-T027: ID migrations (needs imports)
Task T028: Verification (needs migrations)
```

---

## Implementation Strategy

### MVP First (Phases 1-3)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (schema, auth, providers)
3. Complete Phase 3: Core Domain (users, businesses)
4. **STOP and VALIDATE**: Users can sign in and see business context
5. This is a deployable MVP with core data in Convex

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add Core Domain → Users authenticate via Convex (MVP!)
3. Add Accounting Domain → Expense claims work via Convex
4. Add Document Domain → File storage works via S3
5. Add Chat Domain → Real-time chat works
6. Add Supporting Domain → Webhooks work
7. Query Revamp → All UI uses Convex
8. Verification → Supabase removed

### Data Safety

- **Always export before import**: Keep Supabase exports as backup
- **Verify counts after each domain**: Match expected row counts
- **Test key flows after each domain**: Don't proceed if broken
- **Keep Supabase running**: Until Phase 9 verification complete

---

## Summary

| Phase | Domain | Tasks | Parallelizable |
|-------|--------|-------|----------------|
| 1 | Setup | 6 | 2 |
| 2 | Foundational | 9 | 4 |
| 3 | Core | 13 | 6 |
| 4 | Accounting | 12 | 5 |
| 5 | Document | 12 | 3 |
| 6 | Chat | 9 | 4 |
| 7 | Supporting | 13 | 6 |
| 8 | Query | 14 | 10 |
| 9 | Verification | 11 | 4 |
| **Total** | | **99** | **44** |

**MVP Scope**: Phases 1-3 (28 tasks) - Users can authenticate and access business context via Convex

**Schema Optimizations Applied**:
- `line_items` embedded in `accounting_entries.lineItems[]` (Convex document optimization)
- `conversations` denormalized with `lastMessageContent`, `messageCount` (efficient list queries)
- 11 Convex tables (not 12) - line_items merged into accounting_entries
- **Snapshot Pattern**: `sourceDocumentId` + `sourceDocumentType` on accounting_entries for audit trail
- **Bidirectional links**: `accountingEntryId` on expense_claims and invoices
