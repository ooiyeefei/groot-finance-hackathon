# Implementation Plan: DSPy Vendor Item Matcher

**Branch**: `001-dspy-vendor-item-matcher` | **Date**: 2026-03-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-dspy-vendor-item-matcher/spec.md`
**Parent**: Smart Vendor Intelligence (#320) on branch `001-smart-vendor-intelligence`

## Summary

Add DSPy Tier 2 self-improving AI for cross-vendor item matching. The 5 DSPy components (Signature, Module, ChainOfThought, Assert/Suggest, BootstrapFewShot + MIPROv2) follow the exact pattern established by AR recon, bank recon, and fee classification. A new Python module (`vendor_item_matcher.py`) is added to the existing fee-classifier Lambda Docker container. Corrections table captures user confirmations/rejections. Convex actions call the Lambda via MCP client. Weekly optimization via the existing EventBridge-triggered optimizer Lambda.

## Technical Context

**Language/Version**: Python 3.11 (Lambda), TypeScript 5.9.3 (Convex + Next.js)
**Primary Dependencies**: DSPy 2.6+, litellm, boto3 (Lambda); Convex 1.31.3 (backend); React 19.1.2 (frontend)
**AI Model**: Gemini 3.1 Flash-Lite (`gemini-3.1-flash-lite-preview`) per CLAUDE.md
**Storage**: S3 (`finanseal-bucket/dspy-models/vendor_item_match_{businessId}/`) for optimized model state; Convex for corrections + model versions
**Testing**: Manual UAT (no unit tests specified in spec)
**Target Platform**: AWS Lambda (Python Docker, x86_64, 1024MB) + Convex Cloud
**Project Type**: Extension of existing Lambda + Convex infrastructure
**Performance Goals**: <3s per match suggestion batch; <15min per optimization run
**Constraints**: Convex free plan bandwidth limits; no new crons; existing Lambda Docker container
**Scale/Scope**: Per-business models; 20+ corrections threshold; 10+ unique item pairs for optimization

## Constitution Check (CLAUDE.md Rules)

| Rule | Status | Notes |
|------|--------|-------|
| Git author `grootdev-ai` | ✅ Pass | Already configured on branch |
| Clerk 6.30.0 lock | ✅ N/A | No Clerk changes |
| Build-fix loop | ✅ Will verify | `npm run build` after each phase |
| Convex deploy | ✅ Will deploy | New table + functions require `npx convex deploy --yes` |
| Convex bandwidth | ✅ Pass | On-demand action pattern (no crons). `.take(N)` on all queries |
| No reactive query for aggregations | ✅ Pass | Match suggestions use `action` + `internalQuery`, not `query` |
| Security — least privilege | ✅ Pass | `internalMutation` for system ops; `mutation` with auth for user ops |
| AWS CDK for infra | ✅ N/A | Reuses existing Lambda Docker container — no new CDK stack |
| MCP single intelligence engine | ✅ Pass | Match logic runs in Lambda via MCP tool call, not duplicated in Convex |
| Domain-driven design | ✅ Pass | All files in `src/domains/vendor-intelligence/` or `convex/functions/` |
| Gemini model selection | ✅ Pass | Uses `gemini-3.1-flash-lite-preview` per CLAUDE.md mandate |
| Tiered intelligence | ✅ Pass | Tier 1 (Jaccard) already in #320; this adds Tier 2 (DSPy) |
| Page layout pattern | ✅ N/A | No new pages — extends existing Price Intelligence page |
| Prefer modification over creation | ✅ Pass | Adds to existing Lambda handler.py, existing Convex functions |

## Project Structure

### Documentation
```text
specs/001-dspy-vendor-item-matcher/
├── plan.md              # This file
├── research.md          # Phase 0: DSPy pattern analysis
├── data-model.md        # Phase 1: Corrections table schema
├── contracts/           # Phase 1: Lambda + Convex function contracts
│   ├── types.ts         # TypeScript type contracts
│   └── mutations.ts     # Convex function contracts
└── tasks.md             # Phase 2: Implementation tasks
```

### Source Code (modifications to existing files)
```text
# Python Lambda (EXISTING container — add new module + handler route)
src/lambda/fee-classifier-python/
├── handler.py                    # MODIFY: Add match_vendor_items + optimize_vendor_item_model routes
├── vendor_item_matcher.py        # NEW: DSPy Signature + Module + ChainOfThought + Assert/Suggest
└── vendor_item_optimizer.py      # NEW: MIPROv2 optimization pipeline

# Convex Backend (EXISTING functions — add new file)
convex/
├── schema.ts                     # MODIFY: Add vendor_item_matching_corrections table
└── functions/
    ├── vendorItemMatching.ts     # NEW: Convex actions to call Lambda + manage corrections
    └── crossVendorItemGroups.ts  # MODIFY: Wire suggestMatches to call Lambda

# Frontend (EXISTING components — minor updates)
src/domains/vendor-intelligence/
└── components/
    └── item-group-editor.tsx     # MODIFY: Add confidence score display from DSPy
```

## Phase 0: Research — Complete

See [research.md](./research.md) for full analysis. Key decisions:
1. Reuse existing `fee-classifier-python` Lambda container (no new CDK stack)
2. Follow exact 5-component pattern from `bank_recon_module.py`
3. Corrections table follows `order_matching_corrections` pattern (per-business)
4. Optimization threshold: 20 corrections + 10 unique pairs (lower than AR's 100)
5. Model S3 key: `dspy-models/vendor_item_match_{businessId}/v{N}.json`

## Phase 1: Design — Complete

See [data-model.md](./data-model.md) and [contracts/](./contracts/) for full schemas.

## Phase 2: Task Breakdown

Deferred to `/speckit.tasks` command.
