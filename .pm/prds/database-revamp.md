# PRD: Database Revamp - Schema Cleanup & Environment Setup

**Status:** NEW | **Priority:** P0 | **WINNING Score:** 55/60
**Author:** Claude Code (PRD Generator)
**Date:** 2025-12-28
**Dependency:** After #72 (Stripe) and #78 (Onboarding) - Before Soft Launch

---

## Problem Statement

### The Problem

The current database has accumulated technical debt from rapid MVP development:

1. **Schema Bloat**: 17 tables, some with 0 rows (VendorGuard: 3 tables, future feature)
2. **Column Redundancy**: Duplicate purpose columns (e.g., `home_amount` vs `home_currency_amount`)
3. **No Environment Separation**: Single Supabase project for dev/staging/prod
4. **Migration Debt**: 100+ migration files, hard to track what's current
5. **Database Choice Not Validated**: Supabase assumed, but alternatives may be better for our use case

### Impact

- **Development Velocity**: Confusion about which tables/columns are canonical
- **Deployment Risk**: No staging environment to test migrations before prod
- **Cost**: Paying for unused storage/indexes on dead tables
- **Maintenance**: Hard to onboard new developers with unclear schema

### Why Now (P0)

This is a **pre-launch blocker** because:
1. Can't launch with dev/prod on same database
2. Schema confusion will compound as we add features
3. Changing database provider post-launch is 10x harder
4. Need clean environment setup before first paying customers

---

## User Stories

### Primary User: Development Team

**As a** developer on FinanSEAL
**I want** a clean, minimal database schema with proper environment separation
**So that** I can confidently deploy to production without affecting staging

### Secondary User: Future Developer

**As a** new developer joining the team
**I want** clear database documentation with no dead tables
**So that** I can understand the data model quickly

---

## Proposed Solution

### Phase 1: Database Provider Decision

#### Evaluation Criteria

| Criteria | Weight | Description |
|----------|--------|-------------|
| **SEA Latency** | 25% | Edge/region support for Singapore, Malaysia, Thailand |
| **Real-time** | 15% | Subscriptions, live updates for chat/notifications |
| **Cost at Scale** | 20% | Pricing at 1K, 10K, 100K users |
| **Developer Experience** | 15% | TypeScript support, migrations, local dev |
| **Ecosystem** | 15% | Auth, Storage, Edge Functions integration |
| **AI/Analytics** | 10% | Vector support, analytics queries |

#### Options Analysis

| Provider | Type | Strengths | Weaknesses | SEA Latency | Cost (10K users) |
|----------|------|-----------|------------|-------------|------------------|
| **Supabase** (Current) | PostgreSQL | RLS, Auth, Storage, Edge Functions, Realtime | Limited edge regions | Singapore region | ~$25/mo Pro |
| **Neon** | Serverless PG | Branching, autoscale, serverless | No auth/storage bundle | Singapore region | ~$20/mo |
| **Convex** | Real-time DB | TypeScript-native, real-time first | No raw SQL, learning curve | US-only (latency risk) | ~$25/mo |
| **PlanetScale** | MySQL | Horizontal scale, branching | MySQL not PostgreSQL | Tokyo (close) | ~$30/mo |
| **Turso** | Edge SQLite | Global edge, embedded | Limited features | Global edge | ~$10/mo |
| **DuckDB** | Analytics | Blazing analytics, embedded | Not OLTP, no real-time | Local only | Free |

#### Recommendation: **Stay with Supabase**

**Rationale:**
1. **Already integrated**: Auth (Clerk SSO), Storage, Edge Functions, RLS
2. **Singapore region**: Best latency for SEA target market
3. **Realtime built-in**: Needed for chat, notifications, live updates
4. **Migration cost**: Switching providers is 2-4 weeks of work
5. **Ecosystem**: Storage buckets already in use for receipts/invoices

**When to reconsider:**
- If we need analytics-heavy queries (add DuckDB as read replica)
- If latency issues emerge in Thailand/Indonesia (evaluate Turso)
- If we exceed 100K users (evaluate PlanetScale for horizontal scale)

---

### Phase 2: Schema Cleanup

#### Current State (17 Tables)

| Table | Rows | Status | Action |
|-------|------|--------|--------|
| `users` | 2 | Core | **KEEP** - Clean |
| `businesses` | 1 | Core | **KEEP** - Clean |
| `business_memberships` | 0 | Core | **KEEP** - Clean |
| `invoices` | 2 | Core | **KEEP** - Review columns |
| `expense_claims` | 24 | Core | **KEEP** - Review columns |
| `accounting_entries` | 3 | Core | **KEEP** - Review columns |
| `line_items` | 24 | Core | **KEEP** - Clean |
| `conversations` | 1 | Chat | **KEEP** - Clean |
| `messages` | 2 | Chat | **KEEP** - Clean |
| `audit_events` | 13 | Audit | **KEEP** - Clean |
| `vendors` | 0 | Core | **KEEP** - Used by accounting_entries |
| `stripe_events` | 0 | Billing | **KEEP** - Required for Stripe |
| `ocr_usage` | 0 | Billing | **KEEP** - Required for billing |
| `vendorguard_negotiations` | 0 | Future | **DROP** - WAIT feature |
| `vendorguard_conversation_logs` | 0 | Future | **DROP** - WAIT feature |
| `vendor_price_history` | 0 | Future | **DROP** - WAIT feature |

#### Tables to DROP (3)

```sql
-- VendorGuard tables (Score: 25, WAIT recommendation)
DROP TABLE IF EXISTS vendorguard_conversation_logs CASCADE;
DROP TABLE IF EXISTS vendorguard_negotiations CASCADE;
DROP TABLE IF EXISTS vendor_price_history CASCADE;
```

**Note**: Keep migration files, just drop tables. Can recreate when VendorGuard is built.

#### Columns to Review

**invoices (28 columns)**
- Consider consolidating: `confidence_score` + `document_classification_confidence`
- Review: `processing_tier` usage

**accounting_entries (31 columns)**
- Redundant: `home_currency_amount` vs `home_amount` (keep one)
- Review: `document_metadata` vs `processing_metadata` overlap

**expense_claims (38 columns)**
- Large table, but most columns have clear purpose
- Review: `approved_at` vs `paid_at` timing fields

---

### Phase 3: Environment Setup

#### Target Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    SUPABASE PROJECTS                            │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐    ┌──────────────────┐                  │
│  │   PRODUCTION     │    │   DEVELOPMENT    │                  │
│  │  (finanseal-prod)│    │  (finanseal-dev) │                  │
│  ├──────────────────┤    ├──────────────────┤                  │
│  │ • Live customers │    │ • Feature dev    │                  │
│  │ • Real payments  │    │ • Testing        │                  │
│  │ • Stripe Live    │    │ • Stripe Test    │                  │
│  │ • No test data   │    │ • Seed data OK   │                  │
│  └──────────────────┘    └──────────────────┘                  │
│                                                                 │
│  Environment Variables:                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ PROD:                                                    │   │
│  │   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co      │   │
│  │   SUPABASE_SERVICE_ROLE_KEY=sbp_xxx                     │   │
│  │   STRIPE_SECRET_KEY=sk_live_xxx                         │   │
│  │                                                          │   │
│  │ DEV:                                                     │   │
│  │   NEXT_PUBLIC_SUPABASE_URL=https://yyy.supabase.co      │   │
│  │   SUPABASE_SERVICE_ROLE_KEY=sbp_yyy                     │   │
│  │   STRIPE_SECRET_KEY=sk_test_xxx                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

#### Deployment Flow

```
Developer Branch → Dev Supabase → Review → Main Branch → Prod Supabase
      ↓                ↓                          ↓
  Local dev         Test data              Customer data
  Seed scripts      Integration tests      No seed data
```

---

## Requirements

### Functional Requirements

#### P0 - Must Have (Launch Blockers)

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| FR-01 | Database provider decision documented | Written decision with rationale |
| FR-02 | VendorGuard tables dropped | 3 tables removed from prod |
| FR-03 | Create Supabase dev project | New project `finanseal-dev` |
| FR-04 | Environment variables configured | `.env.local`, `.env.production` |
| FR-05 | Apply migrations to both envs | Schema identical in dev & prod |
| FR-06 | RLS policies applied to both | Security consistent |
| FR-07 | Storage buckets created in both | `invoices`, `expense_claims`, `business-logos` |

#### P1 - Should Have

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| FR-08 | Schema documentation | ERD diagram + column descriptions |
| FR-09 | Seed script for dev | Sample businesses, users, transactions |
| FR-10 | Column redundancy cleanup | Remove duplicate columns |
| FR-11 | Migration consolidation | Squash 100+ migrations to clean baseline |

### Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-01 | Migration time | < 10 minutes per environment |
| NFR-02 | Zero downtime | Prod migration with no service interruption |
| NFR-03 | Rollback capability | Can revert within 30 minutes |
| NFR-04 | Documentation | Schema docs updated within 24h of changes |

---

## Technical Design

### Migration Strategy

#### Step 1: Create Dev Project

```bash
# Via Supabase Dashboard or CLI
supabase projects create finanseal-dev --org-id <org-id> --region ap-southeast-1
```

#### Step 2: Apply Current Schema to Dev

```bash
# Generate current schema SQL
supabase db dump --project-ref ohxwghdgsuyabgsndfzc > schema.sql

# Apply to dev project
supabase db push --project-ref <dev-project-ref>
```

#### Step 3: Drop VendorGuard Tables

```sql
-- Migration: drop_vendorguard_tables.sql
-- Safe to run: No data, no dependencies on core tables

BEGIN;

-- Drop in order (child → parent due to FKs)
DROP TABLE IF EXISTS vendorguard_conversation_logs CASCADE;
DROP TABLE IF EXISTS vendorguard_negotiations CASCADE;
DROP TABLE IF EXISTS vendor_price_history CASCADE;

-- Remove vendor.id FK from accounting_entries if needed
-- (Keep vendors table, just remove VendorGuard-specific columns)

COMMIT;
```

#### Step 4: Environment Variables

```bash
# .env.local (development)
NEXT_PUBLIC_SUPABASE_URL=https://finanseal-dev.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...dev...
SUPABASE_SERVICE_ROLE_KEY=sbp_...dev...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...dev...

# .env.production (production)
NEXT_PUBLIC_SUPABASE_URL=https://ohxwghdgsuyabgsndfzc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...prod...
SUPABASE_SERVICE_ROLE_KEY=sbp_...prod...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...prod...
```

#### Step 5: Vercel Environment Configuration

```
Vercel Project Settings → Environment Variables:

Production:
  NEXT_PUBLIC_SUPABASE_URL = prod URL
  SUPABASE_SERVICE_ROLE_KEY = prod key

Preview:
  NEXT_PUBLIC_SUPABASE_URL = dev URL
  SUPABASE_SERVICE_ROLE_KEY = dev key

Development:
  NEXT_PUBLIC_SUPABASE_URL = dev URL
  SUPABASE_SERVICE_ROLE_KEY = dev key
```

---

### Final Schema (Target State)

```
┌─────────────────────────────────────────────────────────────────┐
│                      FINANSEAL SCHEMA v2                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐     ┌─────────────────┐                    │
│  │     users       │────→│   businesses    │                    │
│  │   (Clerk Auth)  │     │   (Multi-tenant)│                    │
│  └────────┬────────┘     └────────┬────────┘                    │
│           │                       │                              │
│           │  ┌────────────────────┼────────────────────┐        │
│           │  │                    │                    │        │
│           ▼  ▼                    ▼                    ▼        │
│  ┌─────────────────┐     ┌─────────────────┐  ┌───────────────┐ │
│  │business_members │     │    invoices     │  │expense_claims │ │
│  │ (Roles/Teams)   │     │  (COGS Docs)    │  │ (Expense Docs)│ │
│  └─────────────────┘     └────────┬────────┘  └───────┬───────┘ │
│                                   │                   │         │
│                                   ▼                   ▼         │
│                          ┌─────────────────┐                    │
│                          │accounting_entry │←────────────────┐  │
│                          │  (General Ledger)│                │  │
│                          └────────┬────────┘                 │  │
│                                   │                          │  │
│                                   ▼                          │  │
│                          ┌─────────────────┐        ┌────────┴──┤
│                          │   line_items    │        │  vendors  │
│                          │ (Entry Details) │        │(Suppliers)│
│                          └─────────────────┘        └───────────┘
│                                                                  │
│  Supporting Tables:                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  conversations  │  │  audit_events   │  │  stripe_events  │  │
│  │    messages     │  │ (Compliance)    │  │   ocr_usage     │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│                                                                  │
│  REMOVED (VendorGuard - WAIT):                                  │
│  ✗ vendorguard_negotiations                                     │
│  ✗ vendorguard_conversation_logs                                │
│  ✗ vendor_price_history                                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

Final Count: 14 tables (down from 17)
```

---

## Edge Cases

| Case | Handling |
|------|----------|
| Migration fails mid-way | Transaction rollback, no partial state |
| Dev/Prod schema drift | Weekly sync check, automated alert |
| Accidental prod data in dev | Never copy prod data, use seed scripts only |
| Storage bucket mismatch | Create identical buckets in both envs |
| RLS policy difference | Apply same SQL to both, test in dev first |

---

## Out of Scope

1. **Read replicas** - Not needed at current scale
2. **Database sharding** - Way too early
3. **Multi-region** - Single SEA region sufficient for now
4. **Analytics warehouse** - Add DuckDB when analytics needed
5. **GraphQL layer** - REST API sufficient

---

## Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Tables count | 17 | 14 | Schema inspection |
| Dead table rows | 0 (3 tables) | N/A (dropped) | N/A |
| Environments | 1 | 2 (dev + prod) | Supabase dashboard |
| Migration conflicts | N/A | 0 per week | Git merge conflicts |
| Schema documentation | Outdated | Current | CLAUDE.md updated |

---

## WINNING Score Analysis

| Factor | Score | Rationale |
|--------|-------|-----------|
| **Worth** (Pain Intensity) | 9/10 | Can't launch without env separation |
| **Impact** (Revenue) | 8/10 | Enables safe deployments → customer trust |
| **Now** (Timing) | 10/10 | Pre-launch blocker |
| **Necessary** (Fit) | 10/10 | Infrastructure foundation |
| **Implementable** | 9/10 | Clear steps, low risk |
| **Notable** (Moat) | 4/10 | Hygiene, not differentiator |

**Total: 55/60** - **Priority: P0 (Launch Blocker)**

---

## Implementation Roadmap

### Phase 1: Decision & Setup (1 day)
- [ ] Finalize database provider decision (document in ADR)
- [ ] Create Supabase dev project `finanseal-dev`
- [ ] Configure environment variables in Vercel

### Phase 2: Schema Cleanup (1 day)
- [ ] Create migration to drop VendorGuard tables
- [ ] Test migration on dev
- [ ] Apply migration to prod
- [ ] Update CLAUDE.md with new schema

### Phase 3: Environment Parity (1 day)
- [ ] Apply all migrations to dev project
- [ ] Create storage buckets in dev
- [ ] Apply RLS policies to dev
- [ ] Test full flow on dev environment

### Phase 4: Documentation (0.5 days)
- [ ] Generate ERD diagram
- [ ] Update CLAUDE.md schema section
- [ ] Create seed script for dev
- [ ] Document deployment process

**Total: 3.5 days**

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Migration breaks prod | Low | High | Test on dev first, transaction-wrapped |
| Env variable leak | Medium | High | Use Vercel secrets, never commit |
| Dev/prod drift | Medium | Medium | Weekly schema sync check |
| Wrong env in PR | Medium | Low | Environment indicator in UI |

---

## Appendix

### Architecture Decision Record (ADR)

**ADR-001: Database Provider Selection**

**Context**: Need to decide whether to stay with Supabase or migrate to alternative.

**Decision**: Stay with Supabase

**Consequences**:
- (+) No migration effort, save 2-4 weeks
- (+) Keep existing Auth/Storage integration
- (+) Singapore region for SEA latency
- (-) Limited horizontal scaling (future concern)
- (-) No database branching (Neon has this)

**Reviewed by**: [Team review required]

---

*Generated by PRD Generator Agent*
*Analysis Date: 2025-12-28*
