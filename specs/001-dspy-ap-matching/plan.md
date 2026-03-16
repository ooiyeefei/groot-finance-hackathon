# Implementation Plan: Self-Improving AI AP 3-Way Matching Engine

**Branch**: `001-dspy-ap-matching` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)

## Summary

Upgrade the deterministic AP 3-Way Matching engine with a DSPy-powered Tier 2 AI layer. When Tier 1 word-overlap matching fails (confidence < 0.6), the system escalates to a semantic matching engine that understands vendor-specific codes, explains variances with reasoning traces, and learns from user corrections. Reuses the existing `fee-classifier-python` Lambda and `dspy_model_versions` infrastructure.

## Technical Context

**Language/Version**: Python 3.11 (Lambda), TypeScript 5.9.3 (Convex + Next.js)
**Primary Dependencies**: DSPy 2.6+, litellm, Gemini 3.1 Flash-Lite, Convex 1.31.3
**Storage**: Convex (corrections, model versions), S3 `finanseal-bucket/dspy-models/po_matching/`
**Testing**: `npm run build` (Next.js), Convex deploy verification, manual UAT
**Target Platform**: AWS Lambda (Python Docker x86_64) + Convex Cloud + Vercel (Next.js)
**Project Type**: Web application (fullstack)
**Performance Goals**: Tier 2 AI matching <5s per invoice (5-10 line items)
**Constraints**: Reuse existing Lambda (`fee-classifier-python`), per-plan AI call caps (150/500/unlimited)
**Scale/Scope**: ~50 businesses, ~500 invoices/business/month

## Constitution Check

No project constitution configured. Proceeding with CLAUDE.md rules:
- ✅ Tiered Intelligence Architecture (Tier 1 rules → Tier 2 DSPy)
- ✅ AWS Lambda for AI operations (not in Convex actions)
- ✅ Reuse existing CDK stack (document-processing-stack.ts)
- ✅ MCP client for Convex → Lambda communication
- ✅ Per-business model isolation with S3 storage

## Project Structure

### Documentation

```text
specs/001-dspy-ap-matching/
├── plan.md              # This file
├── research.md          # Phase 0: Technology decisions
├── data-model.md        # Phase 1: Schema extensions
├── quickstart.md        # Phase 1: Developer setup guide
├── contracts/
│   └── lambda-routes.md # Phase 1: Lambda API contract
└── tasks.md             # Phase 2: Implementation tasks
```

### Source Code

```text
# Python Lambda (extend existing)
src/lambda/fee-classifier-python/
├── po_matching_module.py    # NEW: DSPy module for PO-Invoice line matching
├── handler.py               # MODIFY: Add /match_po_invoice route
├── optimizer.py             # MODIFY: Add PO matching optimization

# Convex Backend
convex/
├── schema.ts                # MODIFY: Add po_match_corrections table
├── functions/
│   ├── poMatches.ts         # MODIFY: Add Tier 2 trigger, correction capture
│   ├── poMatchingAI.ts      # NEW: Tier 2 AI internalAction (calls Lambda via MCP)
│   └── poMatchOptimization.ts # NEW: Optimization triggers + training data queries
├── crons.ts                 # MODIFY: Add weekly PO matching optimization cron
└── lib/
    └── mcp-client.ts        # EXISTING: callMCPTool() reused

# Frontend
src/domains/payables/
├── components/
│   ├── match-review.tsx     # MODIFY: Add AI reasoning traces display
│   ├── matching-summary.tsx # MODIFY: Add AI metrics to dashboard
│   └── ai-usage-meter.tsx   # NEW: Monthly AI call usage display
└── hooks/
    └── use-matches.ts       # MODIFY: Add correction capture on approve/reject
```

## Complexity Tracking

No constitution violations to justify.
