# Issue #79: Database Revamp - Schema Cleanup & Environment Setup

**GitHub URL:** https://github.com/grootdev-ai/finanseal-mvp/issues/79
**Priority:** P0 - Launch Blocker
**WINNING Score:** 55/60
**Created:** 2025-12-28
**Dependency:** After #72 (Stripe) and #78 (Onboarding) - Before Soft Launch

## Summary

Clean up database schema, evaluate database options, and set up separate dev/prod Supabase projects before soft launch.

## Key Deliverables

1. **Database Provider Decision**: Document decision to stay with Supabase (ADR)
2. **Schema Cleanup**: Drop 3 VendorGuard tables (0 rows each)
3. **Environment Setup**: Create `finanseal-dev` project, configure Vercel env vars

## Schema Changes

### Tables to DROP (3)
- `vendorguard_negotiations` (0 rows)
- `vendorguard_conversation_logs` (0 rows)
- `vendor_price_history` (0 rows)

### Tables to KEEP (14)
- Core: users, businesses, business_memberships, invoices, expense_claims, accounting_entries, line_items, vendors
- Chat: conversations, messages
- Audit: audit_events
- Billing: stripe_events, ocr_usage

## WINNING Analysis

| Factor | Score | Rationale |
|--------|-------|-----------|
| Worth | 9/10 | Can't launch without env separation |
| Impact | 8/10 | Enables safe deployments |
| Now | 10/10 | Pre-launch blocker |
| Necessary | 10/10 | Infrastructure foundation |
| Implementable | 9/10 | Clear steps, low risk |
| Notable | 4/10 | Hygiene, not differentiator |

## Relationship to Other Issues

```
#72 (Stripe) → #78 (Onboarding) → #79 (DB Revamp) → Soft Launch
```

## PRD Location

Full PRD: `.pm/prds/database-revamp.md`

## Next Steps

Implement with: `/speckit.specify #79`
