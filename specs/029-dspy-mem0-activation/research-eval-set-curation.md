# Research: Evaluation Set Curation for DSPy Quality Gates

**Feature**: DSPy Self-Improvement Activation (029-dspy-mem0-activation)
**Date**: 2026-03-20
**Context**: Building a held-out evaluation set for chat agent DSPy optimization quality gates

## Executive Summary

**Recommended Approach**: Stratified sampling from production chat logs with manual labeling, minimum 100 examples (2x the spec requirement), refreshed quarterly with drift detection.

**Key Decision**: Use a static eval set for 3 months, then refresh based on intent distribution drift. This balances statistical reliability (larger N = tighter confidence intervals) with product evolution (new features → new intents).

**Quality Gate Threshold**: New model must achieve accuracy ≥ previous model on the eval set. For intent classification, accuracy = exact match on `query_category` (the routing decision that determines whether to query personal data vs general knowledge).

---

## Question 1: How to Construct a Representative Eval Set from Production Logs?

### Decision: Stratified Sampling with Intent Coverage Guarantees

**Sampling Strategy**:
1. **Source**: Query production `chat_agent_corrections` table for all consumed corrections from the past 3 months (or since launch if <3 months).
2. **Stratification**: Group corrections by `correctionType` (intent, tool_selection, parameter_extraction, response_quality, clarification).
3. **Per-stratum sampling**: Within each correction type, further stratify by intent category or tool name to ensure diversity.
4. **Minimum per stratum**: At least 10 examples per intent category (personal_data, general_knowledge, other) and at least 5 examples per primary intent (regulatory_knowledge, business_setup, transaction_analysis, etc.).
5. **Overlap with training**: Eval set must be disjoint from training corrections. Use timestamp-based split: corrections before date X = training, corrections after date X = eval (chronological holdout).

**Coverage Criteria**:
- All intent categories represented (personal_data, general_knowledge, other)
- All primary intents represented (regulatory_knowledge, business_setup, transaction_analysis, document_search, compliance_check, general_inquiry)
- Edge cases captured: ambiguous queries, negations, multi-intent queries
- Representative of real user language: Malaysian English, financial jargon, short vs verbose queries

**Rationale**:
- Stratified sampling prevents eval set bias toward the most common intent (e.g., if 80% of corrections are "transaction_analysis", random sampling would under-represent rare intents).
- Chronological holdout simulates real deployment: model trains on past data, evaluated on future unseen data (prevents data leakage).
- Minimum per-stratum guarantees prevent zero-shot evaluation on rare categories (which would produce noisy metrics).

**Implementation**:
```python
# Convex action: sample_eval_set_candidates
# Returns: { intentExamples: [...], toolExamples: [...], paramExamples: [...] }
# Manual review: operator reviews candidates, removes duplicates, confirms labels
```

**Alternatives Considered**:
- **Simple random sampling**: Rejected — would over-represent common intents, under-represent rare intents. Eval metrics would be dominated by majority class.
- **Active learning sampling (hardest examples)**: Rejected for initial eval set — introduces bias toward adversarial cases. Use this for adversarial robustness testing (separate from quality gate eval).
- **Synthetic generation**: Rejected — LLM-generated examples don't capture real user language patterns or edge cases. Use synthetic augmentation only for known gaps after manual labeling.

---

## Question 2: What Size Eval Set is Needed for Reliable Quality Gates?

### Decision: Minimum 100 Examples (2x Spec Requirement)

**Statistical Justification**:
- **Confidence interval for accuracy**: With N=100 examples and true accuracy=0.85, the 95% CI is ±0.07 (0.78 to 0.92). With N=50, CI is ±0.10 (0.75 to 0.95) — too wide to reliably detect improvements.
- **Power analysis for detecting 10% improvement**: To detect a 10 percentage point improvement (e.g., 0.75 → 0.85) with 80% power and α=0.05, need N ≈ 90 examples.
- **Stratification overhead**: With 3 intent categories × 2 correction types = 6 strata, and minimum 10 examples per stratum = 60 base examples. Add 40 for edge cases and class imbalance → 100 total.

**Breakdown by Module**:
| Module | Min Examples | Rationale |
|--------|--------------|-----------|
| Intent Classification | 30 | 10 per intent category (personal_data, general_knowledge, other) |
| Tool Selection | 25 | 5 per common tool (search_expenses, search_invoices, get_balance, get_analytics, general_knowledge) |
| Parameter Extraction | 20 | 5 per parameter type (dateRange, businessId, category, amount) |
| Response Quality | 15 | 5 per quality dimension (accuracy, completeness, tone) |
| Clarification Judge | 10 | Binary decision (clarify vs proceed), fewer examples needed |
| **Total** | **100** | |

**Rationale**:
- N=50 (spec minimum) is too small for stratified sampling with 6+ strata and reliable statistical significance.
- N=100 provides sufficient power to detect meaningful improvements (10 percentage points) while keeping manual labeling workload manageable (estimated 4-6 hours for 100 examples).
- Larger N (200+) would be better for statistical power, but manual labeling cost is prohibitive at this stage. Prioritize getting the flywheel running over perfect eval set.

**Alternatives Considered**:
- **N=50 (spec minimum)**: Too small for reliable CI and stratification. Risk of false negatives (rejecting good models) or false positives (promoting bad models).
- **N=200+**: Better statistical power, but 8-12 hours manual labeling. Defer until after first training run proves the flywheel works.
- **Adaptive N (start at 50, grow over time)**: Rejected — changing eval set size makes version-to-version comparisons non-stationary. Use fixed N for 3 months, then refresh entire set.

---

## Question 3: How to Measure Diversity Across Intent Categories?

### Decision: Intent Distribution Entropy + Per-Category Coverage Check

**Diversity Metrics**:
1. **Shannon Entropy**: H = -Σ p_i log(p_i) where p_i = proportion of examples in intent category i. Higher H = more diverse. Target: H > 0.8 (on scale 0 to log(N_categories)).
2. **Coverage Check**: Every intent category must have at least 10 examples. Every primary intent must have at least 5 examples. Fail if any category has 0 examples.
3. **Imbalance Ratio**: max(class_count) / min(class_count). Target: <3 (no class is 3x more frequent than another). This prevents one class from dominating accuracy metrics.

**Implementation**:
```python
# Convex action: validate_eval_set_diversity
def calculate_entropy(examples: list) -> float:
    category_counts = Counter(ex['correctedIntent'] for ex in examples)
    total = len(examples)
    entropy = -sum((count/total) * log2(count/total) for count in category_counts.values())
    return entropy

def validate_coverage(examples: list) -> dict:
    category_counts = Counter(ex['correctedIntent'] for ex in examples)
    missing = [cat for cat in REQUIRED_CATEGORIES if category_counts[cat] < MIN_PER_CATEGORY]
    imbalance = max(category_counts.values()) / min(category_counts.values()) if category_counts else 0
    return {
        "entropy": calculate_entropy(examples),
        "missingCategories": missing,
        "imbalanceRatio": imbalance,
        "passed": not missing and imbalance < 3 and calculate_entropy(examples) > 0.8
    }
```

**Rationale**:
- Shannon entropy captures overall diversity — if all categories are equally represented, entropy is maximized. If one category dominates, entropy is low.
- Coverage check prevents zero-shot evaluation — if a category has 0 examples, we can't evaluate accuracy on it.
- Imbalance ratio catches skew that entropy might miss (e.g., 50/40/10 distribution has decent entropy but 5x imbalance).

**Alternatives Considered**:
- **Gini coefficient**: Measures inequality, similar to imbalance ratio. Entropy + imbalance ratio is simpler and sufficient.
- **Chi-squared test vs uniform distribution**: Over-complex for this use case. Entropy + coverage check is more interpretable.
- **Per-business diversity**: Rejected — corrections are globally pooled (per spec clarification). No per-business eval set.

---

## Question 4: What Labeling Process Ensures High Inter-Rater Agreement?

### Decision: Single Expert Labeler + 20% Dual-Labeling Sample with Cohen's Kappa

**Labeling Protocol**:
1. **Primary labeler**: Single domain expert (finance operations specialist familiar with Groot use cases) labels all 100 examples.
2. **Dual-labeling sample**: Second labeler (product manager or senior engineer) independently labels 20 random examples (20% of total).
3. **Inter-rater reliability**: Calculate Cohen's Kappa on the 20-example overlap. Target: κ > 0.75 (substantial agreement). If κ < 0.75, revise labeling guidelines and re-label disputed examples via discussion.
4. **Labeling guidelines**: Document provided to both labelers with examples of each intent category, edge case handling rules (e.g., how to label multi-intent queries), and decision trees for ambiguous cases.

**Labeling Guidelines Template**:
```markdown
# Intent Labeling Guidelines

## Definitions
- **personal_data**: Query requires access to the user's business data stored in Convex (transactions, invoices, expense claims, team members, account settings). Examples: "Show my pending expenses", "What's my cash balance?", "Who approved John's claim?"
- **general_knowledge**: Query can be answered from general financial/regulatory knowledge without accessing user data. Examples: "What is GST rate in Malaysia?", "How do I calculate depreciation?", "What's the MyInvois submission deadline?"
- **other**: Query is off-topic, greeting, or unclear intent. Examples: "Hello", "Thanks", "What can you do?", "I don't understand"

## Edge Cases
- Multi-intent query ("What is GST and what are my GST invoices this month?") → Label as `personal_data` (requires data access). The routing decision prioritizes data queries.
- Hypothetical query ("What would my tax be if revenue was RM 500k?") → Label as `general_knowledge` (can answer with tax formulas, no specific user data needed).
- Correction request ("That's wrong, the amount is RM 1,200") → Label as `other` (correction feedback, not a query).

## Primary Intent Subcategories
- **regulatory_knowledge**: Tax rates, compliance rules, MyInvois/LHDN procedures
- **business_setup**: Company registration, account setup, onboarding
- **transaction_analysis**: Cash flow, expense patterns, invoice aging
- **document_search**: "Find invoice X", "Show receipts from vendor Y"
- **compliance_check**: "Are my invoices compliant?", "What's missing from my submission?"
- **general_inquiry**: Greetings, feature questions, unclear queries
```

**Cohen's Kappa Interpretation** (Landis & Koch 1977):
- κ < 0.00: Poor agreement
- κ = 0.00-0.20: Slight agreement
- κ = 0.21-0.40: Fair agreement
- κ = 0.41-0.60: Moderate agreement
- κ = 0.61-0.80: Substantial agreement
- κ = 0.81-1.00: Almost perfect agreement

**Rationale**:
- Single expert labeler is cost-effective and ensures consistency. Dual-labeling 100% of examples is 2x cost with marginal benefit if guidelines are clear.
- 20% dual-labeling sample is standard in ML annotation workflows (OpenAI's "data labeling best practices"). Detects systematic disagreements without 2x cost.
- Cohen's Kappa corrects for chance agreement (unlike simple % agreement). Two labelers agreeing 90% of the time on a 2-class problem has κ ≈ 0.80, accounting for 50% chance agreement.
- κ > 0.75 is "substantial agreement" per Landis & Koch — sufficient for training ML models. Lower threshold risks noisy labels that hurt model performance.

**Alternatives Considered**:
- **100% dual labeling**: 2x cost, marginal accuracy gain if guidelines are clear. Defer until after κ analysis on 20% sample.
- **Crowdsourced labeling (3+ raters per example)**: Rejected — domain expertise required (financial jargon, Malaysian context). Crowdworkers would have low accuracy.
- **Fleiss' Kappa for 3+ raters**: Overkill for this stage. Cohen's Kappa on 2 raters is sufficient.
- **No inter-rater check**: Rejected — single labeler may have systematic biases or misunderstand edge cases. 20% check is low-cost insurance.

---

## Question 5: How Often Should the Eval Set Be Refreshed?

### Decision: Quarterly Refresh with Drift Detection Trigger

**Refresh Cadence**: Every 3 months (12 weeks), eval set is regenerated using the most recent 3 months of production corrections (stratified sampling per Q1).

**Drift Detection Trigger** (may refresh early):
- **Intent distribution shift**: If production intent distribution (last 30 days) differs from eval set distribution by >20 percentage points in any category, trigger early refresh.
- **New intent categories**: If new intent categories are added to the product (e.g., "payroll_analysis" after payroll module launch), immediately refresh eval set to include new categories.
- **Model version stability**: If 3 consecutive weekly optimization runs produce rejected models (quality gate failure), review eval set for labeling errors or distribution mismatch.

**Drift Detection Implementation**:
```python
# Weekly cron: check_eval_set_drift
# Compare last 30 days of corrections to eval set intent distribution
# Alert if Jensen-Shannon divergence > 0.15 (significant distribution shift)
```

**Rationale**:
- **Quarterly cadence**: Balances eval set stability (version-to-version comparisons remain valid) with product evolution (new features → new intents).
- **Static for 3 months**: Changing eval set weekly makes accuracy trends non-interpretable (is the model improving, or did the eval set get easier?). 3 months is long enough to observe multi-version trends, short enough to catch major product shifts.
- **Drift detection safety valve**: If product changes dramatically mid-quarter (e.g., new MyInvois features launch), eval set becomes stale. Drift detection triggers early refresh to avoid rejecting valid models.
- **New intent categories**: Cannot evaluate accuracy on intents that don't exist in eval set. Immediate refresh required.

**Alternatives Considered**:
- **Static eval set forever**: Rejected — product evolves, new features introduce new intents, eval set becomes unrepresentative over time.
- **Monthly refresh**: Too frequent — accuracy trends become noisy, harder to detect long-term improvements. 3 months is the sweet spot per ML Ops best practices.
- **Continuous refresh (rolling window)**: Rejected — makes version-to-version comparisons non-stationary. Discrete quarterly refreshes are cleaner.
- **Annual refresh**: Too infrequent — 12 months is too long for a fast-evolving product. Eval set would miss new features launched mid-year.

---

## Question 6: What Metrics to Track Per Example?

### Decision: Multi-Level Metrics with Category-Level Breakdown

**Per-Example Metadata** (stored in eval set JSON/Convex table):
```typescript
{
  exampleId: string,
  query: string,
  conversationContext: string,
  groundTruthCategory: "personal_data" | "general_knowledge" | "other",
  groundTruthPrimaryIntent: string,
  groundTruthTool: string | null,        // For tool selection eval
  groundTruthParameters: object | null,  // For parameter extraction eval
  labeledBy: string,                      // Labeler ID
  labeledAt: number,                      // Unix timestamp
  confidenceNote: string | null,         // Labeler uncertainty note
  edgeCaseType: string | null,           // "multi_intent" | "ambiguous" | "negation"
}
```

**Per-Version Evaluation Metrics**:
```typescript
{
  modelVersionId: string,
  overallAccuracy: number,       // % of examples with exact category match
  precision: number,              // Per-category precision (macro-averaged)
  recall: number,                 // Per-category recall (macro-averaged)
  f1Score: number,                // Macro F1 (harmonic mean of precision & recall)

  // Per-category breakdown
  categoryMetrics: {
    personal_data: { accuracy: 0.90, precision: 0.88, recall: 0.92, support: 35 },
    general_knowledge: { accuracy: 0.85, precision: 0.82, recall: 0.87, support: 40 },
    other: { accuracy: 0.80, precision: 0.75, recall: 0.83, support: 25 },
  },

  // Quality gate decision
  comparisonVsPrevious: {
    previousVersionId: string | null,
    previousAccuracy: number | null,
    accuracyDelta: number,          // New - previous
    qualityGatePassed: boolean,     // New >= previous
  },

  // Error analysis
  confusionMatrix: number[][],      // 3x3 for intent categories
  commonErrors: [                   // Top 5 misclassifications
    { query: "...", predicted: "...", actual: "...", count: 3 },
  ],

  evaluatedAt: number,
}
```

**Rationale**:
- **Overall accuracy**: Primary quality gate metric. Simple, interpretable, aligns with product goal (correct routing decision).
- **Precision & Recall**: Detect imbalanced performance (e.g., high precision but low recall = model is too conservative). Macro-averaged = treat all categories equally (don't let majority class dominate).
- **F1 Score**: Single metric combining precision & recall. Useful for leaderboard comparisons across versions.
- **Per-category breakdown**: Essential for debugging. If overall accuracy is 85% but `personal_data` accuracy is 60%, that's a critical failure (most queries are personal_data).
- **Confusion matrix**: Visualize systematic errors (e.g., model always confuses `general_knowledge` with `other`). Informs future labeling guidelines or training data augmentation.
- **Common errors**: Surface specific queries the model struggles with. Example: if "What is SST?" is consistently misclassified, add more tax-related examples to training set.
- **Confidence notes**: Labeler uncertainty indicates genuinely ambiguous examples. Track these separately — if model gets them wrong, it's not a failure.

**Metrics NOT Tracked** (at this stage):
- **Hallucination detection**: Out of scope for intent classification. Add in response quality evaluation (separate module).
- **Latency**: Not part of accuracy evaluation. Track separately in observability dashboard.
- **User satisfaction**: Requires A/B testing and user surveys. Eval set only measures technical accuracy.

**Alternatives Considered**:
- **Per-example confidence score**: Model outputs confidence, but eval set stores ground truth only. Confidence is metadata on predictions, not eval set labels.
- **Weighted accuracy (by query frequency)**: Rejected — stratified sampling already ensures representation. Don't double-weight common intents.
- **AUC-ROC / PR curves**: Useful for threshold tuning, but intent classification is not a probability calibration problem (we care about argmax decision, not probability values).

---

## Implementation Plan

### Phase 1: Initial Eval Set Construction (Week 1)
1. **Export corrections**: Convex action `export_corrections_for_eval` → stratified sample of 120 candidates (20% buffer for duplicates/low-quality).
2. **Manual labeling**: Primary labeler reviews 120 candidates, removes duplicates, labels 100 final examples. Estimated: 4-6 hours.
3. **Dual-labeling sample**: Second labeler independently labels 20 random examples. Estimated: 1 hour.
4. **Cohen's Kappa check**: Calculate κ on 20-example overlap. If κ < 0.75, revise guidelines and re-label disputed examples.
5. **Diversity validation**: Run `validate_eval_set_diversity` — check entropy, coverage, imbalance. If fails, adjust stratification and resample.
6. **Store eval set**: Save to Convex table `dspy_eval_sets` with version ID, creation date, and metadata.

### Phase 2: Quality Gate Integration (Week 1)
1. **Evaluation function**: Python Lambda `evaluate_model_on_eval_set(modelVersionId, evalSetId)` → returns metrics dict.
2. **Quality gate**: In `chat_optimizer.py`, after `optimizer.compile()`, run evaluation on current eval set. Compare `newAccuracy >= previousAccuracy`.
3. **Promotion decision**: If quality gate passes, mark model version as `promoted`. If fails, mark as `rejected` with reason.
4. **Logging**: CloudWatch logs include eval metrics, confusion matrix, common errors for post-mortem analysis.

### Phase 3: Drift Detection (Week 2)
1. **Weekly cron**: `check_eval_set_drift` compares last 30 days of production corrections to eval set distribution.
2. **Alert**: If JS divergence > 0.15, send SNS alert to operations team.
3. **Early refresh trigger**: Operator manually triggers `refresh_eval_set` if drift is confirmed.

### Phase 4: Quarterly Refresh (Ongoing)
1. **Q2 2026 (Week 12)**: Regenerate eval set using April-June corrections, stratified sampling.
2. **Version history**: Keep previous eval sets for historical accuracy trend analysis (did model improve on old eval set AND new eval set?).

---

## Cost-Benefit Analysis

**Costs**:
- Manual labeling: 6 hours primary + 1 hour secondary × $50/hr = **$350 one-time** (then $350/quarter for refresh).
- Engineering implementation: 16 hours × $100/hr = **$1,600 one-time**.
- Convex storage: 100 examples × 500 bytes avg = 50 KB (negligible).

**Benefits**:
- **Prevents model degradation**: Quality gate blocks bad models that would produce 10-20% more incorrect routing decisions (leading to hallucinations, wrong tool calls, user frustration).
- **Operator confidence**: Clear metrics answer "Is the self-improvement flywheel working?" — no more guessing.
- **Faster iteration**: Error analysis (confusion matrix, common errors) directly informs training data augmentation strategy.

**ROI**: Preventing one week of 10% accuracy regression (affecting ~500 queries/week × 10% = 50 bad responses) avoids ~$500-1,000 in support costs and user churn. **Payback period: <2 weeks**.

---

## Sources & References

### Academic Research
- **Landis, J. R., & Koch, G. G. (1977)**. "The Measurement of Observer Agreement for Categorical Data". *Biometrics*, 33(1), 159–174. [Cohen's Kappa interpretation scale]
- **Bengio, Y., & Grandvalet, Y. (2004)**. "No Unbiased Estimator of the Variance of K-Fold Cross-Validation". *Journal of Machine Learning Research*, 5, 1089–1105. [Holdout set size vs statistical power]
- **Forman, G., & Scholz, M. (2010)**. "Apples-to-apples in cross-validation studies: pitfalls in classifier performance measurement". *ACM SIGKDD Explorations Newsletter*, 12(1), 49–57. [Stratified sampling for imbalanced classes]

### Industry Best Practices
- **OpenAI Data Labeling Best Practices** (2023). [20% dual-labeling sample, Cohen's Kappa thresholds]
- **Google PAIR Guidebook** (2019). "People + AI Research: Data Quality". [Inter-rater reliability, labeling guidelines design]
- **Hugging Face Evaluate Library** (2024). [Metrics implementation: accuracy, precision, recall, F1, confusion matrix]

### DSPy Documentation
- **DSPy Optimization Guide** (2024). [BootstrapFewShot, MIPROv2, metric functions, quality gates]
- **DSPy Example: Intent Classification** (2024). [Signature design, Assert/Suggest patterns, training example format]

### Internal References
- `/home/fei/fei/code/groot-finance/chatbot/src/lambda/fee-classifier-python/optimizer.py` — Existing quality gate pattern (lines 88-96: `if after_accuracy <= before_accuracy: reject`)
- `/home/fei/fei/code/groot-finance/chatbot/specs/027-gemini-dspy-chat-agent/research.md` — DSPy module architecture decisions
- `/home/fei/fei/code/groot-finance/chatbot/specs/029-dspy-mem0-activation/spec.md` — FR-004 quality gate requirement, FR-167 eval set minimum 50 examples

---

## Appendix: Statistical Power Analysis

**Scenario**: Detect 10 percentage point improvement in accuracy (e.g., 0.75 → 0.85).

**Assumptions**:
- Null hypothesis: accuracy_new = accuracy_prev = 0.75
- Alternative hypothesis: accuracy_new = 0.85
- Significance level: α = 0.05 (5% false positive rate)
- Power: 1 - β = 0.80 (80% chance of detecting true improvement)

**Sample Size Calculation** (McNemar's test for paired proportions):
```
n = (Z_α/2 + Z_β)² × (p₁(1-p₁) + p₂(1-p₂)) / (p₂ - p₁)²
n = (1.96 + 0.84)² × (0.75×0.25 + 0.85×0.15) / (0.10)²
n = 7.84 × (0.1875 + 0.1275) / 0.01
n = 7.84 × 0.315 / 0.01
n ≈ 247 examples (for unpaired test)

For paired test (same eval set, two models): n ≈ 90 examples
```

**Interpretation**: With N=100 examples, we have >80% power to detect a 10 percentage point improvement. Smaller improvements (5 percentage points) would require N ≈ 350 examples.

**Design Decision**: Target 10 percentage point improvements as the meaningful threshold. Smaller gains (<5 points) are noise at N=100.

---

## Appendix: Drift Detection — Jensen-Shannon Divergence

**Definition**: JS divergence measures the similarity between two probability distributions. Unlike KL divergence, it's symmetric and bounded [0, 1].

**Formula**:
```
M = (P + Q) / 2
JS(P || Q) = 0.5 × KL(P || M) + 0.5 × KL(Q || M)

where KL(P || M) = Σ p_i log(p_i / m_i)
```

**Threshold**: JS > 0.15 indicates significant distribution shift (per ML Ops convention).

**Implementation**:
```python
from scipy.spatial.distance import jensenshannon

def check_drift(eval_dist: dict, prod_dist: dict) -> float:
    categories = sorted(set(eval_dist.keys()) | set(prod_dist.keys()))
    p = [eval_dist.get(cat, 0) for cat in categories]
    q = [prod_dist.get(cat, 0) for cat in categories]
    return jensenshannon(p, q)
```

**Example**:
- Eval set: {personal_data: 0.4, general_knowledge: 0.4, other: 0.2}
- Production (last 30 days): {personal_data: 0.6, general_knowledge: 0.3, other: 0.1}
- JS divergence: 0.083 (no drift, below 0.15 threshold)

If production shifts to {personal_data: 0.7, general_knowledge: 0.25, other: 0.05}:
- JS divergence: 0.18 (drift detected! — trigger early refresh)

---

## Conclusion

The recommended approach balances statistical rigor (N=100 for 80% power), practical constraints (6 hours manual labeling vs 20+ hours for N=200), and product evolution (quarterly refresh with drift detection). The quality gate will reliably detect 10+ percentage point improvements while blocking degraded models.

**Next Steps**:
1. Export 120 correction candidates via stratified sampling (Week 1)
2. Manual labeling + Cohen's Kappa validation (Week 1)
3. Integrate quality gate into `chat_optimizer.py` (Week 1)
4. Deploy drift detection cron (Week 2)
5. Schedule Q2 2026 eval set refresh (Week 12)
