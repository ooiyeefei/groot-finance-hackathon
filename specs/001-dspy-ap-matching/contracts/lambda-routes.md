# Lambda API Contract: PO Matching Routes

## Route: POST /match_po_invoice

**Purpose**: Tier 2 AI semantic matching for PO ↔ Invoice line items.

### Request

```json
{
  "po_line_items": [
    {
      "index": 0,
      "description": "HP Spectre Laptop 14-inch",
      "item_code": "LAP-001",
      "quantity": 10,
      "unit_price": 4500.00,
      "unit_of_measure": "units"
    }
  ],
  "invoice_line_items": [
    {
      "index": 0,
      "description": "L32900-001 Laptop",
      "item_code": "L32900-001",
      "quantity": 10,
      "unit_price": 4500.00,
      "unit_of_measure": "units"
    }
  ],
  "grn_line_items": [],
  "vendor_name": "DECAMP ENTERPRISE",
  "tier1_pairings": [
    {
      "po_line_index": 0,
      "invoice_line_index": 0,
      "confidence": 0.35,
      "method": "fuzzy_description"
    }
  ],
  "corrections": [],
  "model_s3_key": null
}
```

### Response

```json
{
  "pairings": [
    {
      "po_line_index": 0,
      "invoice_line_index": 0,
      "grn_line_index": null,
      "confidence": 0.88,
      "method": "ai_semantic",
      "reasoning": "L32900-001 is a vendor-specific product code. The description 'Laptop' matches the PO item 'HP Spectre Laptop 14-inch'. Quantities (10) and unit prices (RM4,500) match exactly."
    }
  ],
  "variance_diagnosis": null,
  "overall_confidence": 0.88,
  "model_version": "baseline",
  "used_dspy": true,
  "constraint_violations": []
}
```

### Error Response

```json
{
  "error": "Classification failed",
  "fallback": true
}
```

## Route: POST /diagnose_variance

**Purpose**: AI-powered variance diagnosis for matched line items.

### Request

```json
{
  "po_line": {
    "description": "Office Paper A4",
    "quantity": 100,
    "unit_price": 12.50
  },
  "invoice_line": {
    "description": "Office Paper A4 + delivery",
    "quantity": 100,
    "unit_price": 13.00
  },
  "grn_line": {
    "received_quantity": 100
  },
  "vendor_name": "DECAMP ENTERPRISE",
  "variance_type": "price_higher",
  "variance_amount": 0.50,
  "variance_percentage": 4.0
}
```

### Response

```json
{
  "diagnosis": "The unit price difference is RM0.50 (4.0%). The invoice description includes '+ delivery' which suggests a bundled delivery surcharge not present in the original PO. This likely accounts for the price variance.",
  "suggested_action": "review",
  "confidence": 0.82
}
```

## Route: POST /optimize_po_matching_model

**Purpose**: MIPROv2 optimization for PO matching (called by weekly cron).

### Request

```json
{
  "business_id": "abc123",
  "corrections": [...],
  "current_model_s3_key": "dspy-models/po_matching/v1.json",
  "force": false
}
```

### Response

```json
{
  "success": true,
  "before_accuracy": 0.72,
  "after_accuracy": 0.85,
  "training_examples": 45,
  "test_set_size": 12,
  "new_s3_key": "dspy-models/po_matching/v2.json",
  "new_version": 2
}
```
