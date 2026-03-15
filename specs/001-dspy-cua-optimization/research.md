# Research: DSPy-Powered Self-Improving E-Invoice CUA System

## R1: DSPy MIPROv2 Optimizer for Troubleshooter

### Decision
Use MIPROv2 with `auto="light"` mode for optimizing the troubleshooter's FormDiagnosis signature. Training data extracted from Convex einvoice_request_logs by correlating consecutive attempts for the same merchant.

### Rationale
- MIPROv2 is DSPy's latest optimizer, replacing COPRO and BootstrapFewShotWithRandomSearch
- `auto="light"` mode is fast enough for 20-50 training examples (our expected dataset size)
- The metric function measures "hint effectiveness": did the generated cuaHint lead to success on the next attempt for the same merchant?
- Serialization: DSPy modules serialize via `module.save(path)` / `module.load(path)` — produces JSON-compatible output

### Alternatives Considered
- **BootstrapFewShot only**: Simpler but doesn't rewrite prompts, only selects examples. Less effective for the troubleshooter where prompt wording matters more than examples.
- **MIPROv2 auto="heavy"**: More thorough but requires 100+ examples and takes 30+ minutes. Overkill for our data volume.
- **Manual prompt iteration**: Current approach. Doesn't scale, doesn't learn from data.

## R2: BootstrapFewShot for Recon Intelligence

### Decision
Use BootstrapFewShot with `max_bootstrapped_demos=4` to learn recon-to-instruction patterns. Save recon descriptions alongside form fill results in the extended request log.

### Rationale
- BootstrapFewShot runs the module on training data, keeps outputs that pass the metric, and injects them as few-shot examples
- 4 demos is the sweet spot: enough variety without overwhelming the prompt context
- Metric: successful form fill (status=success) with low CUA turn count (<20 turns)
- Recon descriptions are currently generated then discarded — we just need to save them

### Alternatives Considered
- **MIPROv2 on recon**: Overkill — recon benefits more from examples than prompt rewriting
- **Manual few-shot curation**: Doesn't scale, requires human judgment per merchant

## R3: Schema Extension for einvoice_request_logs

### Decision
Extend the existing einvoice_request_logs table with DSPy-specific fields rather than creating new tables. Add: reconDescription, generatedHint, hintEffectivenessOutcome, confidenceGateScore, failureCategory, perFieldResults.

### Rationale
- Consolidates all form fill attempt data in one place
- Evaluation queries aggregate directly from this table
- No data duplication between logs and training datasets
- Backward compatible: all new fields are optional

### Alternatives Considered
- **New dspy_training_data table**: Duplicates data already in request logs. Maintenance burden.
- **S3 for training data**: Extra hop, harder to query. Convex is already the data layer.

## R4: Optimized Module Storage and Caching

### Decision
Store optimized DSPy modules in S3 at `finanseal-bucket/dspy-modules/{module_name}/{timestamp}.json`. Form fill Lambda downloads latest on cold start and caches in `/tmp/`.

### Rationale
- S3 has versioning built in, allowing rollback to previous module versions
- Decouples optimization from Lambda deployment — no redeploy needed when modules update
- `/tmp/` caching means subsequent warm invocations don't re-download
- IAM role already has S3 access (existing finanseal-bucket permissions)

### Alternatives Considered
- **Lambda Layer**: Requires redeploy to update. Slow iteration.
- **SSM Parameter Store**: 4KB limit per parameter. DSPy modules can be 10-50KB.
- **Convex file storage**: Cross-service dependency for a Python Lambda. Unnecessary complexity.

## R5: Evaluation Framework Design

### Decision
Build evaluation as a Python script that queries Convex einvoice_request_logs, computes per-merchant scorecards, and stores results back in Convex via a dedicated evaluation_reports query/mutation.

### Rationale
- dspy.Evaluate provides the framework for running metrics against a dataset
- Per-merchant aggregation computed from raw logs (success rate, cost, tier distribution)
- Hint effectiveness measured by correlating hint generation with next-attempt outcome
- Results stored in Convex for future admin dashboard UI

### Alternatives Considered
- **CloudWatch Insights**: Good for ad-hoc queries but not for structured scorecards with DSPy integration
- **Standalone dashboard**: Premature — start with data collection, build UI later

## R6: Assert/Suggest for CUA Instructions

### Decision
Wrap CUA instruction generation in a DSPy module with dspy.Assert for required fields and dspy.Suggest for selector preferences. Max 3 backtrack retries.

### Rationale
- Assert provides automatic backtracking with error context — the LLM gets told WHY it failed
- Suggest is non-blocking — if selectors aren't used, instructions still proceed
- 3 retries balances reliability vs latency (each retry adds ~200ms Gemini call)
- Fallback to current non-DSPy generation if all retries fail

### Alternatives Considered
- **Post-generation validation only**: Catches errors but can't fix them. Wastes the CUA attempt.
- **Pre-generation template**: Too rigid for diverse merchant forms. LLM flexibility needed.

## R7: Tier 1 Confidence Gate

### Decision
Use a lightweight DSPy Predict module that takes saved selectors + current page HTML snippet and outputs a confidence score. Skip Tier 1 if confidence < 0.7.

### Rationale
- The page HTML snippet (first 2KB) is enough to detect major form changes (missing elements, new structure)
- Gemini Flash-Lite call adds ~200ms but saves 5s on failed Tier 1 attempts
- 0.7 threshold is conservative — can be tuned based on evaluation data
- The confidence prediction itself becomes training data for future optimization

### Alternatives Considered
- **DOM diffing**: Compare saved selectors against actual DOM. More reliable but requires browser navigation first (defeats the purpose of skipping).
- **Hash-based detection**: Hash the form HTML and compare. Too sensitive to minor changes (CSS updates trigger false positives).

## R8: ChainOfThought Buyer Profile Matching

### Decision
Use dspy.ChainOfThought for multi-step buyer profile matching: TIN exact match → fuzzy name match → recency disambiguation. Output includes step-by-step reasoning.

### Rationale
- ChainOfThought generates intermediate reasoning, making the selection explainable
- Fuzzy name matching handles common variations (Sdn Bhd, (M), Berhad suffixes)
- Recency breaks ties when multiple profiles share the same TIN
- Reasoning is logged for debugging and training

### Alternatives Considered
- **Simple string similarity**: No reasoning, hard to debug. Doesn't handle edge cases well.
- **Embedding-based matching**: Overkill for ~3-10 profiles. Adds embedding model dependency.
