# Implementation Plan: Database Revamp - Migration to Convex

**Branch**: `001-db-revamp` | **Date**: 2024-12-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-db-revamp/spec.md`

## Summary

Migrate FinanSEAL from Supabase PostgreSQL to Convex for schema-as-code benefits. This includes:
- Define 14 tables in `convex/schema.ts` (single source of truth)
- Migrate production data from Supabase to Convex
- Convert 8 RPC functions to Convex queries/mutations
- Replace 14 RLS policies with TypeScript business_id filters
- Convert 4 database triggers to Convex mutation hooks
- Configure Convex + Clerk integration
- Drop 3 deprecated VendorGuard tables (0 rows)

## Technical Context

**Language/Version**: TypeScript 5.9+ with Next.js 15 App Router
**Primary Dependencies**: Convex (database), Clerk (auth), Stripe (billing), Trigger.dev v3 (background jobs)
**Storage**: Convex (tables + files) - migration from Supabase PostgreSQL
**Testing**: Vitest for unit tests, manual E2E for migration verification
**Target Platform**: Vercel (Next.js), Convex Cloud (database)
**Project Type**: Web application (Next.js monolith)
**Performance Goals**: <500ms page loads, realtime updates for chat feature
**Constraints**: US-region latency (~200-300ms) accepted for schema-as-code benefits
**Scale/Scope**: ~100 users at soft launch, 14 tables, ~1000 rows initial data

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Domain-Driven Architecture | Feature code in `src/domains/`? API in `/api/v1/{domain}/`? | ⚠️ CHANGE - Convex queries replace domain data-access files |
| II. Semantic Design System | UI uses semantic tokens only? No hardcoded colors? | ✅ N/A - No UI changes |
| III. Build Validation | `npm run build` passes? | ✅ PENDING - Will verify after each phase |
| IV. Simplicity First | Minimal changes? No over-engineering? | ✅ YES - Direct migration, no new abstractions |
| V. Background Jobs | Long tasks use Trigger.dev? Fire-and-forget pattern? | ✅ YES - Data migration via Trigger.dev task |

**Constitution Conflict**: Technology Standards specify "Database: Supabase PostgreSQL with Row Level Security (RLS)" but this migration changes to Convex. See Complexity Tracking below for justification.

## Project Structure

### Documentation (this feature)

```text
specs/001-db-revamp/
├── plan.md              # This file
├── research.md          # Phase 0: Convex migration research
├── data-model.md        # Phase 1: Convex schema design
├── quickstart.md        # Phase 1: Migration runbook
├── contracts/           # Phase 1: Convex query/mutation signatures
└── tasks.md             # Phase 2: Implementation tasks (from /speckit.tasks)
```

### Source Code (repository root)

```text
# Existing structure (preserved)
src/
├── domains/
│   ├── expense-claims/   # Update data-access.ts → Convex queries
│   ├── invoices/         # Update data-access.ts → Convex queries
│   ├── analytics/        # Update engine.ts → Convex queries
│   ├── chat/             # Update chat.service.ts → Convex queries
│   └── users/            # Update user.service.ts → Convex queries
├── lib/
│   └── db/               # DEPRECATED: supabase-server.ts → convex client
├── trigger/
│   └── data-migration.ts # NEW: Supabase → Convex migration task
└── app/
    └── api/v1/           # Update to use Convex client

# NEW: Convex directory
convex/
├── schema.ts             # NEW: All 14 tables defined here
├── _generated/           # Auto-generated types
├── queries/              # NEW: Convex query functions
│   ├── accountingEntries.ts
│   ├── expenseClaims.ts
│   ├── invoices.ts
│   ├── conversations.ts
│   └── ...
├── mutations/            # NEW: Convex mutation functions
│   ├── accountingEntries.ts
│   ├── expenseClaims.ts
│   └── ...
└── lib/                  # NEW: Shared Convex utilities
    └── auth.ts           # Clerk integration helpers
```

**Structure Decision**: Add new `convex/` directory at repo root following Convex conventions. Existing `src/domains/*/lib/data-access.ts` files will be updated to import from Convex queries instead of Supabase client.

## Complexity Tracking

> **Constitution Violation Justification**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Database Provider Change (Supabase → Convex) | Schema-as-code eliminates "opaque schema" pain point. Schema visible in PRs, type-safe queries, automatic caching. | Staying with Supabase doesn't solve schema opacity. Drizzle+Supabase considered but still requires managing RLS/triggers in database. |
| Remove RLS (database security → app security) | RLS policies were already bypassed via service role key. TypeScript-enforced business_id filters provide equivalent security with better visibility. | RLS conflicts with Convex migration. Current setup already trusts application layer. |
| US-region latency (Singapore → US) | ~200-300ms latency accepted for developer experience benefits (schema-as-code, automatic caching, built-in realtime). Cached reads are instant. | Staying with Supabase Singapore doesn't solve the core pain points. |

## Migration Strategy

### Phase 0: Research & Preparation
1. Research Convex + Clerk integration patterns
2. Research Convex data migration strategies
3. Research Convex file storage vs keeping Supabase Storage
4. Document rollback strategy

### Phase 1: Design
1. Design `convex/schema.ts` from existing 14 tables
2. Design Convex queries/mutations for each domain
3. Design data migration approach (big-bang vs incremental)
4. Design testing strategy

### Phase 2: Implementation (from /speckit.tasks)
1. Set up Convex project with dev/prod deployments
2. Define schema in `convex/schema.ts`
3. Implement Convex queries/mutations
4. Build data migration Trigger.dev task
5. Update domain data-access files
6. Test migration on dev environment
7. Execute production cutover

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Data loss during migration | Low | Critical | Full Supabase backup before migration, verify row counts |
| Query performance regression | Medium | High | Benchmark critical queries in dev before cutover |
| Clerk + Convex integration issues | Low | High | Test auth flow thoroughly in dev environment |
| Rollback needed post-cutover | Low | High | Keep Supabase running for 1 week post-migration |

## Dependencies

- **Before**: #72 (Stripe Integration) ✅, #78 (Onboarding) ✅
- **Blocks**: Soft Launch
- **External**: Convex account setup, Convex + Clerk integration
