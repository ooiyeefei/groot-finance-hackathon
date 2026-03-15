# API Contract: Convex Functions (Fee Classification)

## Existing Functions (from 001-hybrid-fee-detection branch)

### feeClassificationActions.classifyUnknownFees
**Type**: `internalAction`
**Change**: Replace Qwen3-8B call with DSPy Lambda invocation via MCP client

**Input**:
```typescript
{
  businessId: Id<"businesses">,
  importBatchId: string
}
```

**Behavior**:
1. Query unclassified fees (confidence 0.0) from sales_orders in batch
2. Fetch business-specific corrections for the platform
3. Check correction count: ≥20 → DSPy Lambda, <20 → Gemini fallback
4. Call `classify_fees` MCP tool with fee names + corrections
5. Update sales_orders with classifications
6. If Lambda unavailable → Gemini fallback with confidence cap 0.80

### feeClassificationRules (no changes)
- `list()` — query by businessId + platform
- `create()` — add keyword rule
- `update()` — modify rule
- `remove()` — soft delete
- `seedDefaults()` — populate 21 default rules

### feeClassificationCorrections.recordCorrection (no changes)
- Stores correction with businessId, platform, fee name, account codes
- Updates sales_order classifiedFees array inline

## New Functions

### dspyModelVersions.getActiveModel
**Type**: `internalQuery`

**Input**:
```typescript
{ platform: string }
```

**Output**:
```typescript
{
  version: number,
  s3Key: string,
  accuracy: number,
  trainingExamples: number,
  trainedAt: number
} | null
```

### dspyModelVersions.recordTrainingResult
**Type**: `internalMutation`

**Input**:
```typescript
{
  platform: string,
  version: number,
  s3Key: string,
  accuracy: number,
  trainingExamples: number,
  optimizerType: "bootstrap_fewshot" | "miprov2",
  previousVersion: number | null
}
```

**Behavior**:
1. If accuracy > previous version's accuracy → set new as "active", old as "inactive"
2. If accuracy ≤ previous → set new as "failed", old stays "active"
3. Create optimization log entry

### dspyModelVersions.rollback
**Type**: `internalMutation`

**Input**:
```typescript
{
  platform: string,
  targetVersion: number
}
```

**Behavior**: Swap active status between current active and target version.

### dspyOptimization.triggerOptimization
**Type**: `internalAction` (called by cron)

**Input**:
```typescript
{ platform: string }
```

**Behavior**:
1. Check correction count ≥100 for platform
2. Fetch all corrections for platform (pooled across businesses)
3. Get current active model version
4. Call `optimize_model` MCP tool
5. Record result via `recordTrainingResult`
6. Log to `dspy_optimization_logs`

### Cron: Weekly optimization
**Schedule**: Every Sunday at 02:00 UTC
**Action**: For each platform with ≥100 corrections, trigger `dspyOptimization.triggerOptimization`
