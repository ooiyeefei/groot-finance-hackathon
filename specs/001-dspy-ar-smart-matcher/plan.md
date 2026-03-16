# Implementation Plan: DSPy Smart Matcher for AR Order-to-Invoice Reconciliation

**Branch**: `001-dspy-ar-smart-matcher` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-dspy-ar-smart-matcher/spec.md`

## Summary

Add a Tier 2 DSPy-powered matching layer to AR reconciliation that runs automatically after the existing Tier 1 deterministic matcher. The AI matcher uses ChainOfThought reasoning, learns from user corrections via BootstrapFewShot/MIPROv2, enforces reconciliation integrity via Assert/Suggest, supports 1-to-N split matching (capped at 5 invoices), and tracks metrics. All Tier 2 suggestions require explicit user approval via a bulk-approve UI with confidence-based highlighting.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (Convex + Next.js 15.5.7), Python 3.11 (DSPy Lambda)
**Primary Dependencies**: Convex 1.31.3, DSPy 2.6+, litellm, Gemini 3.1 Flash-Lite (`gemini-3.1-flash-lite-preview`), React 19.1.2, Radix UI
**Storage**: Convex (document DB — new `order_matching_corrections` table, extended `sales_orders`), S3 (`finanseal-bucket/dspy-models/ar_match_{businessId}/`)
**Testing**: `npm run build` (TypeScript compilation), manual UAT with test CSV imports
**Target Platform**: Web (Next.js on Vercel), Lambda (Python Docker on AWS)
**Project Type**: Web application (Next.js frontend + Convex backend + Lambda AI)
**Performance Goals**: 3 seconds per order for Tier 2 matching, 60 seconds total for batch of 50 unmatched orders
**Constraints**: All Tier 2 matches require user approval (no auto-accept), split match cap at 5 invoices, cold-start confidence cap at 0.80
**Scale/Scope**: SE Asian SME businesses, typical batch sizes 20-200 orders, ~10-50 open invoices per business

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution is a blank template — no project-specific gates defined. Proceeding with CLAUDE.md rules as the governing constraints:
- **Tier 1/Tier 2 pattern**: Follows existing architecture (fee classification, bank recon) ✅
- **DSPy Lambda extension**: Adds endpoints to existing `finanseal-dspy-optimizer` Lambda — no new stacks ✅
- **Domain-Driven Design**: AR matching lives in `src/domains/sales-invoices/` (existing domain) ✅
- **Convex deployment**: Will need `npx convex deploy --yes` after schema changes ✅
- **MCP routing**: Uses existing `convex/lib/mcpClient.ts` pattern ✅
- **Gemini model**: Uses `gemini-3.1-flash-lite-preview` (not deprecated `gemini-2.0-flash`) ✅

## Project Structure

### Documentation (this feature)

```text
specs/001-dspy-ar-smart-matcher/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── ar-match-api.md  # Lambda endpoint contracts
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
# Convex backend (schema + functions)
convex/
├── schema.ts                                    # Extended: order_matching_corrections table
├── functions/
│   ├── salesOrders.ts                           # Modified: Tier 2 trigger after runMatching()
│   ├── orderMatchingCorrections.ts              # NEW: correction CRUD + training data export
│   └── orderMatchingOptimization.ts             # NEW: weekly MIPROv2 optimization pipeline
├── lib/
│   └── mcpClient.ts                             # Existing: reused for Tier 2 Lambda calls

# Python Lambda (DSPy AI module)
src/lambda/fee-classifier-python/
├── handler.py                                   # Modified: new /match_orders endpoint
├── ar_match_module.py                           # NEW: OrderInvoiceMatcher DSPy module
└── ar_match_optimizer.py                        # NEW: MIPROv2 optimizer for AR matching

# Next.js frontend (AR reconciliation UI)
src/domains/sales-invoices/
├── components/
│   └── ar-reconciliation.tsx                    # Modified: Tier 2 suggestion display + bulk approve
└── hooks/
    └── use-reconciliation.ts                    # Modified: new mutation refs for corrections
```

**Structure Decision**: Follows existing codebase patterns exactly — Convex functions for backend, Python Lambda for DSPy AI, domain components for UI. No new directories or stacks created.

## Complexity Tracking

No constitution violations to justify.
