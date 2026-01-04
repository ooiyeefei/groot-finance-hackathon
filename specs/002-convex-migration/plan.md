# Implementation Plan: Convex Database Migration

**Branch**: `002-convex-migration` | **Date**: 2025-12-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-convex-migration/spec.md`

## Summary

Migrate FinanSEAL from Supabase PostgreSQL to Convex database, including all 12 production tables, file storage (3 buckets), and real-time subscriptions. Uses batch import via JSONL for the small dataset (~60 rows), TypeScript-native Convex schema with relationship indexes, and Convex Files for storage migration.

## Technical Context

**Language/Version**: TypeScript 5.9+ with Next.js 15.4.6 App Router
**Primary Dependencies**: Convex (database), Clerk (auth), Stripe (billing), Trigger.dev v3 (background jobs)
**Storage**: Convex (native) - migrating from Supabase PostgreSQL + Storage
**Testing**: Vitest (unit), Playwright (e2e)
**Target Platform**: Vercel Edge + Convex Cloud
**Project Type**: Web application (monorepo-ready)
**Performance Goals**: < 200ms p95 API response, < 100ms real-time updates
**Constraints**: Zero data loss, build must pass throughout migration
**Scale/Scope**: 12 tables, ~60 rows, 3 storage buckets, ~20 API routes to migrate

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Domain-Driven Architecture | Feature code in `convex/functions/`? API in Convex functions? | ✅ |
| II. Semantic Design System | UI unchanged - backend migration only | ✅ N/A |
| III. Build Validation | `npm run build` passes? | ✅ Must verify |
| IV. Simplicity First | Minimal changes? No over-engineering? | ✅ Direct 1:1 migration |
| V. Background Jobs | Long tasks use Trigger.dev? Fire-and-forget pattern? | ✅ Keep Trigger.dev |

## Project Structure

### Documentation (this feature)

```text
specs/002-convex-migration/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output - migration decisions
├── data-model.md        # Phase 1 output - Convex schema mapping
├── quickstart.md        # Phase 1 output - setup instructions
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
# New Convex structure
convex/
├── _generated/          # Auto-generated types and API
├── schema.ts            # Type-safe schema definitions
├── types.ts             # Re-exported types
├── functions/
│   ├── users.ts         # User queries and mutations
│   ├── businesses.ts    # Business management
│   ├── expenses.ts      # Expense claims CRUD
│   ├── invoices.ts      # Invoice/document processing
│   ├── accounting.ts    # Accounting entries
│   ├── chat.ts          # Conversations and messages (real-time)
│   └── billing.ts       # Stripe and OCR usage
├── http.ts              # HTTP actions (webhooks)
└── migrations/          # Data migration scripts

# Modified existing structure
src/
├── app/
│   ├── providers.tsx    # Add ConvexProvider
│   └── api/v1/          # Gradual deprecation (routes → Convex functions)
├── lib/
│   └── convex.ts        # Convex client configuration
└── domains/
    └── */               # Update services to use Convex hooks
```

**Structure Decision**: Convex functions in `convex/` directory following Convex conventions. Existing domain structure in `src/domains/` maintained - only service implementations change to use Convex client instead of Supabase.

## Complexity Tracking

| Item | Justification |
|------|---------------|
| Legacy ID indexes | Required for gradual migration - prevents breaking changes |
| Dual storage during transition | Required for zero-downtime migration |

## Migration Phases

### Phase 1: Setup & Schema (Day 1)
- [ ] Install Convex dependencies
- [ ] Initialize Convex project
- [ ] Create `convex/schema.ts` with all 12 tables
- [ ] Configure Clerk integration in Convex dashboard
- [ ] Set up ConvexProvider in Next.js

### Phase 2: Core Domain Migration (Days 2-3)
- [ ] Create Convex functions for users
- [ ] Create Convex functions for businesses
- [ ] Create Convex functions for business_memberships
- [ ] Export/transform/import users data
- [ ] Export/transform/import businesses data
- [ ] Update ID references

### Phase 3: Accounting Domain Migration (Days 3-4)
- [ ] Create Convex functions for accounting_entries
- [ ] Create Convex functions for line_items
- [ ] Create Convex functions for expense_claims
- [ ] Export/transform/import accounting data
- [ ] Update expense claim approval RPC to Convex mutation

### Phase 4: Document Domain Migration (Day 4)
- [ ] Create Convex functions for invoices
- [ ] Migrate Supabase Storage → AWS S3 (preserves path patterns)
- [ ] Update Trigger.dev tasks to call Convex mutations

### Phase 5: Chat Domain Migration (Day 5)
- [ ] Create Convex functions for conversations (real-time)
- [ ] Create Convex functions for messages (real-time)
- [ ] Update chat UI to use useQuery (automatic real-time)

### Phase 6: Supporting Domain Migration (Day 5)
- [ ] Create Convex functions for vendors
- [ ] Create Convex functions for stripe_events
- [ ] Create Convex functions for ocr_usage
- [ ] Create HTTP actions for webhooks (Stripe, Clerk)

### Phase 7: Frontend Query Revamp (Days 6-7)
- [ ] Replace fetch calls with useQuery/useMutation hooks
- [ ] Update all domain services to use Convex client
- [ ] Remove Supabase client usage from components

### Phase 8: Verification & Cleanup (Day 8)
- [ ] Run count verification queries
- [ ] Test all business flows
- [ ] Remove Supabase dependencies from package.json
- [ ] Archive/delete Supabase project (after verification period)

## Artifacts Generated

| Artifact | Path | Status |
|----------|------|--------|
| Feature Spec | specs/002-convex-migration/spec.md | ✅ Complete |
| Research | specs/002-convex-migration/research.md | ✅ Complete |
| Data Model | specs/002-convex-migration/data-model.md | ✅ Complete |
| Quickstart | specs/002-convex-migration/quickstart.md | ✅ Complete |
| Tasks | specs/002-convex-migration/tasks.md | ✅ Complete |

## Key Decisions

1. **Migration Approach**: Batch import via JSONL (dataset is small ~60 rows)
2. **ID Strategy**: Dual-index with `legacyId` field for gradual migration
3. **Real-time**: Native Convex real-time for conversations/messages
4. **File Storage**: AWS S3 replacing Supabase Storage (preserves folder structure)
5. **Webhooks**: Convex HTTP actions replacing Next.js API routes
6. **Trigger.dev**: Keep for OCR/Python tasks, call Convex via HTTP callbacks

## Success Criteria

From spec.md:
- [ ] All 12 tables migrated with data integrity verified
- [ ] All API routes functional with Convex backend
- [ ] File uploads/downloads working via AWS S3
- [ ] Real-time updates working for conversations
- [ ] Stripe webhooks processing correctly
- [ ] Trigger.dev tasks executing with Convex
- [ ] Build passes (`npm run build`)
- [ ] No Supabase imports remaining in codebase
