# Data Model: Self-Improving Action Center

**Date**: 2026-03-24
**Feature**: 033-ai-action-center-dspy

## Entity Relationship Overview

```
actionCenterInsights (MODIFY)     action_center_corrections (NEW)
┌────────────────────────┐        ┌──────────────────────────────┐
│ + userFeedback: string │───────▶│ insightId                    │
│ (existing fields...)   │        │ insightType                  │
└────────────────────────┘        │ category                     │
                                  │ isUseful: boolean            │
                                  │ feedbackText?: string        │
                                  │ originalContext: object       │
                                  │ businessId                   │
                                  │ userId                       │
                                  │ consumed: boolean            │
                                  │ consumedAt?: number          │
                                  │ consumedByVersion?: string   │
                                  └──────────┬───────────────────┘
                                             │
                                             ▼
                                  dspy_model_versions (REUSE)
                                  ┌──────────────────────────────┐
                                  │ module: "action-center-      │
                                  │         relevance"           │
                                  │ status: candidate/promoted/  │
                                  │         superseded/rejected  │
                                  │ s3Key                        │
                                  │ accuracy                     │
                                  │ qualityGateResult            │
                                  │ businessId (NEW INDEX)       │
                                  └──────────────────────────────┘
```

## Modified Entity: actionCenterInsights

### New field

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userFeedback` | `string` | Optional | Free-text reason when dismissing (e.g., "This is a regular quarterly payment") |

### Existing fields (unchanged)

| Field | Type | Description |
|-------|------|-------------|
| `userId` | `string` | Clerk user ID |
| `businessId` | `string` | Business scope |
| `category` | `union` | anomaly, compliance, deadline, cashflow, optimization, categorization |
| `priority` | `union` | critical, high, medium, low |
| `status` | `union` | new, reviewed, dismissed, actioned |
| `title` | `string` | Insight headline |
| `description` | `string` | Detailed explanation |
| `affectedEntities` | `array<string>` | Vendors, employees, accounts affected |
| `recommendedAction` | `string` | What the system suggests |
| `detectedAt` | `number` | Timestamp of detection |
| `reviewedAt` | `number?` | When marked reviewed |
| `actionedAt` | `number?` | When user took action |
| `dismissedAt` | `number?` | When dismissed |
| `expiresAt` | `number?` | Auto-expiry timestamp |
| `metadata` | `any?` | Algorithm-specific context (insightType, sourceDataDomain, etc.) |

## New Entity: action_center_corrections

### Purpose
Training data for the DSPy relevance classifier. Each record captures a user's feedback signal on a specific insight, denormalized with enough context for the training pipeline to operate without re-querying the original insight.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `insightId` | `id("actionCenterInsights")` | Yes | Reference to the original insight |
| `insightType` | `string` | Yes | Algorithm identifier (e.g., "statistical_anomaly", "employee_expense_spike") |
| `category` | `string` | Yes | Insight category (anomaly, compliance, etc.) |
| `priority` | `string` | Yes | Original priority level |
| `isUseful` | `boolean` | Yes | true = actioned/reviewed, false = dismissed |
| `feedbackText` | `string` | No | User's explanation of why they dismissed/actioned |
| `originalContext` | `object` | Yes | Snapshot: { title, description, affectedEntities, recommendedAction } |
| `businessId` | `id("businesses")` | Yes | Business scope (isolation) |
| `userId` | `string` | Yes | Who provided the feedback |
| `consumed` | `boolean` | Yes (default false) | Marked true after successful model promotion |
| `consumedAt` | `number` | No | Timestamp when marked consumed |
| `consumedByVersion` | `string` | No | versionId of the model that consumed this correction |
| `createdAt` | `number` | Yes | Timestamp of correction creation |

### Indexes

| Index Name | Fields | Purpose |
|------------|--------|---------|
| `by_business` | `[businessId]` | Per-business isolation |
| `by_business_consumed` | `[businessId, consumed]` | Fetch unconsumed corrections for training |
| `by_business_category` | `[businessId, category]` | Readiness gate: count unique categories |
| `by_insightType` | `[insightType]` | Analytics: corrections per algorithm |
| `by_createdAt` | `[createdAt]` | 6-month rolling window filter |

### State transitions

Corrections are immutable once created. The only mutable fields are:
- `consumed`: false → true (when model using this correction is promoted)
- `consumedAt`: null → timestamp
- `consumedByVersion`: null → versionId

## Reused Entity: dspy_model_versions

### New usage pattern

| Field | Value for Action Center |
|-------|------------------------|
| `module` | `"action-center-relevance"` |
| `platform` | `"action_center"` (legacy compat) |
| `businessId` | Required — per-business models |

### New index needed

| Index Name | Fields | Purpose |
|------------|--------|---------|
| `by_module_business_status` | `[module, businessId, status]` | Load active model for a specific business |

**Note**: Existing `by_module_status` index works for global models but not per-business. The new index adds `businessId` for efficient lookup.

## Reused Entity: dspy_optimization_logs

No changes needed. Existing fields accommodate Action Center logging:
- `platform`: `"action_center"`
- `optimizerType`: `"bootstrapfewshot"`
- Standard audit fields (status, accuracy, duration, etc.)
