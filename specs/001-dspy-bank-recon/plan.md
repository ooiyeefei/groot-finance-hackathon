# Implementation Plan: DSPy-Powered Bank Reconciliation with GL Integration

**Branch**: `001-dspy-bank-recon` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-dspy-bank-recon/spec.md`

## Summary

Extend the bank reconciliation feature with DSPy-powered GL account classification, journal entry posting, and a self-improving correction loop. The system uses a tiered architecture: Tier 1 (rule-based keyword matching, free) handles common patterns, Tier 2 (DSPy + Gemini 3.1 Flash-Lite) handles the long tail. User corrections feed into BootstrapFewShot and weekly MIPROv2 optimization. Unmatched bank transactions get AI-suggested GL accounts and auto-created draft journal entries. Batch operations allow confirming and posting hundreds of transactions at once.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (Next.js + Convex), Python 3.11 (Lambda)
**Primary Dependencies**: Convex 1.31.3, DSPy 3.1+, Gemini 3.1 Flash-Lite, AWS Lambda, boto3
**Storage**: Convex (corrections, model versions, bank transactions), S3 (optimized DSPy models)
**Testing**: `npm run build` (TypeScript), manual UAT (Playwright browser automation)
**Target Platform**: Web (Next.js 15.5.7), AWS Lambda (Python Docker)
**Project Type**: Web application (Convex backend + Next.js frontend + Lambda AI service)
**Performance Goals**: Tier 1 classification <100ms, Tier 2 AI <3s per transaction, batch confirm <5s for 100+ items
**Constraints**: Draft JEs only (user posts manually), per-business model isolation, minimum 10 unique patterns for MIPROv2
**Scale/Scope**: 200-500 transactions per monthly import, 20+ businesses

## Constitution Check

*GATE: Using CLAUDE.md Product & Engineering Principles as constitution.*

| Principle | Status | Notes |
|-----------|--------|-------|
| Self-Improving AI Over Static Rules | ✅ PASS | BootstrapFewShot + MIPROv2 optimization loop |
| Tiered Intelligence Architecture | ✅ PASS | Tier 1 rules → Tier 2 DSPy, same pattern as fee classification |
| IFRS / Global Accounting Standards | ✅ PASS | Double-entry JEs, Assert validation, proper COA linkage |
| Build the Moat | ✅ PASS | Every correction improves the system; scales across banks |
| Domain-Driven Design | ✅ PASS | Bank recon stays in `src/domains/accounting/`, Lambda extends existing `groot-finance-ai-classifier` |
| Least Privilege | ✅ PASS | IAM-based Lambda invocation, internal service key for Convex→Lambda |
| AWS-First for AWS Operations | ✅ PASS | Classification runs in Lambda (IAM-native S3 access), not Convex actions |

## Project Structure

### Documentation (this feature)

```text
specs/001-dspy-bank-recon/
├── plan.md              # This file
├── research.md          # Phase 0: technology decisions
├── data-model.md        # Phase 1: schema changes
├── quickstart.md        # Phase 1: developer setup guide
├── contracts/           # Phase 1: Convex function signatures
│   └── convex-functions.md
├── checklists/
│   └── requirements.md  # Quality checklist
└── tasks.md             # Phase 2: implementation tasks
```

### Source Code (repository root)

```text
# Convex Backend
convex/
├── schema.ts                              # Extended: bank_accounts (+glAccountId), bank_transactions (+classification fields), new bank_recon_corrections table
├── functions/
│   ├── bankAccounts.ts                    # Extended: GL linkage CRUD
│   ├── bankTransactions.ts                # Extended: classification fields, replace categorize with classify
│   ├── reconciliationMatches.ts           # Extended: batch confirm, GL posting trigger
│   ├── bankReconCorrections.ts            # NEW: correction CRUD + training data export
│   └── bankReconOptimization.ts           # NEW: cron trigger, model version tracking
├── lib/
│   ├── bankReconClassifier.ts             # NEW: Tier 1 rule-based keyword classifier
│   └── bankReconGLPoster.ts               # NEW: draft JE creation logic
└── crons.ts                               # Extended: weekly MIPROv2 optimization trigger

# Lambda (extends existing fee-classifier → renamed groot-finance-ai-classifier)
src/lambda/fee-classifier-python/          # RENAMED to groot-finance-ai-classifier
├── handler.py                             # Extended: /classify_bank_transaction, /optimize_bank_recon_model
├── fee_module.py                          # Existing: fee classification DSPy module
├── bank_recon_module.py                   # NEW: ClassifyBankTransaction DSPy module
├── optimizer.py                           # Extended: bank recon MIPROv2 optimization
├── Dockerfile                             # Updated if needed
└── requirements.txt                       # Unchanged (dspy, boto3 already present)

# Frontend
src/domains/accounting/components/bank-recon/
├── bank-recon-tab.tsx                     # MODIFIED: remove old categorize, add AI classification UI
├── reconciliation-dashboard.tsx           # MODIFIED: confidence badges, batch actions, GL posting buttons
├── transaction-row.tsx                    # MODIFIED: AI suggestion display, confidence badges, correction capture
├── match-candidates-sheet.tsx             # MODIFIED: minor updates for new flow
├── bank-accounts-manager.tsx              # MODIFIED: add GL account linkage field
├── bank-import-button.tsx                 # UNCHANGED
├── gl-classification-panel.tsx            # NEW: AI-suggested accounts with override, reasoning display
├── batch-actions-bar.tsx                  # NEW: "Confirm All High", "Post All to GL" buttons
└── reconciliation-summary.tsx             # NEW: bank vs GL balance statement

# CDK Infrastructure
infra/lib/
└── fee-classifier-stack.ts                # RENAMED references to groot-finance-ai-classifier
```

**Structure Decision**: Follows existing Groot architecture — Convex for real-time data + business logic, Lambda for AI classification, Next.js for frontend. Extends existing patterns (fee classification) rather than creating new infrastructure.

## Complexity Tracking

No constitution violations — all design choices follow established patterns.
