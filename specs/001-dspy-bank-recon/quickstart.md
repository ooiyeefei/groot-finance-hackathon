# Quickstart: DSPy-Powered Bank Reconciliation

## Prerequisites

1. Convex dev environment running (`npx convex dev`)
2. Gemini API key in `.env.local` (`GEMINI_API_KEY`)
3. AWS credentials with access to `finanseal-bucket` S3
4. Existing bank reconciliation feature deployed (CSV import, matching, dashboard)
5. Chart of Accounts populated for the test business

## Development Setup

```bash
# 1. Checkout feature branch
git checkout 001-dspy-bank-recon

# 2. Deploy Convex schema changes (new tables + extended fields)
npx convex dev --once

# 3. Verify Lambda (renamed groot-finance-ai-classifier)
cd infra && npx cdk deploy FeeClassifierStack --profile groot-finanseal --region us-west-2

# 4. Run Next.js dev server
npm run dev
```

## Testing Flow

### Test 1: Bank Account GL Linkage
1. Go to Accounting → Bank Recon → Manage Accounts
2. Edit existing bank account → select a COA entry (e.g., "1010 Cash at Bank")
3. Verify the GL account appears on the bank account card

### Test 2: Tier 1 Classification
1. Import `tests/data/bank-statements/maybank-march-2026.csv`
2. Transactions with known patterns (SERVICE CHARGE, INTEREST CREDIT) should auto-classify with green badges
3. Verify suggested debit/credit accounts match expected COA entries

### Test 3: Tier 2 AI Classification
1. Look for transactions that Tier 1 couldn't classify (amber/red badges)
2. Verify AI reasoning is displayed ("Chain-of-thought: ...")
3. Verify suggested accounts are valid COA entries

### Test 4: GL Posting
1. Click "Confirm" on a classified transaction
2. Verify draft JE appears in Journal Entries tab with `sourceType: "bank_reconciliation"`
3. Verify debit + credit lines balance

### Test 5: Correction Loop
1. Override an AI suggestion (change debit account)
2. Verify correction stored in `bank_recon_corrections` table
3. Re-run classification → verify AI uses the correction as context

### Test 6: Batch Operations
1. Import a large CSV (50+ rows)
2. Click "Confirm All High-Confidence"
3. Click "Post All to GL"
4. Verify batch creates draft JEs correctly

### Test 7: MIPROv2 Optimization (manual trigger)
1. Accumulate 20+ corrections with 10+ unique descriptions
2. Trigger optimization with `force: true`
3. Verify before/after accuracy comparison
4. Verify new model saved to S3

## Key Files

| Purpose | File |
|---------|------|
| Tier 1 classifier | `convex/lib/bankReconClassifier.ts` |
| GL posting logic | `convex/lib/bankReconGLPoster.ts` |
| Classification action | `convex/functions/bankTransactions.ts` → classifyBatch |
| Corrections | `convex/functions/bankReconCorrections.ts` |
| Optimization cron | `convex/functions/bankReconOptimization.ts` |
| DSPy module | `src/lambda/fee-classifier-python/bank_recon_module.py` |
| Lambda handler | `src/lambda/fee-classifier-python/handler.py` |
| Main UI | `src/domains/accounting/components/bank-recon/bank-recon-tab.tsx` |
| Classification panel | `src/domains/accounting/components/bank-recon/gl-classification-panel.tsx` |
| Batch actions | `src/domains/accounting/components/bank-recon/batch-actions-bar.tsx` |
