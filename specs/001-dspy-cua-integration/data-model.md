# Data Model: DSPy CUA Integration

## Existing Entities (no schema changes needed)

### einvoice_request_logs (Convex)
Already has all required fields for training data collection:

| Field | Type | Purpose |
|-------|------|---------|
| `reconDescription` | string? | Gemini Flash form analysis text — FR-009 |
| `generatedHint` | string? | Troubleshooter-generated cuaHint — FR-010 |
| `hintEffectivenessOutcome` | "helped" \| "not_helped" \| "pending"? | Resolved by comparing next attempt — FR-011 |
| `failureCategory` | "connectivity" \| "form_validation" \| "session" \| "captcha" \| "unknown"? | Classified by troubleshooter — FR-010 |
| `confidenceGateScore` | number? | Tier 1 confidence prediction — logging |
| `dspyModuleVersion` | string? | "baseline" or timestamp — FR-008 |

### merchant_einvoice (Convex)
Existing formConfig structure — no changes needed.

### S3 Module State (`finanseal-bucket/dspy-modules/`)

```
dspy-modules/
├── troubleshooter/
│   ├── latest.json          # Current optimized state
│   └── 2026-03-15T10:00:00.json  # Versioned snapshots
└── recon/
    ├── latest.json
    └── 2026-03-15T10:00:00.json
```

Each `latest.json`:
```json
{
  "version": "2026-03-15T10:00:00",
  "optimized_at": "2026-03-15T10:00:00",
  "baseline_score": 0.45,
  "dspy_state": { ... }  // DSPy serialized module state
}
```

## New Convex Query Contract

### `getEinvoiceRawTrainingData`

Returns raw log entries with resolved hint effectiveness for DSPy training.

**Input**: `{ minAttempts?: number }`

**Output**:
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
