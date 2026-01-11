# Issue #127: EventBridge Integration for Document Events (A1)

**GitHub URL:** https://github.com/grootdev-ai/finanseal-mvp/issues/127
**Priority:** P1
**WINNING Score:** 48/60
**Status:** Open
**Created:** 2026-01-10

## Summary

Create EventBridge event bus to emit events when documents reach key states, enabling decoupled agentic processing for expense claims and invoices.

## Scope

- [ ] Create EventBridge event bus `finanseal-document-events`
- [ ] Emit event when `expense_claims.status = 'draft'` (extraction complete)
- [ ] Emit event when `expense_claims.status = 'submitted'` (pending approval)
- [ ] Emit event when `invoices.status = 'pending'` (extraction complete)
- [ ] CDK stack updates in `infra/`
- [ ] Event schema definitions

## Event Schema

```typescript
{
  source: "finanseal.documents",
  detailType: "ExpenseClaimExtracted" | "ExpenseClaimSubmitted" | "InvoiceExtracted",
  detail: {
    documentId: string,
    businessId: string,
    userId: string,
    totalAmount: number,
    currency: string,
    vendorName: string,
    category: string,
    transactionDate: string
  }
}
```

## Dependencies

None - this is the foundation for all agentic features.

## Blocks

- A2: Agentic Lambda Skeleton
- A3: Duplicate Detection
- A4: Policy Engine
- A5: Spend Limits
- A6: Anomaly Detection

---
*Source: `.pm/gaps/2026-01-10-agentic-processing-roadmap.md`*
