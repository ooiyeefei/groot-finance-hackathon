# Convex Query Contracts

## getEinvoiceRawTrainingData

**Type**: `query` (public, read-only)
**File**: `convex/functions/system.ts`

### Purpose
Returns raw training data from `einvoice_request_logs` for DSPy optimization pipeline.
Resolves hint effectiveness by pairing consecutive attempts for the same merchant.

### Arguments
```typescript
{
  minAttempts: v.optional(v.number())  // Filter merchants with fewer attempts (default: 1)
}
```

### Returns
```typescript
{
  hintPairs: Array<{
    merchantName: string
    errorMessage: string
    screenshotDescription: string
    previousHints: string
    tierReached: string
    generatedHint: string
    nextAttemptSucceeded: boolean
  }>
  reconPairs: Array<{
    merchantName: string
    reconDescription: string
    buyerDetails: string
    succeeded: boolean
    cuaTurns: number
  }>
}
```

### Logic
1. Query all `einvoice_request_logs` with `generatedHint` field populated
2. For each log with a hint, find the next log for the same merchant (by `_creationTime`)
3. Set `nextAttemptSucceeded = true` if the next attempt's status is "completed"
4. For recon pairs: query logs with `reconDescription` populated and `status = "completed"`
