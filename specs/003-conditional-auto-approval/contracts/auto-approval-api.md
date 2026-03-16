# API Contracts: Conditional Auto-Approval

## Convex Mutations

### `matchingSettings.getOrCreate`
**Type**: query (user-facing)
**Input**: `{ businessId }`
**Returns**: Settings object with defaults if none exist

### `matchingSettings.update`
**Type**: mutation (user-facing)
**Input**: `{ businessId, enableAutoApprove?, autoApproveThreshold?, minLearningCycles? }`
**Behavior**: Updates settings. If re-enabling after safety valve, clears `autoApproveDisabledReason`.

### `salesOrders.reverseAutoMatch`
**Type**: mutation (user-facing)
**Input**: `{ salesOrderId, businessId }`
**Behavior**:
1. Validates order was auto-approved (matchMethod = "auto_agent")
2. Creates reversal journal entry (opposite debits/credits)
3. Sets matchStatus = "unmatched", aiMatchStatus = "reversed"
4. Creates CRITICAL_FAILURE correction (weight: 5)
5. Checks safety valve (3+ critical failures in 30 days → auto-disable)

### `salesOrders.getLearningCyclesForAlias`
**Type**: internalQuery
**Input**: `{ businessId, customerName }`
**Returns**: `{ cycles: number, approvedMatches: number, corrections: number, normalizedAlias: string }`
**Behavior**: Counts approved AI matches + corrections for the normalized alias.

### `salesOrders.evaluateTripleLock`
**Type**: internalQuery
**Input**: `{ businessId, confidence, customerName }`
**Returns**: `{ pass: boolean, lock1: { pass, reason }, lock2: { pass, score, threshold }, lock3: { pass, cycles, required } }`
