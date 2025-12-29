# Feature Specification: Database Revamp - Migration to Convex

**Feature Branch**: `001-db-revamp`
**Created**: 2024-12-28
**Status**: Ready for Planning
**GitHub Issue**: [#79](https://github.com/grootdev-ai/finanseal-mvp/issues/79)
**Priority**: P0 - Launch Blocker
**WINNING Score**: 55/60
**Clarifications Resolved**: 2024-12-29
**Major Decision**: Migrate from Supabase to Convex for schema-as-code benefits

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Developer Environment Separation (Priority: P1)

As a developer, I need separate development and production database environments so that I can safely test features without risking production data or disrupting live customers.

**Why this priority**: Without environment separation, any development mistake could corrupt production data. This is a fundamental infrastructure requirement before soft launch.

**Independent Test**: Can be fully tested by deploying a feature to dev environment and verifying it doesn't affect production data. Delivers safe deployment capability.

**Acceptance Scenarios**:

1. **Given** I am developing a new feature, **When** I run migrations on development, **Then** production database remains unchanged
2. **Given** I need to test with sample data, **When** I seed the dev database, **Then** production data is not affected
3. **Given** I am using Stripe test mode, **When** I process test payments in dev, **Then** no real charges occur and dev database records test transactions

---

### User Story 2 - Schema Cleanup (Priority: P2)

As a database administrator, I need to remove unused tables (VendorGuard feature tables with 0 rows) so that the schema is clean, maintainable, and accurately reflects the current product state.

**Why this priority**: Schema bloat increases cognitive load and maintenance burden. Cleaning up before launch ensures a clean foundation.

**Independent Test**: Can be verified by querying the database schema and confirming only 14 active tables exist. Delivers cleaner codebase.

**Acceptance Scenarios**:

1. **Given** VendorGuard tables exist with 0 rows, **When** schema cleanup runs, **Then** these 3 tables are removed
2. **Given** 14 core tables contain production data, **When** schema cleanup runs, **Then** all data in these tables is preserved
3. **Given** migration history is complex, **When** cleanup is complete, **Then** current schema state is clearly documented

---

### User Story 3 - Schema-as-Code (Priority: P1)

As a developer, I need the database schema defined in TypeScript code so that I can see schema changes in pull requests, have type-safe queries, and eliminate "opaque schema" issues.

**Why this priority**: Schema opacity is a major pain point. Schema-as-code enables code review for DB changes and eliminates drift between code and database.

**Independent Test**: Verify `convex/schema.ts` is the single source of truth, TypeScript errors on schema mismatch. Delivers developer confidence.

**Acceptance Scenarios**:

1. **Given** I modify `convex/schema.ts`, **When** I run Convex dev, **Then** database schema updates automatically
2. **Given** I write a query with wrong field name, **When** TypeScript compiles, **Then** I get a compile-time error
3. **Given** schema changes in a PR, **When** I review the PR, **Then** I can see exactly what DB changes will occur

---

### User Story 4 - Environment Parity (Priority: P3)

As a DevOps engineer, I need both Convex deployments (dev/prod) to have identical schema so that code tested in development behaves identically in production.

**Why this priority**: Environment drift causes "works on my machine" bugs. Convex's schema-as-code ensures parity.

**Independent Test**: Verify same `convex/schema.ts` deploys to both dev and prod. Delivers deployment confidence.

**Acceptance Scenarios**:

1. **Given** schema is defined in code, **When** deployed to dev and prod, **Then** both have identical structure
2. **Given** Convex + Clerk integration, **When** deployed to dev with test users, **Then** auth works same as prod

---

### Edge Cases

- What happens if data migration from Supabase to Convex fails partway through?
- How do we handle the cutover period (Supabase → Convex) without downtime?
- What happens if a developer accidentally uses production Convex deployment from local?
- How do we handle file uploads during migration if keeping Supabase Storage separate?
- What if Convex query performance differs significantly from Supabase for certain patterns?

## Requirements *(mandatory)*

### Functional Requirements

**Schema Management**
- **FR-001**: System MUST drop the `vendorguard_negotiations` table (currently 0 rows)
- **FR-002**: System MUST drop the `vendorguard_conversation_logs` table (currently 0 rows)
- **FR-003**: System MUST drop the `vendor_price_history` table (currently 0 rows)
- **FR-004**: System MUST preserve all 14 core tables: users, businesses, business_memberships, invoices, expense_claims, accounting_entries, line_items, vendors, conversations, messages, audit_events, stripe_events, ocr_usage, documents
- **FR-005**: System MUST preserve all existing data in core tables during cleanup

**Convex Migration**
- **FR-006**: System MUST create Convex project with dev and prod deployments
- **FR-007**: System MUST define all 14 tables in `convex/schema.ts` (schema-as-code)
- **FR-008**: System MUST migrate all existing data from Supabase to Convex
- **FR-009**: System MUST convert 8 RPC functions to Convex queries/mutations
- **FR-010**: System MUST implement business_id filtering in TypeScript (replaces RLS)
- **FR-011**: System MUST convert 4 database triggers to Convex mutation hooks

**Integration Updates**
- **FR-018**: System MUST configure Convex + Clerk integration
- **FR-019**: System MUST update Vercel environment variables for Convex
- **FR-020**: System MUST migrate file storage from Supabase Storage to Convex Files (or keep Supabase Storage as standalone)
- **FR-021**: System MUST update all data access layers to use Convex client

**Data Safety**
- **FR-016**: System MUST create full database backup before any destructive migration
- **FR-017**: System MUST verify backup integrity before proceeding with DROP TABLE operations

**Documentation**
- **FR-012**: System MUST have an Architecture Decision Record (ADR) documenting the database provider decision
- **FR-013**: System SHOULD have an ERD diagram showing current schema relationships
- **FR-014**: ~~System SHOULD have a seed script~~ → Not needed per Q3 (empty dev DB)
- **FR-015**: System SHOULD update CLAUDE.md with current schema documentation

### Key Entities

- **Convex Project**: Cloud database with dev/prod deployments, schema-as-code in TypeScript
- **Convex Schema (`convex/schema.ts`)**: Single source of truth for database structure
- **Convex Query/Mutation**: TypeScript functions replacing SQL queries and RPC functions
- **Business Context Filter**: TypeScript-enforced multi-tenant isolation (replaces RLS)
- **Convex Files**: File storage for documents, receipts, and uploads (alternative: keep Supabase Storage)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Convex schema defines exactly 14 tables in `convex/schema.ts`
- **SC-002**: Zero data loss during migration - all rows from Supabase preserved in Convex
- **SC-003**: Convex project has separate dev and prod deployments
- **SC-004**: All 8 RPC functions converted to Convex queries/mutations
- **SC-005**: All 4 database triggers converted to Convex mutation hooks
- **SC-006**: All existing application features continue to function after migration
- **SC-007**: Environment-specific Stripe integration (test keys in dev, live keys in prod)
- **SC-008**: Multi-tenant isolation enforced via TypeScript business_id filters
- **SC-009**: Clerk + Convex integration working for authentication

## Clarifications *(resolved)*

The following ambiguities were identified and resolved during specification review:

### Q1: Backup Strategy
**Decision**: Full database backup before any destructive migration
- Use `pg_dump` to create full backup of production database
- Store backup in secure location before running DROP TABLE migrations
- Verify backup integrity before proceeding with schema changes

### Q2: Database Provider & Schema-as-Code
**Decision**: Migrate from Supabase to Convex for schema-as-code benefits
- Convex selected: Schema-as-code in TypeScript, built-in realtime, automatic caching
- Convex filtering verified: `q.or()`, `q.and()`, full-text search all supported
- Latency (US region ~200-300ms) accepted as tradeoff for developer experience
- Neon rejected: Production readiness concerns from community feedback
- RLS replaced by TypeScript-enforced business_id filters
- 15 DB functions: 8 RPC → Convex queries, 5 triggers → hooks, 2 RLS helpers → removed

### Q3: Development Environment Seeding
**Decision**: Empty dev database (no seed data)
- Dev environment starts with empty database
- Developers manually create test data as needed
- Simplifies environment setup and avoids PII concerns

## Assumptions

- Convex is the new database provider (US region latency accepted)
- Clerk integration with Convex is supported and documented
- VendorGuard feature is deprioritized ("WAIT") - `get_vendor_spend_analysis` function NOT migrated
- Current production data must be preserved with zero data loss during migration
- Supabase Storage MAY be kept as standalone service for file uploads (decision during planning)
- Migration can be done incrementally (dual-write period) or as big-bang cutover

## Out of Scope

- Implementing the VendorGuard feature (tables dropped, function not migrated)
- Data archival or cleanup of existing records (migrate all data as-is)
- Multi-region database replication
- Supabase → Convex real-time migration (start fresh with Convex realtime)
- Migrating 100+ Supabase migration files (start with clean Convex schema)

## Dependencies

- **Before this**: #72 (Stripe Integration), #78 (Onboarding)
- **Blocks**: Soft Launch
