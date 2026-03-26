# Feature Specification: Self-Improving Action Center (DSPy Feedback Loops)

**Feature Branch**: `033-ai-action-center-dspy`
**Created**: 2026-03-23
**Status**: Draft
**Input**: GitHub Issue #328 — Self-improving Action Center: DSPy feedback loop for all 7 detection algorithms
**GitHub Issue**: https://github.com/grootdev-ai/groot-finance/issues/328

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Dismiss Insight with Feedback (Priority: P1)

A finance admin (business owner) sees an Action Center insight that is irrelevant or a false positive. The Action Center is only accessible to users with `finance_admin` permission, so all feedback comes from this role. They dismiss it and provide a brief reason explaining WHY it's not useful — e.g., "This is a regular quarterly payment, not an anomaly" or "We always buy from this vendor in bulk."

**Why this priority**: Without user feedback capture, there is no training data for the self-improvement loop. This is the foundational building block — all other stories depend on it.

**Independent Test**: Can be fully tested by dismissing an insight with feedback text, then verifying the feedback is stored in the corrections table with the correct algorithm type and insight context.

**Acceptance Scenarios**:

1. **Given** an Action Center card in "new" status, **When** the user clicks dismiss, **Then** a dialog appears with a text input asking "Why is this not useful?" and options to submit or skip feedback.
2. **Given** the dismiss dialog is open, **When** the user types feedback and confirms, **Then** the insight is marked as "dismissed", a correction record is created with the insight type, algorithm, user feedback, and original insight context.
3. **Given** the dismiss dialog is open, **When** the user skips feedback (dismisses without typing), **Then** the insight is marked as "dismissed" with `isUseful: false` and no feedback text — still counted as a negative signal.

---

### User Story 2 - Confirm Insight as Useful (Priority: P1)

A finance admin sees an Action Center insight, finds it genuinely useful, and takes action on it (marks as reviewed or actioned). This positive signal is equally important for training — the system needs to learn what GOOD insights look like, not just what to suppress.

**Why this priority**: A balanced training set requires both positive and negative examples. Without positive signals, the model would only learn what to avoid, not what to surface.

**Independent Test**: Can be tested by marking an insight as "actioned" or "reviewed" and verifying a correction record is created with `isUseful: true`.

**Acceptance Scenarios**:

1. **Given** an Action Center card in "new" status, **When** the user marks it as "actioned" or "reviewed", **Then** a correction record is created with `isUseful: true`, the insight type, algorithm, and original insight context.
2. **Given** a user has actioned multiple insights over several weeks, **When** querying the corrections table, **Then** both positive and negative corrections exist with balanced representation per algorithm type.

---

### User Story 3 - System Learns from Feedback (Priority: P2)

After accumulating sufficient corrections (at least 20 per algorithm type, spanning at least 10 unique insight contexts), the system automatically retrains its DSPy modules. The retrained model is quality-gated — it must outperform the previous model on a held-out validation set before being promoted to active use.

**Why this priority**: This is the core learning loop, but it requires Story 1 and Story 2 to generate training data first. It runs in the background without direct user interaction.

**Independent Test**: Can be tested by seeding 20+ corrections for one algorithm type, triggering the optimization pipeline, and verifying that a new model version is created (or the training correctly rejects a worse model).

**Acceptance Scenarios**:

1. **Given** 20+ corrections exist for "statistical_anomaly" algorithm with 10+ unique insight contexts, **When** the weekly optimization pipeline runs, **Then** the system trains a new DSPy module, evaluates it against a held-out validation set, and promotes it if accuracy improves.
2. **Given** a newly trained model performs worse than the current active model, **When** the quality gate evaluates it, **Then** the candidate is rejected, the previous model remains active, and the rejection is logged with accuracy comparison.
3. **Given** a model is successfully promoted, **When** the next Action Center detection run executes, **Then** the promoted model's optimized prompts are loaded and used for insight scoring/filtering.

---

### User Story 4 - Fewer False Positives Over Time (Priority: P2)

As the system accumulates corrections and retrains, a business that has been using Groot for several months sees noticeably fewer irrelevant insights. Insights they previously dismissed as noise stop appearing — the Action Center becomes more signal, less noise.

**Why this priority**: This is the user-visible outcome of the learning loop. It's what makes the feature valuable, but it's emergent rather than directly implementable.

**Independent Test**: Can be tested by running detection algorithms with and without an optimized model, comparing the false positive rate on a set of known-dismissed insight patterns.

**Acceptance Scenarios**:

1. **Given** a business has dismissed 30+ similar anomaly insights over 2 months, **When** the optimized model is active and the detection pipeline runs, **Then** the post-filter classifies matching candidates as noise and they are not surfaced to the user.
2. **Given** the system has learned that "quarterly payment to Vendor X" is not anomalous for this business, **When** the next quarterly payment occurs, **Then** no anomaly insight is generated for that transaction pattern.

---

### User Story 5 - Per-Business Learning (Priority: P3)

Each business has its own learned preferences. What's anomalous for a restaurant (large equipment purchase) is normal for a construction company. The DSPy modules maintain per-business optimization — corrections from Business A don't affect Business B's insight generation.

**Why this priority**: Important for multi-tenant correctness, but the initial implementation can start with per-business correction isolation and add per-business model optimization later.

**Independent Test**: Can be tested by creating corrections for two different businesses, running optimization, and verifying each business's model reflects only its own corrections.

**Acceptance Scenarios**:

1. **Given** Business A has dismissed "high vendor concentration" insights repeatedly, **When** Business B (a new business) gets a similar vendor concentration insight, **Then** Business B still sees the insight (Business A's feedback has no effect on Business B).
2. **Given** Business A has 50+ corrections and an optimized model, **When** Business B has only 5 corrections (below the readiness threshold), **Then** Business B uses the default (unoptimized) detection while Business A uses its optimized model.

---

### Edge Cases

- What happens when a user dismisses without providing feedback text? System records a negative signal with empty feedback — still useful for training.
- What happens when the optimization pipeline runs but no algorithm has reached the 20-correction threshold? Pipeline skips gracefully, logs that no algorithms are ready for training.
- What happens when a previously trained model becomes stale because user patterns change? Weekly retraining uses a 6-month rolling correction window, so old preferences naturally expire and evolving patterns are captured.
- What happens when a business is deleted or deactivated? Corrections and models for that business are no longer used but retained for audit.
- What happens when all insights for a particular algorithm type are dismissed by a business? The model learns to suppress that algorithm's output for that business, but the algorithm still runs globally.
- What happens during the optimization window — are insights still generated? Yes — optimization runs offline; the current active model continues serving until a new model is promoted.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST capture user feedback text when dismissing an Action Center insight, with an option to skip the feedback text while still recording the dismissal as a negative signal.
- **FR-002**: System MUST automatically record a positive correction when a user marks an insight as "actioned" or "reviewed".
- **FR-003**: System MUST store each correction with: insight type, detection algorithm identifier, isUseful flag, optional user feedback text, original insight context (title, description, severity, affected entities), and business identifier.
- **FR-004**: System MUST maintain a readiness gate per algorithm per business: at least 20 corrections with at least 10 unique insight contexts before triggering optimization.
- **FR-005**: System MUST use only corrections from the last 6 months (rolling window) for each optimization run, then split 80/20 into training and validation sets, stratified by insight context category.
- **FR-006**: System MUST quality-gate every new model — a candidate model is promoted only if its accuracy on the held-out validation set exceeds the current active model's accuracy.
- **FR-007**: System MUST maintain model version lifecycle per algorithm per business: candidate → promoted (active) → superseded.
- **FR-008**: System MUST use the optimized DSPy model as a **post-filter relevance classifier**: existing detection algorithms generate candidate insights as today, then the DSPy module classifies each candidate as relevant or noise for the specific business before surfacing. If no promoted model exists for that algorithm+business combination, all candidates are surfaced (current behavior).
- **FR-009**: System MUST run the optimization pipeline on a recurring schedule (weekly) for all algorithms that have reached the readiness gate.
- **FR-010**: System MUST isolate corrections and models per business — one business's feedback never influences another business's insight generation.
- **FR-011**: System MUST audit-log all optimization runs with: algorithm, business, correction count, training/validation split, candidate accuracy, previous accuracy, promotion decision, and timestamp.
- **FR-012**: Before building DSPy modules, the implementing agent MUST analyze each of the 7 detection algorithms and determine which ones genuinely benefit from a self-improvement loop. Algorithms that are pure threshold/business-rule checks (where user feedback doesn't improve the rule) should be excluded from DSPy and handled via configurable thresholds instead.

### Key Entities

- **Correction**: A user feedback record linking an insight to a usefulness signal. Contains the algorithm type, business context, positive/negative flag, optional feedback text, and the original insight snapshot.
- **Model Version**: A trained DSPy model artifact with lifecycle state (candidate/promoted/superseded), accuracy metrics, and a reference to the stored model artifact. Scoped per algorithm per business.
- **Optimization Run**: An audit record of a single training attempt, capturing inputs (correction count, split), outputs (accuracy comparison), and the promotion decision.
- **Detection Algorithm**: One of the 7 (or fewer, after analysis) detection modules that generates Action Center insights. Each algorithm is independently trainable.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can provide dismissal feedback in under 5 seconds (dismiss dialog + optional text input + confirm).
- **SC-002**: After 2 months of active use with 50+ corrections per algorithm, businesses see at least a 30% reduction in dismissed insights compared to the first month (measured as dismiss rate = dismissed / total insights surfaced).
- **SC-003**: 100% of user interactions with insights (dismiss, review, action) are captured as correction records — no feedback is lost.
- **SC-004**: The optimization pipeline completes within 10 minutes per algorithm per business, running weekly without disrupting live insight generation.
- **SC-005**: No cross-business data leakage — corrections from one business are never used to train another business's model (verifiable via audit logs).
- **SC-006**: Model promotion is strictly gated — no model is promoted unless it demonstrably outperforms the previous model on the validation set (verifiable via audit logs showing accuracy comparison for every promotion decision).

## Clarifications

### Session 2026-03-23

- Q: How does the optimized DSPy model change insight generation? → A: Post-filter relevance classifier — algorithms generate candidates as today, DSPy classifies each as relevant/noise before surfacing.
- Q: What is the correction retention window for training? → A: 6-month rolling window — only corrections from the last 6 months are used for optimization runs.
- Q: Which user roles can provide feedback on insights? → A: Finance admin only — the dashboard (and Action Center) is already gated to `finance_admin` permission. Feedback permissions align with existing access control.

## Assumptions

- The existing DSPy optimization infrastructure (Lambda Docker container, S3 model storage, EventBridge scheduling) can be extended to support Action Center modules without significant rearchitecting.
- The existing `actionCenterInsights` table schema can be extended with a `userFeedback` field without migration issues (Convex schema is additive).
- Not all 7 detection algorithms will benefit from DSPy self-improvement. The pre-implementation analysis (FR-012) may reduce the scope to 4-5 algorithms. Pure statistical threshold checks may instead get configurable thresholds exposed in the UI.
- The Convex free-tier bandwidth budget can accommodate the new corrections table and optimization queries, given the EventBridge-first architecture for scheduled jobs.
- Weekly optimization cadence is sufficient — daily would be overkill given the correction accumulation rate for most businesses.
- The existing chat agent DSPy pattern (BootstrapFewShot + MIPROv2 + quality gate + model version lifecycle) is directly applicable to Action Center algorithms.

## Dependencies

- Existing DSPy Lambda Docker container (`finanseal-dspy-optimizer`)
- Existing EventBridge scheduled intelligence infrastructure (`scheduled-intelligence-stack.ts`)
- Existing model version storage (S3 `finanseal-bucket` + Convex `dspy_model_versions` table)
- Existing Action Center detection pipeline (`convex/functions/actionCenterJobs.ts`)
- Issue #320 (vendor item matching DSPy) — already shipped, provides a reference implementation

## Scope Boundaries

**In Scope**:
- Feedback capture UI (dismiss dialog with text input, positive signal on review/action)
- Corrections table and data pipeline
- DSPy modules for qualifying detection algorithms (after pre-implementation analysis)
- Per-business optimization with readiness gate, quality gate, and model lifecycle
- Weekly scheduled optimization via EventBridge
- Audit logging for all optimization decisions

**Out of Scope**:
- Changing the 7 detection algorithms themselves (logic, thresholds, data queries) — this feature adds a learning layer on top of existing algorithms
- Real-time learning (corrections are batched for weekly optimization, not applied immediately)
- Cross-business learning or global model training (each business learns independently)
- UI for viewing optimization history or model performance (can be added later as a DSPy dashboard extension)
- Layer 2b (AI discovery) improvement — this feature focuses on Layer 1 and Layer 2a only
