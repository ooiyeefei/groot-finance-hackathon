# Implementation Plan: Hybrid Fee Breakdown Detection (Rules + DSPy)

**Branch**: `001-dspy-fee-breakdown` | **Date**: 2026-03-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-dspy-fee-breakdown/spec.md`

## Summary

Implement intelligent fee breakdown detection for e-commerce platform settlements using a hybrid approach: Tier 1 rules-based classification (already built on `001-hybrid-fee-detection` branch) + Tier 2 DSPy-powered classification for unknown fees. The DSPy module uses BootstrapFewShot with Gemini 3.1 Flash-Lite, Assert constraints for balance validation, and MIPROv2 for weekly batch optimization. Models are per-platform (shared base) with per-business fine-tuning.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (Convex + Next.js) + Python 3.11 (DSPy Lambda)
**Primary Dependencies**: DSPy 2.6+, Convex 1.31.3, Next.js 15.5.7, litellm (DSPy → Gemini)
**Storage**: Convex (document DB), S3 (DSPy model state JSON files)
**Testing**: Convex test framework, pytest (Lambda), manual UAT via AR Reconciliation UI
**Target Platform**: Web (Next.js) + AWS Lambda (Python Docker)
**Project Type**: Web application with serverless AI backend
**Performance Goals**: Tier 1 classification <100ms (keyword matching), Tier 2 <5s per batch (Gemini API call), CSV import with 5000+ rows without timeout
**Constraints**: Gemini 3.1 Flash-Lite only (no Qwen3 for classification), ARM_64 Lambda, ≤512MB memory
**Scale/Scope**: ~10 businesses initially, 500-5000 rows per import, 5+ platforms

## Constitution Check

*No constitution defined — no gates to check.*

## Project Structure

### Documentation (this feature)

```text
specs/001-dspy-fee-breakdown/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research decisions
├── data-model.md        # Entity definitions
├── quickstart.md        # Development setup guide
├── contracts/           # API contracts
│   ├── fee-classifier-lambda.md
│   └── convex-mutations.md
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (from /speckit.tasks)
```

### Source Code (repository root)

```text
# Python Lambda (NEW)
src/lambda/fee-classifier-python/
├── Dockerfile
├── requirements.txt
├── handler.py              # Lambda entry point
├── fee_module.py           # DSPy ClassifyFee signature + module
├── optimizer.py            # MIPROv2 optimization logic
└── models/
    └── default.json        # Bundled fallback model state

# Convex (MODIFY existing from 001-hybrid-fee-detection branch)
convex/
├── schema.ts               # Add dspy_model_versions, dspy_optimization_logs tables
├── lib/
│   └── feeClassifier.ts    # Tier 1 (reuse as-is)
├── functions/
│   ├── feeClassificationActions.ts   # Replace Qwen3 → DSPy Lambda via MCP
│   ├── feeClassificationRules.ts     # Reuse as-is (add custom platform support)
│   ├── feeClassificationCorrections.ts # Reuse as-is
│   ├── dspyModelVersions.ts          # NEW: model version CRUD + rollback
│   └── dspyOptimization.ts           # NEW: cron + optimization trigger
└── crons.ts                # Add weekly optimization cron

# CDK Infrastructure (NEW stack)
infra/lib/
└── fee-classifier-stack.ts  # Docker Lambda + IAM + S3 permissions

# Frontend (REUSE from 001-hybrid-fee-detection, minor modifications)
src/domains/sales-invoices/
├── components/
│   ├── ar-reconciliation.tsx    # Reuse confidence UI as-is
│   └── fee-rules-manager.tsx    # Add custom platform input
└── hooks/
    └── use-reconciliation.ts    # Reuse as-is
```

**Structure Decision**: This feature spans three layers — Python Lambda (new DSPy service), Convex functions (modify existing Tier 2 invocation), and CDK infrastructure (new stack). The frontend is largely reusable from the prior branch. The Python Lambda follows the existing `document-processor-python` Docker pattern.

## Complexity Tracking

No constitution violations to track.
