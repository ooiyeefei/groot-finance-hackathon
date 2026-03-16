# Quickstart: Self-Improving AI AP 3-Way Matching

## Prerequisites

- Node.js 20.x, Python 3.11, Docker
- AWS CLI configured with `groot-finanseal` profile
- Convex CLI (`npx convex`)
- Gemini API key in `.env.local` as `GEMINI_API_KEY`

## Development Setup

### 1. Convex Schema & Functions

```bash
# Deploy schema changes (new po_match_corrections table + po_matches extensions)
npx convex dev
# After verification:
npx convex deploy --yes
```

### 2. Python Lambda (local testing)

```bash
cd src/lambda/fee-classifier-python
pip install -r requirements.txt
# Test the new route
python -c "from po_matching_module import POMatchingModule; print('Module loaded OK')"
```

### 3. CDK Deploy (after Lambda code ready)

```bash
cd infra
npx cdk deploy --profile groot-finanseal --region us-west-2
```

### 4. Verify End-to-End

1. Create a PO with vendor-specific item codes
2. Create a GRN for partial receipt
3. Upload an invoice with different descriptions for the same items
4. Verify Tier 1 produces low confidence → Tier 2 AI triggers
5. Check match record has `aiMatchTier: 2` and reasoning trace
6. Approve/reject to generate corrections
7. After 20+ corrections, verify BootstrapFewShot improves accuracy

## Key Files

| File | Purpose |
|------|---------|
| `src/lambda/fee-classifier-python/po_matching_module.py` | DSPy module (ChainOfThought + Assert) |
| `src/lambda/fee-classifier-python/handler.py` | Lambda routes (add /match_po_invoice) |
| `convex/functions/poMatchingAI.ts` | Tier 2 internalAction (Convex → Lambda via MCP) |
| `convex/functions/poMatches.ts` | Extended: Tier 2 trigger + correction capture |
| `convex/functions/poMatchOptimization.ts` | Weekly optimization triggers |
| `convex/crons.ts` | Sunday 4AM UTC cron for PO matching optimization |

## Testing Checklist

- [ ] Tier 1 still works unchanged for high-confidence matches
- [ ] Tier 2 triggers only when confidence < 0.6
- [ ] AI call metering increments and respects plan limits
- [ ] Corrections are captured on approve/reject
- [ ] BootstrapFewShot activates at ≥20 corrections
- [ ] Lambda timeout falls back gracefully to Tier 1
- [ ] `npm run build` passes
- [ ] `npx convex deploy --yes` succeeds
