# Quickstart: Self-Improving Action Center

**Date**: 2026-03-24
**Feature**: 033-ai-action-center-dspy

## Prerequisites

- Convex dev environment set up (`npx convex dev` from main working directory only)
- AWS CDK access (`cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2`)
- Python 3.11 for DSPy module development
- Access to `finanseal-bucket` S3 for model artifacts

## Development sequence

### Phase 1: Feedback capture (UI + Convex)

1. Add `userFeedback` field to `actionCenterInsights` in `convex/schema.ts`
2. Extend `updateStatus` mutation in `convex/functions/actionCenterInsights.ts` to accept `feedbackText`
3. Create `action_center_corrections` table in `convex/schema.ts`
4. Create correction-recording logic in `updateStatus` (or new internal mutation)
5. Add feedback textarea to `InsightCard.tsx` dismiss/action flow
6. Deploy Convex: `npx convex deploy --yes`
7. Test: dismiss insight with feedback, verify correction record created

### Phase 2: Optimization pipeline (Convex + Lambda)

1. Create `convex/functions/actionCenterOptimization.ts` with readiness check, training data queries
2. Add DSPy module `action_center_relevance.py` to `src/lambda/fee-classifier-python/`
3. Add action center handler to `src/lambda/fee-classifier-python/handler.py`
4. Add EventBridge rule to `infra/lib/scheduled-intelligence-stack.ts`
5. Deploy Lambda: `cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2`
6. Deploy Convex: `npx convex deploy --yes`
7. Test: seed 20+ corrections, trigger optimization manually, verify model version created

### Phase 3: Inference integration (post-filter)

1. Extend `model-version-loader.ts` for business-scoped model lookup
2. Add post-filter step to `actionCenterJobs.ts` insight generation pipeline
3. Deploy Convex: `npx convex deploy --yes`
4. Test: with active model, verify suppressed insights don't appear

## Testing approach

### Manual testing
- Use admin test account (yeefei+test2@hellogroot.com)
- Navigate to dashboard → Action Center
- Dismiss insights with feedback text
- Verify corrections in Convex dashboard

### Seeding corrections for optimization testing
```bash
# Use Convex dashboard or a seed script to create 20+ corrections
# Ensure at least 10 unique category/insightType combinations
# Then trigger optimization manually via scheduled-intelligence Lambda
```

### Verifying model promotion
```bash
# Check dspy_model_versions table for module="action-center-relevance"
# Verify status progression: candidate → promoted
# Check dspy_optimization_logs for audit trail
```

## Key files to modify

| File | Change |
|------|--------|
| `convex/schema.ts` | Add `userFeedback` field, new `action_center_corrections` table |
| `convex/functions/actionCenterInsights.ts` | Extend `updateStatus` with feedback + correction recording |
| `convex/functions/actionCenterOptimization.ts` | NEW — readiness, training data, optimization pipeline |
| `convex/functions/actionCenterJobs.ts` | Add post-filter step before insight insertion |
| `src/domains/analytics/components/action-center/InsightCard.tsx` | Add feedback textarea to dismiss/action flow |
| `src/lambda/fee-classifier-python/action_center_relevance.py` | NEW — DSPy module |
| `src/lambda/fee-classifier-python/handler.py` | Add action center optimization handler |
| `src/lib/ai/dspy/model-version-loader.ts` | Extend for business-scoped model lookup |
| `infra/lib/scheduled-intelligence-stack.ts` | Add EventBridge rule for weekly optimization |
| `infra/lib/document-processing-stack.ts` | Potentially add env vars if needed |
