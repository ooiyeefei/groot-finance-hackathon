# Data Model: Hybrid Fee Breakdown Detection

**Date**: 2026-03-15
**Branch**: `001-dspy-fee-breakdown`

## Existing Tables (Reuse from 001-hybrid-fee-detection)

### sales_orders (modified fields)

Already has fee classification fields from prior branch:

| Field | Type | Description |
|-------|------|-------------|
| classifiedFees | Array<ClassifiedFee> | Dynamic fee breakdown with per-fee confidence |
| feeClassificationStatus | string | "classified" / "partial" / "unclassified" / "reviewed" |
| balanceValidationStatus | string | "balanced" / "unbalanced" |
| balanceDiscrepancy | number | Difference: gross - net - sum(fees) |

**ClassifiedFee** object:
| Field | Type | Description |
|-------|------|-------------|
| feeName | string | Original fee name from CSV |
| amount | number | Fee amount |
| accountCode | string | Mapped account code (e.g., "5801") |
| accountName | string | Human-readable name (e.g., "Commission Fees") |
| confidence | number | 0.0–1.0 classification confidence |
| tier | number | 1 = rules, 2 = DSPy/AI |
| isNew | boolean | True if fee name never seen before |

### fee_classification_rules (no changes)

| Field | Type | Description |
|-------|------|-------------|
| businessId | Id<"businesses"> | Owner business |
| platform | string | Platform name (e.g., "shopee", "lazada", or custom) |
| keyword | string | Substring to match against fee names |
| accountCode | string | Target account code |
| accountName | string | Human-readable account name |
| priority | number | Higher priority wins on conflict |
| isActive | boolean | Soft delete flag |

Indexes: `by_businessId`, `by_businessId_platform`

### fee_classification_corrections (no changes)

| Field | Type | Description |
|-------|------|-------------|
| businessId | Id<"businesses"> | Owner business |
| originalFeeName | string | Fee name before correction |
| originalAccountCode | string | AI-assigned account code |
| correctedAccountCode | string | User's corrected account code |
| correctedAccountName | string | Human-readable corrected name |
| platform | string | Source platform |
| salesOrderId | Id<"sales_orders"> | Related order |
| correctedBy | string | Clerk user ID |

Indexes: `by_businessId`, `by_businessId_platform`

## New Tables

### dspy_model_versions

Tracks trained DSPy model state files per platform. Enables rollback.

| Field | Type | Description |
|-------|------|-------------|
| platform | string | Platform name (e.g., "shopee") |
| version | number | Auto-incrementing version number |
| s3Key | string | S3 path to JSON state file |
| status | string | "active" / "inactive" / "failed" |
| trainingExamples | number | Corrections used for training |
| accuracy | number | Accuracy on held-out test set (0.0–1.0) |
| previousVersion | number | Version this replaced (for rollback) |
| optimizerType | string | "bootstrap_fewshot" / "miprov2" |
| trainedAt | number | Timestamp of training completion |

Indexes: `by_platform_status`, `by_platform_version`

**State transitions**:
- New model trained → status="active", previous model → status="inactive"
- Optimization fails / worse accuracy → new model status="failed", previous stays "active"
- Manual rollback → swap statuses between active and target version

### dspy_optimization_logs

Audit trail for optimization runs.

| Field | Type | Description |
|-------|------|-------------|
| platform | string | Platform name |
| optimizerType | string | "bootstrap_fewshot" / "miprov2" |
| startedAt | number | Timestamp |
| completedAt | number | Timestamp (null if still running) |
| status | string | "running" / "completed" / "failed" |
| beforeAccuracy | number | Accuracy before optimization |
| afterAccuracy | number | Accuracy after optimization |
| trainingExamples | number | Number of corrections used |
| testSetSize | number | Held-out test set size |
| errorMessage | string | Error details if failed |
| modelVersionId | Id<"dspy_model_versions"> | Created model version (if successful) |

Index: `by_platform`, `by_status`

## Entity Relationships

```
businesses
  ├── fee_classification_rules (1:many, per platform)
  ├── fee_classification_corrections (1:many, training data)
  └── sales_orders (1:many)
        └── classifiedFees[] (embedded array)

dspy_model_versions (global, per platform — not per business)
  └── dspy_optimization_logs (1:many)
```

Key relationship: `fee_classification_corrections` feeds both:
1. **Per-business corrections** → used as few-shot examples at inference time
2. **Pooled per-platform corrections** → used for BootstrapFewShot/MIPROv2 training

## Account Codes (Reference)

| Code | Name | Typical Fees |
|------|------|-------------|
| 5800 | Platform Fees (General) | Catch-all for unclassified platform fees |
| 5801 | Commission Fees | Platform commission, seller commission |
| 5802 | Shipping Fees | Seller shipping, logistics subsidy |
| 5803 | Service Fees | Transaction fees, service charges |
| 5804 | Marketing Fees | Ads, promotions, voucher subsidies |
| 5810 | Payment Processing Fees | Stripe fees, payment gateway charges |
