# Implementation Plan: Usage Tracking (AI Chat, E-Invoice, Credit Packs)

**Branch**: `001-usage-tracking` | **Date**: 2026-02-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-usage-tracking/spec.md`

## Summary

Build per-business, per-month usage tracking for AI chat messages, LHDN e-invoice submissions, and sales invoices, plus a credit pack system for add-on AI message and OCR purchases. The implementation mirrors the existing `ocrUsage.ts` pattern — Convex tables with monthly keys, atomic pre-flight checks, and lazy record creation. Credit packs add FIFO consumption and 90-day expiry via daily cron. The billing subscription API and client hook extend to expose all usage types.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, Stripe SDK 20.1.0, Clerk 6.30.0
**Storage**: Convex (document database with real-time sync)
**Testing**: Build verification (`npm run build`), manual acceptance testing
**Target Platform**: Web application (Next.js server + Convex backend)
**Project Type**: Web (monorepo with Next.js frontend + Convex backend)
**Performance Goals**: Pre-flight check + usage recording < 1 second added latency (SC-007)
**Constraints**: Fail-open on transient failures; Convex mutation atomicity for concurrency
**Scale/Scope**: Per-business tracking (~hundreds of businesses), monthly counters, credit pack FIFO

## Constitution Check

*GATE: No project constitution defined — template placeholder only. Proceeding without gates.*

No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/001-usage-tracking/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: technical research
├── data-model.md        # Phase 1: entity definitions
├── quickstart.md        # Phase 1: developer quickstart
├── contracts/
│   └── usage-api.md     # Phase 1: API contracts
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
convex/
├── schema.ts                           # MODIFY: add 3 new tables
├── crons.ts                            # MODIFY: add credit pack expiry cron
├── functions/
│   ├── ocrUsage.ts                     # REFERENCE: pattern to follow
│   ├── aiMessageUsage.ts              # CREATE: AI chat usage tracking
│   ├── einvoiceUsage.ts               # CREATE: e-invoice usage tracking
│   ├── salesInvoiceUsage.ts           # CREATE: sales invoice count (derived)
│   └── creditPacks.ts                 # CREATE: credit pack management

src/
├── lib/stripe/
│   ├── catalog.ts                      # MODIFY: extend PlanConfig with new limits
│   └── webhook-handlers-convex.ts      # MODIFY: handle credit pack checkout
├── app/api/
│   ├── copilotkit/route.ts             # MODIFY: add AI chat pre-flight check
│   └── v1/billing/
│       └── subscription/route.ts       # MODIFY: extend usage response
└── domains/billing/hooks/
    └── use-subscription.ts             # MODIFY: extend client hook
```

**Structure Decision**: No new directories needed. All new Convex functions follow the existing `convex/functions/` convention. No new API routes — existing endpoints are extended.

## Complexity Tracking

No constitution violations to justify.
