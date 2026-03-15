# Quickstart: Hybrid Fee Breakdown Detection

## Prerequisites

- Python 3.11+ (for DSPy Lambda development)
- Docker (for Lambda container build)
- AWS CDK CLI (`npx cdk`)
- `GEMINI_API_KEY` in SSM or `.env.local`
- Convex dev server running (`npx convex dev`)

## Local Development

### 1. DSPy Lambda (Python)

```bash
cd src/lambda/fee-classifier-python/

# Create virtual environment
python -m venv .venv && source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run locally
python -c "
import dspy
lm = dspy.LM('gemini/gemini-3.1-flash-lite-preview', api_key='YOUR_KEY')
dspy.configure(lm=lm)
from handler import classify_fees
result = classify_fees({
    'platform': 'shopee',
    'fees': [{'feeName': 'Commission Fee', 'amount': 10.0}],
    'grossAmount': 100.0,
    'netAmount': 90.0,
    'businessCorrections': []
})
print(result)
"
```

### 2. Convex Functions

```bash
# Start dev server
npx convex dev

# Test fee classification flow
# 1. Import a CSV via AR Reconciliation UI
# 2. Check sales_orders for classifiedFees
# 3. Correct a fee via inline dropdown
# 4. Re-import to verify correction is used
```

### 3. Deploy

```bash
# Deploy DSPy Lambda
cd infra && npx cdk deploy FeeClassifierStack --profile groot-finanseal --region us-west-2

# Deploy Convex
npx convex deploy --yes

# Verify
curl -X POST https://<api-gw-url>/mcp \
  -H "X-Internal-Key: $MCP_INTERNAL_SERVICE_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"classify_fees","arguments":{"platform":"shopee","fees":[{"feeName":"Test Fee","amount":5.0}],"grossAmount":100,"netAmount":95,"businessCorrections":[]}}}'
```

## Architecture Overview

```
CSV Import → Tier 1 (keyword rules, instant)
                ↓ unmatched fees
           Tier 2 (DSPy Lambda via MCP)
                ↓ fallback if unavailable
           Gemini direct prompting
                ↓
           AR Reconciliation Review (confidence UI)
                ↓ user corrections
           Training data → weekly MIPROv2 optimization
```

## Key Files

| Component | Path |
|-----------|------|
| Tier 1 rules engine | `convex/lib/feeClassifier.ts` |
| Tier 2 DSPy invocation | `convex/functions/feeClassificationActions.ts` |
| DSPy Lambda handler | `src/lambda/fee-classifier-python/handler.py` |
| DSPy module definition | `src/lambda/fee-classifier-python/fee_module.py` |
| CDK stack | `infra/lib/fee-classifier-stack.ts` |
| Model versions table | `convex/functions/dspyModelVersions.ts` |
| Optimization cron | `convex/functions/dspyOptimization.ts` |
| AR Reconciliation UI | `src/domains/sales-invoices/components/ar-reconciliation.tsx` |
| Fee Rules Manager | `src/domains/sales-invoices/components/fee-rules-manager.tsx` |
