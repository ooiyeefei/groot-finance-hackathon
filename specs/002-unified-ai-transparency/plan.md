# Implementation Plan: Daily AI Digest Email (Phase 1 of Unified Transparency)

**Branch**: `002-unified-ai-transparency` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)

## Summary

Build a Daily AI Intelligence Digest email that aggregates AI activity across AR matching, bank recon, and fee classification. Sends at 6 PM local time via existing SES infrastructure. Shows: time saved, autonomy rate, trust summary, exceptions needing review, and audit download link. Uses bridge pattern — aggregates from existing scattered tables now, swappable to `ai_traces` later.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (Convex + Next.js 15.5.7)
**Primary Dependencies**: Convex 1.31.3, AWS SES (existing), email-service.ts (shared Lambda)
**Storage**: Convex (queries across sales_orders, bank_transactions, order_matching_corrections, bank_recon_corrections, fee_classification_corrections)
**Email**: Existing SES setup — `noreply@notifications.hellogroot.com`, configuration set `finanseal-transactional`
**Testing**: `npm run build`, manual trigger of digest cron
**Target Platform**: Web (email delivery via SES)

## Architecture Decision: Bridge Pattern

**Problem**: The `ai_traces` unified table doesn't exist yet. Each AI module stores decisions differently.

**Solution**: Create a `gatherAIActivity()` internal query that normalizes data from existing tables into a common shape. The digest consumes this normalized shape. When `ai_traces` is built later, only `gatherAIActivity()` changes — the digest logic stays the same.

```
sales_orders (AR)          ─┐
bank_transactions (bank)   ─┤── gatherAIActivity() ─── normalizedActivity[] ─── digest email
fee_classification (fees)  ─┘
```

## Project Structure

```text
convex/functions/
├── aiDigest.ts                              # NEW: digest aggregation + email trigger
└── notifications.ts                         # EXISTING: email sending patterns (reuse)

src/app/api/v1/ai-digest/
└── route.ts                                 # NEW: API route for digest email rendering + send

lambda/shared/templates/
└── ai-digest.ts                             # NEW: email HTML template
```
