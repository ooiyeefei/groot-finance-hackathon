# Two-Phase Extraction Pattern

Both invoices and expense claims use two-phase extraction for optimal UX.

## Overview

This pattern provides faster perceived performance by splitting document extraction into two sequential phases with real-time Convex updates between them.

```
Phase 1 (~3-4s): Core fields extraction
    ↓ Convex update → Frontend renders immediately
Phase 2 (~3-4s): Line items extraction
    ↓ Convex real-time update → Frontend updates via subscription
```

## Why Two-Phase?

| Benefit | Description |
|---------|-------------|
| **Faster perceived performance** | Users see results in ~3-4s instead of ~7s |
| **Progressive UI rendering** | Core data displays first, line items load via skeleton UI |
| **No data quality sacrifice** | Both phases use the same Gemini model |

## State Machine: `lineItemsStatus`

```
pending → extracting → complete
                     ↓
                  skipped (on Phase 2 failure)
```

## Key Implementation Files

### Lambda (Python)

| File | Purpose |
|------|---------|
| `src/lambda/document-processor-python/handler.py` | Workflow orchestration |
| `steps/extract_invoice.py` | `extract_invoice_phase1_step()` and `extract_invoice_phase2_step()` |
| `steps/extract_receipt.py` | `extract_receipt_phase1_step()` and `extract_receipt_phase2_step()` |
| `utils/convex_client.py` | `update_invoice_line_items()` and `update_expense_claim_line_items()` |

### Convex (TypeScript)

| File | Purpose |
|------|---------|
| `convex/functions/invoices.ts` | `internalUpdateInvoiceLineItems` mutation |
| `convex/functions/expenseClaims.ts` | `internalUpdateExpenseClaimLineItems` mutation |

## Real-Time Updates

The frontend subscribes to document queries. When Lambda updates `lineItemsStatus` or `lineItems`, Convex pushes changes to connected clients instantly.

**UI Behaviors:**
- Skeleton loading states during `extracting`
- Instant line items population on `complete`
- Graceful degradation on `skipped`

## Note

The legacy `fastMode` parameter has been deprecated. Two-phase extraction achieves the same speed benefit without sacrificing data quality.

## Related Documentation

- [AWS Lambda Processing](./aws-lambda.md)
- [Architecture Overview](./overview.md)
