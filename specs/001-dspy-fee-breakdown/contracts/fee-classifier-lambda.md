# API Contract: Fee Classifier Lambda

**Service**: `finanseal-fee-classifier` (Python Docker Lambda)
**Invocation**: Via MCP API Gateway HTTP endpoint or direct Lambda invoke
**Auth**: Internal service key (`X-Internal-Key` header)

## Endpoint: Classify Fees

**Method**: POST
**Path**: `/mcp` (reuses existing MCP API Gateway)
**Tool Name**: `classify_fees`

### Request

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "classify_fees",
    "_businessId": "business_123",
    "arguments": {
      "platform": "shopee",
      "fees": [
        { "feeName": "Seller Subsidy Type B", "amount": 15.50 },
        { "feeName": "Platform Service Charge", "amount": 8.20 }
      ],
      "grossAmount": 100.00,
      "netAmount": 76.30,
      "businessCorrections": [
        {
          "feeName": "Seller Subsidy Type A",
          "correctedAccountCode": "5804",
          "platform": "shopee"
        }
      ]
    }
  }
}
```

### Response (Success)

```json
{
  "jsonrpc": "2.0",
  "result": {
    "classifications": [
      {
        "feeName": "Seller Subsidy Type B",
        "accountCode": "5804",
        "accountName": "Marketing Fees",
        "confidence": 0.85,
        "isNew": false,
        "reasoning": "Similar to corrected 'Seller Subsidy Type A' → Marketing Fees"
      },
      {
        "feeName": "Platform Service Charge",
        "accountCode": "5803",
        "accountName": "Service Fees",
        "confidence": 0.72,
        "isNew": true,
        "reasoning": "Service-related fee name, mapped to Service Fees"
      }
    ],
    "balanceCheck": {
      "balanced": true,
      "totalFees": 23.70,
      "expectedFees": 23.70,
      "discrepancy": 0.00
    },
    "modelVersion": "shopee_v3",
    "usedDspy": true
  }
}
```

### Response (Fallback — DSPy unavailable or <20 corrections)

Same structure but:
- `"usedDspy": false`
- `"modelVersion": "fallback_gemini"`
- Confidence capped at 0.80

### Error Response

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Classification failed",
    "data": { "reason": "Gemini API timeout" }
  }
}
```

---

## Endpoint: Train Model (MIPROv2 Optimization)

**Tool Name**: `optimize_model`

### Request

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "optimize_model",
    "arguments": {
      "platform": "shopee",
      "corrections": [
        {
          "feeName": "Commission Fee",
          "accountCode": "5801",
          "platform": "shopee"
        }
      ],
      "currentModelS3Key": "dspy-models/shopee/v2.json",
      "optimizerType": "miprov2"
    }
  }
}
```

### Response

```json
{
  "jsonrpc": "2.0",
  "result": {
    "success": true,
    "newModelS3Key": "dspy-models/shopee/v3.json",
    "beforeAccuracy": 0.78,
    "afterAccuracy": 0.89,
    "trainingExamples": 150,
    "testSetSize": 30,
    "optimizerType": "miprov2",
    "durationMs": 45000
  }
}
```
