# Feature Specification: Convex Database Migration

**Issue**: #79 (continuation) | **Priority**: P0 | **Branch**: `002-convex-migration`
**Date**: 2025-12-29

## Summary

Migrate FinanSEAL's database from Supabase PostgreSQL to Convex, including all 12 production tables, file storage, and real-time subscriptions. This enables TypeScript-native database operations, automatic real-time updates, and simplified backend architecture.

## Current State

### Supabase Tables (12 total)

| Table | Rows | Purpose |
|-------|------|---------|
| `users` | 3 | User profiles linked to Clerk |
| `businesses` | 1 | Multi-tenant business accounts |
| `business_memberships` | 0 | Team roles and permissions |
| `accounting_entries` | 3 | General ledger transactions |
| `line_items` | 24 | Transaction line item details |
| `expense_claims` | 24 | Employee expense submissions |
| `invoices` | 2 | COGS document processing |
| `conversations` | 1 | AI chat sessions |
| `messages` | 2 | Chat message history |
| `vendors` | 0 | Supplier management |
| `stripe_events` | 0 | Webhook idempotency |
| `ocr_usage` | 0 | Billing credit tracking |

### Supabase Storage Buckets

- `invoices` - COGS document uploads
- `expense_claims` - Receipt uploads
- `business-logos` - Company branding

### Current Integrations

- **Authentication**: Clerk (will continue with Convex)
- **Background Jobs**: Trigger.dev v3 (needs Convex client integration)
- **Payments**: Stripe (webhook handlers need Convex mutations)

## Target State

### Convex Architecture

```
convex/
├── schema.ts           # Type-safe schema definitions
├── _generated/         # Auto-generated types and API
├── functions/
│   ├── users.ts        # User queries and mutations
│   ├── businesses.ts   # Business management
│   ├── expenses.ts     # Expense claims CRUD
│   ├── invoices.ts     # Invoice processing
│   ├── accounting.ts   # Accounting entries
│   ├── chat.ts         # Conversations and messages
│   └── billing.ts      # Stripe and OCR usage
└── files/              # File storage handlers
```

### Key Benefits

1. **TypeScript-native**: End-to-end type safety from schema to API
2. **Real-time by default**: Automatic subscriptions without manual setup
3. **Simplified auth**: Built-in Clerk integration
4. **File storage**: AWS S3 (preserves folder hierarchy from Supabase Storage)
5. **No migrations**: Schema changes are automatic

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-01 | Set up Convex project and configure Next.js integration | P0 |
| FR-02 | Define Convex schema matching all 12 Supabase tables | P0 |
| FR-03 | Implement Clerk authentication with Convex | P0 |
| FR-04 | Migrate all API routes from Supabase to Convex | P0 |
| FR-05 | Migrate file storage to AWS S3 (preserve path patterns) | P0 |
| FR-06 | Create data migration scripts for existing data | P0 |
| FR-07 | Update Trigger.dev tasks to use Convex | P1 |
| FR-08 | Update Stripe webhook handlers for Convex | P0 |
| FR-09 | Implement real-time subscriptions for UI updates | P1 |
| FR-10 | Remove all Supabase dependencies after verification | P1 |

### Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-01 | Zero data loss during migration | 100% |
| NFR-02 | API response time | < 200ms p95 |
| NFR-03 | Real-time update latency | < 100ms |
| NFR-04 | Build passes throughout migration | Always |

## Migration Strategy

### Phase 1: Setup & Schema (Day 1)
- Initialize Convex project
- Define schema.ts with all tables
- Configure Clerk integration
- Set up ConvexProvider in Next.js

### Phase 2: Core Domain Migration (Days 2-3)
- Migrate users, businesses, business_memberships
- Migrate accounting_entries, line_items
- Migrate expense_claims, invoices
- Update domain services to use Convex

### Phase 3: Supporting Features (Day 4)
- Migrate conversations, messages (chat)
- Migrate vendors, stripe_events, ocr_usage
- Migrate file storage to Convex Files

### Phase 4: Integration Updates (Day 5)
- Update Trigger.dev tasks for Convex
- Update Stripe webhook handlers
- Add real-time subscriptions to UI

### Phase 5: Verification & Cleanup (Day 6)
- Data integrity verification
- Remove Supabase dependencies
- Update documentation

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Data loss during migration | Low | Critical | Run migration in parallel, verify counts |
| Convex latency for SEA | Medium | Medium | Benchmark before full migration |
| RPC function gaps | Medium | Medium | Document Supabase RPCs, recreate in Convex |
| File storage migration | Medium | Medium | Parallel storage during transition |

## Success Criteria

- [ ] All 12 tables migrated with data integrity verified
- [ ] All API routes functional with Convex backend
- [ ] File uploads/downloads working via AWS S3
- [ ] Real-time updates working for expense claims
- [ ] Stripe webhooks processing correctly
- [ ] Trigger.dev tasks executing with Convex
- [ ] Build passes (`npm run build`)
- [ ] No Supabase imports remaining in codebase
