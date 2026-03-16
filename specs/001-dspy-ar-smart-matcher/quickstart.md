# Quickstart: DSPy Smart Matcher for AR Reconciliation

## Prerequisites

- Node.js 20.x, Python 3.11
- Convex CLI (`npx convex`)
- AWS CLI with `groot-finanseal` profile
- Access to `finanseal-bucket` S3 bucket

## Development Setup

### 1. Start Convex dev server
```bash
npx convex dev
```

### 2. Run Next.js frontend
```bash
npm run dev
```

### 3. Test the Lambda locally (optional)
```bash
cd src/lambda/fee-classifier-python
pip install -r requirements.txt
python -c "from handler import handler; print('Lambda loads OK')"
```

## Key Files to Modify

| File | Change |
|------|--------|
| `convex/schema.ts` | Add `order_matching_corrections` table |
| `convex/functions/salesOrders.ts` | Add Tier 2 trigger after `runMatching()` |
| `convex/functions/orderMatchingCorrections.ts` | New: correction CRUD |
| `convex/functions/orderMatchingOptimization.ts` | New: weekly optimization pipeline |
| `src/lambda/fee-classifier-python/handler.py` | Add `/match_orders` + `/optimize_ar_match_model` endpoints |
| `src/lambda/fee-classifier-python/ar_match_module.py` | New: DSPy OrderInvoiceMatcher module |
| `src/domains/sales-invoices/components/ar-reconciliation.tsx` | Add AI suggestion display + bulk approve |
| `src/domains/sales-invoices/hooks/use-reconciliation.ts` | Add correction + approve mutation refs |

## Verification

1. **Schema**: `npx convex deploy --yes` after schema changes
2. **Build**: `npm run build` must pass
3. **Lambda**: Deploy via `cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2`
4. **UAT**: Import a test CSV with known fuzzy-match scenarios, verify AI suggestions appear with reasoning
