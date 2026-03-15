# Feature Specification: DSPy Self-Improving E-Invoice CUA Pipeline

**Feature Branch**: `001-dspy-cua-integration`
**Created**: 2026-03-15
**Status**: Draft
**Input**: Integrate 5 DSPy features (MIPROv2, Assert/Suggest, BootstrapFewShot, ChainOfThought, Evaluate) into the E-Invoice CUA runtime handler, replacing thin JSON wrapper usage with a self-improving cross-merchant intelligence engine.

## Background

The E-Invoice CUA system fills buyer information forms on merchant e-invoice portals. Currently it uses a 3-tier architecture:
- **Tier 1**: Saved CSS selectors (fast, ~5s) — works when selectors are known
- **Tier 2**: Gemini CUA visual exploration (~120s) — works but no cross-merchant learning
- **Tier 3**: DSPy troubleshooter (~10s) — diagnoses failures but only saves static hints per merchant

The system "learns" by saving CSS selectors and cuaHints to a per-merchant database. This works for returning to the same merchant but does NOT generalize: a new merchant with an identical form layout starts from scratch.

Six DSPy modules and an optimization pipeline were scaffolded but never wired into the runtime handler. This feature completes that integration.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Smarter Troubleshooting with Optimized Prompts (Priority: P1)

When a form fill fails, the system diagnoses the failure and generates actionable hints. Today, the diagnosis prompt is static and treats every failure the same way. With MIPROv2-optimized prompts, the troubleshooter uses patterns learned from hundreds of past failures to generate hints that are more likely to succeed on retry.

**Why this priority**: This is the highest-impact change. The troubleshooter runs on every failure (the most common path for new merchants). Better hints directly reduce the number of repeated failures and manual interventions. It's also the simplest integration — replacing `dspy.Predict(FormDiagnosis)` with the `OptimizedTroubleshooter` module.

**Independent Test**: Trigger a form fill on a merchant that is known to fail (e.g., one with an uncommon form layout). Compare the generated cuaHint quality between baseline (current `dspy.Predict`) and the optimized module. Verify the optimized module loads from S3 cache on warm invocations.

**Acceptance Scenarios**:

1. **Given** the optimization pipeline has run at least once and produced an optimized troubleshooter module stored in S3, **When** a form fill fails for any merchant, **Then** the troubleshooter loads the optimized module (not the inline `FormDiagnosis` signature) and generates a diagnosis using optimized prompts.
2. **Given** no optimized module exists in S3 (first deployment or S3 failure), **When** a form fill fails, **Then** the troubleshooter falls back to the baseline module with equivalent behavior to today's `dspy.Predict(FormDiagnosis)`.
3. **Given** the troubleshooter generates a hint, **When** the system logs the attempt, **Then** the log includes the DSPy module version used (`baseline` or a timestamped version string) for later training data collection.

---

### User Story 2 — Self-Healing Form Fill with Field Validation (Priority: P1)

When generating CUA instructions for filling a form, the system must ensure all required buyer fields (email, company name, TIN) are addressed in the instructions. If the generated instructions miss a required field, the system automatically retries (backtracks) up to 3 times before falling back to a generic instruction set. Additionally, when CSS selectors are available from previous successful fills, the system nudges the instruction generator to reference them for faster, more reliable fills.

**Why this priority**: Missing required fields is the #1 cause of form submission failures. This turns a "hope it works" approach into a "guaranteed coverage" approach with automatic retry. It's a runtime safety net that prevents wasted CUA turns.

**Independent Test**: Generate CUA instructions for a merchant where the buyer has all fields populated. Verify that the instructions mention email, company, and TIN. Intentionally test with a prompt that would omit TIN — verify the Assert triggers a retry and the final output includes it.

**Acceptance Scenarios**:

1. **Given** buyer details include email, company name, and TIN, **When** the system generates CUA instructions, **Then** the instructions contain references to all three required fields.
2. **Given** the instruction generator's first attempt omits one required field, **When** the Assert constraint fires, **Then** the system backtracks and regenerates instructions up to 3 times, producing instructions that include the missing field.
3. **Given** CSS selectors are available from a previous successful fill (formConfig has populated `fields[]`), **When** instructions are generated, **Then** the system preferentially references CSS selectors (e.g., `input#email`, `select[name=industry]`) for form fields.
4. **Given** all 3 retry attempts still miss a required field, **When** the system exhausts retries, **Then** it falls back to a hardcoded instruction template that explicitly lists all buyer fields, and logs the fallback event.

---

### User Story 3 — Cross-Merchant Learning from Successful Fills (Priority: P2)

When the system encounters a new merchant's form, instead of starting from scratch, it uses proven patterns from successful fills on similar merchants. The recon-to-instructions step is enhanced with few-shot examples bootstrapped from past successes. A merchant running FamilyMart's form layout benefits from patterns learned on 7-Eleven's similar layout.

**Why this priority**: This is the core "moat" feature — it transforms per-merchant memory into cross-merchant intelligence. However, it requires accumulated training data (successful fills with recon descriptions), so it delivers value only after the system has processed several merchants.

**Independent Test**: After accumulating at least 5 successful fills with recon data, run the optimization pipeline. Then trigger a form fill for a new merchant with a similar form layout. Verify the generated CUA instructions reference patterns (field ordering, dropdown handling) learned from other merchants.

**Acceptance Scenarios**:

1. **Given** the BootstrapFewShot optimization has run and produced an optimized recon module, **When** a Tier 2 form fill starts for a new merchant, **Then** the recon-to-instructions step uses the optimized module with proven few-shot examples instead of zero-shot reasoning.
2. **Given** no optimized recon module exists, **When** a Tier 2 fill starts, **Then** the system falls back to baseline ChainOfThought reasoning (equivalent to or better than current Gemini Flash recon).
3. **Given** a successful form fill completes, **When** the system logs the attempt, **Then** the log includes `reconDescription`, CUA turn count, and success/failure status for future training data collection.

---

### User Story 4 — Step-by-Step Reasoning for Complex Forms (Priority: P2)

When diagnosing failures or planning form fill strategies, the system thinks through the problem step-by-step instead of generating a single-shot answer. For complex merchant forms with tabs, overlays, popups, and nested sections, chain-of-thought reasoning produces more accurate diagnoses and more reliable CUA instructions.

**Why this priority**: This is an upgrade to the reasoning quality of existing modules. It improves accuracy on complex forms (which are the ones that fail most often) but doesn't change the overall architecture.

**Independent Test**: Compare troubleshooter output on a complex form (one with tabs and popups) between `dspy.Predict` and `dspy.ChainOfThought`. The ChainOfThought version should produce a reasoning trace that identifies the UI complexity before generating the hint.

**Acceptance Scenarios**:

1. **Given** a form fill fails on a merchant with a complex multi-tab form, **When** the troubleshooter diagnoses the failure, **Then** the diagnosis includes reasoning about the form structure (tabs, overlays, popups) before the final hint.
2. **Given** a Tier 2 recon step analyzes a new merchant's form, **When** generating CUA instructions, **Then** the system produces step-by-step reasoning about field ordering, dropdown dependencies, and potential blockers before the final instructions.

---

### User Story 5 — Quality Metrics Dashboard for E-Invoice Operations (Priority: P3)

The engineering and operations team can view per-merchant and per-category success rates, average costs, and hint effectiveness scores. After each optimization run, the system evaluates whether the new model performs better than the baseline and only deploys improvements. Merchants with persistently low success rates are automatically flagged for manual review.

**Why this priority**: This is the observability layer that makes the learning loop measurable. Without it, the team can't tell if optimization is helping or hurting. It's P3 because the system can function without it — the other features deliver value independently.

**Independent Test**: Run the evaluation pipeline. Verify it produces a scorecard with per-merchant success rates and flags merchants below 50% success rate with 3+ attempts.

**Acceptance Scenarios**:

1. **Given** the system has processed form fills for multiple merchants, **When** the evaluation pipeline runs (as part of the optimization cycle), **Then** it produces a scorecard with per-merchant success rates, average costs, and hint effectiveness.
2. **Given** a merchant has a success rate below 50% with at least 3 completed attempts, **When** the evaluation runs, **Then** the merchant is flagged with a recommendation for manual review.
3. **Given** an optimization run produces a new model, **When** the evaluation compares it to the baseline, **Then** the new model is deployed only if it scores higher than the baseline; otherwise the baseline is retained.

---

### Edge Cases

- What happens when the optimization pipeline runs but there are fewer than 10 hint-effectiveness training pairs? → Skip MIPROv2 optimization, retain current module, log reason.
- What happens when the S3 module cache is corrupted or contains invalid JSON? → Fall back to baseline module, log warning, continue processing.
- What happens when Assert constraints repeatedly fail (e.g., the LLM consistently refuses to include "TIN" in instructions)? → After 3 backtracks, fall back to hardcoded template instructions and log the failure for investigation.
- What happens when cold start time increases due to DSPy module loading? → Lazy-load DSPy modules only when needed (Tier 2/3); Tier 1 (CSS selectors) never loads DSPy.
- What happens when the Convex query for training data times out? → Log error, skip optimization for this cycle, retry on next EventBridge trigger.
- What happens when two optimization cycles overlap (previous one hasn't finished)? → The EventBridge trigger has a 3-day interval with 15-minute Lambda timeout; overlap is unlikely but harmless since S3 writes are atomic (latest.json is overwritten).

## Requirements *(mandatory)*

### Functional Requirements

#### Runtime Integration (handler.py)

- **FR-001**: System MUST replace inline `dspy.Predict(FormDiagnosis)` in the troubleshoot function with the `OptimizedTroubleshooter` module, loading optimized state from S3 when available.
- **FR-002**: System MUST lazy-load DSPy modules only when they are needed (Tier 2 recon, Tier 3 troubleshooting) — Tier 1 CSS-based fills MUST NOT trigger any DSPy imports or module loading.
- **FR-003**: System MUST fall back to baseline (non-optimized) modules when S3 cache is unavailable, corrupted, or loading fails — with no impact on the user's form fill attempt.
- **FR-004**: System MUST wire the `InstructionGuard` module into the CUA instruction generation path, enforcing that all required buyer fields (email, company name, TIN) are present in generated instructions.
- **FR-005**: System MUST automatically backtrack and retry instruction generation (up to 3 times) when Assert constraints are violated, before falling back to a hardcoded template.
- **FR-006**: System MUST wire the `ReconModule` into the Tier 2 recon-to-instructions flow, replacing the current plain-text Gemini Flash response with structured DSPy ChainOfThought output.
- **FR-007**: System MUST use `dspy.ChainOfThought` (not `dspy.Predict`) for both the troubleshooter and recon modules to produce step-by-step reasoning traces.
- **FR-008**: System MUST log the DSPy module version (`baseline` or timestamp) used for each attempt in the `einvoice_request_logs` table.

#### Training Data Collection (Convex → DSPy)

- **FR-009**: System MUST log `reconDescription` (the Gemini Flash form analysis) to `einvoice_request_logs` after every Tier 2 recon step.
- **FR-010**: System MUST log `generatedHint` and `failureCategory` to `einvoice_request_logs` after every troubleshooter invocation (this is partially done today).
- **FR-011**: System MUST resolve `hintEffectivenessOutcome` for each troubleshooter hint by comparing the outcome of the next attempt for the same merchant — marking it `helped`, `not_helped`, or leaving it `pending`.
- **FR-012**: System MUST provide a Convex query that returns raw training data (not just aggregated metrics) with all fields needed for DSPy optimization: error_message, merchant_name, screenshot_description, previous_hints, tier_reached, next_attempt_succeeded, recon_description, buyer_details, cua_turns.

#### Offline Optimization Pipeline

- **FR-013**: System MUST run MIPROv2 optimization on the troubleshooter module using hint-effectiveness training pairs, with a minimum threshold of 10 training examples before optimizing.
- **FR-014**: System MUST run BootstrapFewShot optimization on the recon module using successful fill patterns, with a minimum threshold of 5 training examples before optimizing.
- **FR-015**: System MUST evaluate optimized modules against the baseline before deployment — only deploying when the optimized score exceeds the baseline.
- **FR-016**: System MUST store optimized module state in S3 with both a timestamped version and a `latest.json` overwrite for fast Lambda cold starts.
- **FR-017**: The optimization pipeline MUST run on a scheduled cadence (every 3 days) via the already-provisioned EventBridge trigger and dedicated Lambda.

#### Evaluation & Quality Metrics

- **FR-018**: System MUST produce per-merchant scorecards showing: success rate, average cost, hint effectiveness rate, and failure category breakdown.
- **FR-019**: System MUST flag merchants with success rates below 50% (with at least 3 completed attempts) for manual review.
- **FR-020**: System MUST log evaluation results (overall success rate, flagged merchants, optimization scores) after each optimization cycle.

### Key Entities

- **Optimized Module**: A DSPy module state (serialized JSON) that has been trained via MIPROv2 or BootstrapFewShot. Stored in S3. Attributes: module name, version timestamp, baseline score, optimized score, DSPy serialized state.
- **Training Pair (Hint Effectiveness)**: A single training example for MIPROv2 troubleshooter optimization. Attributes: error message, merchant name, screenshot description, previous hints, tier reached, generated hint, next attempt outcome (succeeded/failed).
- **Training Pair (Recon Success)**: A single training example for BootstrapFewShot recon optimization. Attributes: recon description, merchant name, buyer details, generated instructions, succeeded flag, CUA turn count.
- **Merchant Scorecard**: Aggregated quality metrics for a single merchant. Attributes: merchant name, total attempts, success rate, average cost, hint effectiveness rate, failure category breakdown, flagged status.
- **Evaluation Report**: Summary of system-wide quality after an optimization cycle. Attributes: total merchants evaluated, average success rate, average cost, flagged merchant count, optimization results per module.

## Assumptions

- The existing Convex schema fields (`reconDescription`, `generatedHint`, `hintEffectivenessOutcome`, `failureCategory`, `confidenceGateScore`, `dspyModuleVersion`) on `einvoice_request_logs` are sufficient — no schema changes needed.
- The CDK stack already provisions the optimizer Lambda (`finanseal-dspy-optimizer`) with EventBridge schedule — no infrastructure changes needed for the pipeline itself.
- Gemini Flash-Lite (`gemini-3.1-flash-lite-preview`) is the LLM used by DSPy for all optimization and runtime calls (per project conventions).
- The `data_collector.py` currently returns empty arrays — the raw training data query in Convex needs to be implemented (FR-012) before the optimization pipeline can produce results.
- Cold start impact of loading DSPy modules from S3 is mitigated by `/tmp/` caching across warm Lambda invocations and lazy imports.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: New merchants with form layouts similar to previously successful merchants achieve first-attempt success within 3 tries (down from 5+ today), as measured by the evaluation scorecard.
- **SC-002**: The troubleshooter generates hints that lead to successful retries at least 60% of the time (hint effectiveness rate), up from no measured baseline today.
- **SC-003**: All form fill instructions generated by the system include all three required buyer fields (email, company, TIN) — zero instances of missing required fields after Assert integration.
- **SC-004**: The system maintains current Tier 1 fill speed (under 10 seconds) with no cold start penalty from DSPy module loading on the fast path.
- **SC-005**: The optimization pipeline runs autonomously every 3 days, and the team can view per-merchant success rates and flagged merchants without manual data extraction.
- **SC-006**: Overall cross-merchant success rate (weighted by attempt volume) improves by at least 20% within 30 days of deployment, as measured by the evaluation framework comparing before/after optimization scores.
