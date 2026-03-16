# API Contracts: DSPy Smart Matcher

## Lambda Endpoint: `/match_orders`

**Route**: MCP tool call via JSON-RPC 2.0 → `tools/call` with `name: "match_orders"`
**Handler**: `src/lambda/fee-classifier-python/handler.py`

### Request

```json
{
  "order": {
    "orderReference": "ORD-042",
    "customerName": "Fei",
    "grossAmount": 1000.00,
    "netAmount": 950.00,
    "orderDate": "2026-03-15",
    "currency": "MYR",
    "productName": "Widget A",
    "lineItems": [
      {"productName": "Widget A", "quantity": 10, "unitPrice": 100.00, "total": 1000.00}
    ]
  },
  "candidateInvoices": [
    {
      "invoiceId": "conv_abc123",
      "invoiceNumber": "INV-112",
      "customerName": "Groot Tech Sdn Bhd",
      "totalAmount": 998.50,
      "invoiceDate": "2026-03-10",
      "lineItems": [
        {"description": "Widget A", "quantity": 10, "unitPrice": 99.85, "amount": 998.50}
      ]
    }
  ],
  "corrections": [
    {
      "orderCustomerName": "Fei",
      "orderAmount": 500.00,
      "correctedInvoiceCustomerName": "Groot Tech Sdn Bhd",
      "correctedInvoiceAmount": 497.50,
      "correctionType": "missed_match"
    }
  ],
  "modelS3Key": "dspy-models/ar_match_biz123/v2.json",
  "maxSplitInvoices": 5,
  "amountTolerancePercent": 1.5,
  "amountToleranceAbsolute": 5.00
}
```

### Response

```json
{
  "matches": [
    {
      "invoiceId": "conv_abc123",
      "invoiceNumber": "INV-112",
      "allocatedAmount": 998.50,
      "matchType": "single"
    }
  ],
  "totalAllocated": 998.50,
  "variance": 1.50,
  "confidence": 0.88,
  "reasoning": "Matching order ORD-042 to INV-112: amounts align within 0.15% (RM 1.50 likely bank fee). Customer 'Fei' identified as contact for 'Groot Tech Sdn Bhd' based on 3 prior corrections.",
  "constraintResults": {
    "amountBalance": "passed",
    "customerNameMatch": "soft_warning",
    "invoiceExists": "passed"
  },
  "usedDspy": true,
  "modelVersion": "dspy-models/ar_match_biz123/v2.json",
  "correctionCount": 25
}
```

## Lambda Endpoint: `/optimize_ar_match_model`

**Route**: MCP tool call → `tools/call` with `name: "optimize_ar_match_model"`

### Request

```json
{
  "businessId": "biz123",
  "corrections": [
    {
      "orderCustomerName": "Fei",
      "orderAmount": 1000.00,
      "orderDate": "2026-03-15",
      "correctedInvoiceCustomerName": "Groot Tech Sdn Bhd",
      "correctedInvoiceAmount": 998.50,
      "correctionType": "missed_match"
    }
  ],
  "currentModelS3Key": "dspy-models/ar_match_biz123/v1.json"
}
```

### Response

```json
{
  "success": true,
  "newModelS3Key": "dspy-models/ar_match_biz123/v2.json",
  "beforeAccuracy": 0.72,
  "afterAccuracy": 0.85,
  "trainingExamples": 80,
  "testSetSize": 20,
  "improved": true
}
```

## Convex Mutations

### `orderMatchingCorrections.create`

**Type**: mutation (user-facing — called from UI when user corrects a match)

**Input**: `{ businessId, salesOrderId, originalSuggestedInvoiceId?, originalConfidence?, originalReasoning?, correctedInvoiceId, correctionType }`

**Behavior**: Creates correction record, populating order/invoice context fields from referenced documents. Deduplicates by `(businessId, orderReference)` — latest correction overwrites.

### `salesOrders.approveAiMatches`

**Type**: mutation (user-facing — called from bulk approve UI)

**Input**: `{ salesOrderIds: string[], businessId: string }`

**Behavior**: For each order, takes the top AI suggestion and populates `matchedInvoiceId`, `matchConfidence`, `matchMethod: "ai_suggested"`, `matchStatus`. Updates `aiMatchStatus` to "approved".

### `salesOrders.rejectAiMatch`

**Type**: mutation (user-facing)

**Input**: `{ salesOrderId: string, businessId: string }`

**Behavior**: Sets `aiMatchStatus` to "rejected", clears AI suggestions. Order remains unmatched for manual linking.

### `orderMatchingOptimization.weeklyOptimization`

**Type**: internalAction (cron-triggered)

**Behavior**: For each business with ≥100 corrections and ≥15 unique customer names and new corrections since last optimization: exports corrections, calls `/optimize_ar_match_model` Lambda, records result in `dspy_model_versions` with accuracy gating.
