# API Contracts: Self-Improving Action Center

**Date**: 2026-03-24
**Feature**: 033-ai-action-center-dspy

All contracts are Convex mutations/queries/actions (not REST endpoints).

## Modified: actionCenterInsights.updateStatus

**Type**: Mutation (public, authenticated)

### Args (modified)
```
insightId: Id<"actionCenterInsights">   // existing
status: "reviewed" | "dismissed" | "actioned"  // existing
feedbackText?: string                   // NEW — optional user explanation
```

### Behavior change
- When `status = "dismissed"`: Creates correction with `isUseful: false` + feedbackText
- When `status = "actioned"` or `status = "reviewed"`: Creates correction with `isUseful: true`
- Stores feedbackText on the insight record as `userFeedback` field
- Returns `{ success: true }`

## New: actionCenterCorrections.checkReadiness

**Type**: Query (internal)

### Args
```
businessId: Id<"businesses">
```

### Returns
```
{
  readyAlgorithms: string[]           // algorithms with enough corrections
  stats: {
    [algorithmOrCategory: string]: {
      totalCorrections: number
      unconsumedCorrections: number
      uniqueContexts: number          // unique insightType + category combos
      readyToOptimize: boolean        // >= 20 corrections AND >= 10 unique contexts
    }
  }
}
```

### Behavior
- Queries `action_center_corrections` for the given business
- Filters to last 6 months (rolling window)
- Groups by category, counts corrections and unique contexts
- Returns readiness status per category

## New: actionCenterCorrections.getTrainingData

**Type**: Query (internal)

### Args
```
businessId: Id<"businesses">
trainSplitRatio: number               // default 0.8
```

### Returns
```
{
  train: Correction[]
  validation: Correction[]
  totalCorrections: number
  categorySplit: { [category: string]: { train: number, validation: number } }
}
```

### Behavior
- Fetches unconsumed corrections for business (last 6 months)
- Stratified split by category (80/20)
- Returns train + validation sets

## New: actionCenterOptimization.prepareAndRun

**Type**: Action (internal)

### Args
```
businessId: Id<"businesses">
```

### Behavior
1. Calls `checkReadiness` — skip if not ready
2. Calls `getTrainingData` — get train/validation split
3. Invokes `finanseal-dspy-optimizer` Lambda with training data
4. On success: creates model version, runs quality gate
5. On quality gate pass: promotes model, marks corrections consumed
6. Logs optimization run to `dspy_optimization_logs`

### Returns
```
{
  status: "skipped" | "trained" | "promoted" | "rejected" | "failed"
  accuracy?: number
  previousAccuracy?: number
  correctionsProcessed?: number
  errorMessage?: string
}
```

## New: actionCenterOptimization.getActiveModel

**Type**: Query (internal)

### Args
```
businessId: Id<"businesses">
module: string                        // "action-center-relevance"
```

### Returns
```
{
  hasModel: boolean
  version?: {
    versionId: string
    s3Key: string
    accuracy: number
    promotedAt: number
  }
} | null
```

## Modified: actionCenterJobs (insight generation pipeline)

### Behavior change
After each detection algorithm generates candidate insights, before inserting:
1. Load active model for `module: "action-center-relevance"` + businessId
2. If model exists: classify each candidate as relevant/noise
3. Only insert candidates classified as relevant (or all if no model)
4. Log suppressed candidates count for observability
