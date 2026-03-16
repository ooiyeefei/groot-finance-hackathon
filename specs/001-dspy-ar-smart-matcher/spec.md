# Feature Specification: DSPy Smart Matcher for AR Order-to-Invoice Reconciliation

**Feature Branch**: `001-dspy-ar-smart-matcher`
**Created**: 2026-03-16
**Status**: Draft
**Input**: User description: "DSPy Smart Matcher for AR Order-to-Invoice Reconciliation — Tier 2 AI matching layer that replaces hardcoded weights in runMatching() with a self-improving DSPy pipeline."

## Clarifications

### Session 2026-03-16

- Q: Should high-confidence Tier 2 matches auto-confirm or always require user review? → A: All Tier 2 matches require manual user review regardless of confidence. The UI must highlight matches needing review with visual cues (confidence-based color coding, reasoning previews) and support checkbox-based bulk approve to minimize friction.
- Q: What is the maximum number of invoices in a single split match (1-to-N)? → A: Cap at 5 invoices per split match. Covers 99% of real-world bundled payments while keeping AI search space manageable. Users can manually match beyond 5.
- Q: When does Tier 2 trigger — automatically after Tier 1 or on-demand? → A: Automatic. Tier 2 runs immediately after Tier 1 completes as part of the import flow. Users see all results (Tier 1 confirmed + Tier 2 suggestions) in one step.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - AI-Assisted Fuzzy Matching for Unmatched Orders (Priority: P1)

When a batch of sales orders is imported and the deterministic Tier 1 matcher (exact reference + amount) leaves orders unmatched, the system automatically escalates them to a Tier 2 AI matcher. The AI matcher uses learned patterns from previous user corrections to evaluate customer name similarity (including phonetic/nickname matching like "Fei" → "Groot Tech"), amount proximity, date proximity, and contextual signals. Each match includes a reasoning trace explaining *why* the AI chose this match, so the finance user can approve or reject with confidence.

**Why this priority**: This is the core value proposition — the 60-80% of orders that Tier 1 handles stay fast and free, while the "long tail" of fuzzy matches gets AI assistance instead of manual hunting. Without this, the other pillars have nothing to optimize.

**Independent Test**: Can be fully tested by importing a CSV with known fuzzy-match scenarios (nickname customers, slight amount variances, date offsets) and verifying the AI returns ranked matches with reasoning traces.

**Acceptance Scenarios**:

1. **Given** a batch of 50 imported sales orders where 35 matched via Tier 1 (exact reference), **When** the system processes the remaining 15, **Then** the Tier 2 AI matcher evaluates each unmatched order against all unclaimed invoices and returns ranked match suggestions with confidence scores and reasoning traces.
2. **Given** an order from customer "Fei" and an invoice for "Groot Tech Sdn Bhd," **When** the AI matcher processes this pair, **Then** the reasoning trace identifies "Fei" as a known alias/contact for "Groot Tech" based on previous user-approved matches, and the confidence score reflects this learned association.
3. **Given** an order for RM 1,000.00 and an invoice for RM 998.50 (bank fee deducted), **When** the AI matcher evaluates this pair, **Then** the match is suggested with reasoning explaining the RM 1.50 variance as a likely bank processing fee, and the confidence remains high (above 0.85).
4. **Given** no prior corrections exist for a business (cold start), **When** Tier 2 processes unmatched orders, **Then** the system uses a base model with capped confidence (maximum 0.80) and clearly indicates "AI — no prior learning" in the match method.
5. **Given** Tier 2 has produced 12 match suggestions for a batch, **When** the user views the reconciliation table, **Then** AI-suggested matches are visually highlighted with confidence-based color coding (high/medium/low), a condensed reasoning preview is visible inline, and checkboxes allow the user to select multiple matches and bulk-approve them in one action.
6. **Given** a user selects 8 high-confidence AI matches via checkboxes, **When** they click "Approve Selected," **Then** all 8 matches are confirmed simultaneously, their status updates to "matched," and any match the user did NOT select remains as "suggested — pending review."

---

### User Story 2 - Learning from User Corrections (Priority: P1)

When a finance user manually matches an order to an invoice that the AI missed or incorrectly matched, the system captures this as a "gold example" correction. These corrections feed the AI training pipeline: after 20+ corrections, the system uses BootstrapFewShot for inline training; after 100+ corrections, weekly MIPROv2 optimization automatically tunes the matching heuristics. Over time, the system learns each business's specific patterns — customer aliases, payment habits, typical fee deductions — and match accuracy improves without any manual rule creation.

**Why this priority**: Equal to P1 because the learning loop is what makes this a "moat" — without it, the AI is a static model that doesn't improve. The correction capture mechanism must be built alongside the matcher itself.

**Independent Test**: Can be tested by making 5 manual corrections, then re-running matching on similar orders to verify the model uses corrections as few-shot examples in its reasoning.

**Acceptance Scenarios**:

1. **Given** the AI suggested matching Order-042 to Invoice-110, **When** the user rejects this and manually links Order-042 to Invoice-112, **Then** a correction record is created capturing: the original suggestion, the user's chosen match, the order details, the invoice details, and the user who made the correction.
2. **Given** 25 corrections exist for a business, **When** a new batch triggers Tier 2 matching, **Then** the AI uses BootstrapFewShot with up to 8 of the most relevant corrections as few-shot examples, and the reasoning traces reference learned patterns (e.g., "Based on 3 prior corrections, 'ABC Trading' payments typically arrive via Maybank with 2-day delay").
3. **Given** 100+ corrections exist with 15+ unique customer names, **When** the weekly optimization runs, **Then** MIPROv2 generates optimized prompts and the new model version is only activated if test accuracy exceeds the previous version.
4. **Given** a user corrects a match, **When** the correction is saved, **Then** the system does NOT re-run matching on the entire batch — it only records the correction for future training.

---

### User Story 3 - N-to-N and Partial Payment Matching (Priority: P2)

When a single bank payment covers multiple invoices (bundled payment), or when a payment partially covers an invoice, the AI matcher can identify and suggest these complex match patterns. The system proposes "split matches" where one payment maps to N invoices, with reasoning explaining why the amounts add up. For partial payments, the system tracks the remaining balance and suggests the invoice is partially settled.

**Why this priority**: N-to-N matching is a common real-world pattern in SE Asian SME payments (e.g., a distributor pays 3 invoices in one transfer). Without this, users must manually split and match — the most time-consuming reconciliation task.

**Independent Test**: Can be tested by creating a payment of RM 3,000 and three invoices of RM 1,000 each for the same customer, then verifying the AI suggests a 1-to-3 split match.

**Acceptance Scenarios**:

1. **Given** a payment of RM 3,150 from "ABC Corp" and three open invoices (RM 1,000, RM 1,050, RM 1,100) totaling RM 3,150, **When** the AI processes this payment, **Then** it suggests a 1-to-3 split match with reasoning: "Payment amount exactly equals the sum of invoices #201, #202, #203 for customer ABC Corp."
2. **Given** a payment of RM 500 against an invoice of RM 1,200, **When** the AI processes this, **Then** it suggests a partial payment match with reasoning explaining the RM 700 remaining balance, and the invoice status updates to "partially paid."
3. **Given** a payment amount exceeds the sum of all matched invoices by more than a configurable tolerance, **When** the AI detects an overpayment, **Then** it suggests matching the known invoices and flags the excess amount for user review with a note: "Possible advance payment or credit note."

---

### User Story 4 - Reconciliation Integrity Constraints (Priority: P2)

The AI matcher enforces business rules that protect accounting integrity. Hard constraints (Asserts) cause the AI to retry with different reasoning if violated — e.g., matched amounts must balance within tolerance. Soft constraints (Suggests) guide the AI toward better matches without blocking — e.g., preferring matches where customer names align. These constraints prevent the AI from producing matches that would create accounting errors.

**Why this priority**: Without integrity constraints, AI-suggested matches could produce unbalanced journal entries when posted. This is a safety net, not a feature users interact with directly, but it's critical for trust.

**Independent Test**: Can be tested by presenting the AI with scenarios where the only possible "high-confidence" match violates a constraint (e.g., amounts don't balance) and verifying the AI downgrades confidence or rejects the match.

**Acceptance Scenarios**:

1. **Given** the AI attempts to match a payment of RM 1,000 to invoices totaling RM 1,200, **When** the balance assertion fires, **Then** the AI retries with different invoice combinations or reports "no valid match found" rather than suggesting an unbalanced match.
2. **Given** a match where customer names don't align but amounts match exactly, **When** the suggestion constraint fires, **Then** the AI still allows the match but reduces confidence and adds a reasoning note: "Amount match is exact but customer names differ — verify manually."
3. **Given** a payment exceeds the matched invoice total, **When** the overpayment suggestion fires, **Then** the AI reasoning includes: "Consider checking for related orders or advance payments" and flags the excess for review.

---

### User Story 5 - Matching Performance Dashboard (Priority: P3)

Finance managers can view a dashboard showing how the AI matcher is performing over time: auto-match rate (percentage of orders matched without human intervention), correction rate (how often users override AI suggestions), and estimated time saved. This data helps justify the AI investment and identifies areas where the model needs more training data.

**Why this priority**: This is a reporting/visibility feature — valuable for ROI justification but not required for the matcher to function. The underlying metrics collection (P1/P2) enables this, so the dashboard can be built later.

**Independent Test**: Can be tested by running 3 batches with known match/correction outcomes, then verifying the dashboard displays accurate aggregate metrics.

**Acceptance Scenarios**:

1. **Given** a business has processed 500 orders over the past month with 400 auto-matched (Tier 1 + Tier 2 confirmed), 80 manually corrected, and 20 still unmatched, **When** the manager views the dashboard, **Then** they see: Auto-Match Rate: 80%, Correction Rate: 16%, Unmatched: 4%.
2. **Given** three months of data showing auto-match rate improving from 65% to 85%, **When** the manager views the trend, **Then** a time-series chart shows the improvement trajectory correlated with correction count growth.
3. **Given** the dashboard data, **When** the manager exports a summary, **Then** it includes: total orders processed, matches by tier (Tier 1 vs Tier 2), average confidence score, and estimated hours saved (based on average 2-minute manual match time per order).

---

### Edge Cases

- What happens when a business has zero invoices to match against? The matcher should skip Tier 2 and mark all orders as "unmatched — no invoices available."
- How does the system handle duplicate corrections (user corrects the same order-invoice pair twice)? The latest correction should overwrite the previous one.
- What happens when the AI Lambda times out mid-batch? The system should mark unprocessed orders as "unmatched" and allow retry, not leave them in a limbo state.
- How does the system handle currency mismatches between orders and invoices? Orders and invoices in different currencies should not be matched unless explicitly linked by the user.
- What happens when a previously trained model performs worse after new corrections are added? The accuracy-gating mechanism ensures the old model stays active and the new model is marked "failed."
- How does the system handle orders with no customer name (anonymous/cash sales)? Customer similarity score should be set to 0, and matching relies entirely on amount and date signals.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST keep the existing deterministic matching (exact reference + amount tolerance) as Tier 1, running first on every batch with zero AI cost.
- **FR-002**: System MUST automatically escalate unmatched orders to a Tier 2 AI matcher immediately after Tier 1 completes — no manual trigger required. The user sees Tier 1 confirmed matches and Tier 2 suggestions together in one view.
- **FR-003**: System MUST return a reasoning trace for every Tier 2 match explaining why the match was chosen (customer similarity, amount proximity, date alignment, learned patterns).
- **FR-004**: System MUST capture user corrections (manual match overrides) as training examples, storing: original AI suggestion, user's chosen match, order details, invoice details, correcting user, and timestamp.
- **FR-005**: System MUST use captured corrections as few-shot learning examples when 20+ corrections exist for a business, improving match accuracy inline.
- **FR-006**: System MUST run periodic optimization when 100+ corrections exist with 15+ unique customer names, producing optimized matching heuristics with accuracy gating (new model only activates if accuracy improves).
- **FR-007**: System MUST enforce a hard constraint that matched invoice amounts balance against the payment amount within a configurable tolerance (default: 5.00 units or 1.5% of payment amount, whichever is greater).
- **FR-008**: System MUST apply a soft constraint to check for related orders when a payment exceeds matched invoices, guiding the AI to consider split/bundled payment scenarios.
- **FR-009**: System MUST support 1-to-N matching (one payment to multiple invoices) where the AI can propose split matches with per-invoice allocation, capped at a maximum of 5 invoices per split match. Matches beyond 5 invoices require manual user linking.
- **FR-010**: System MUST support partial payment detection where a payment covers less than the full invoice amount, tracking the remaining balance.
- **FR-011**: System MUST cap AI confidence at 0.80 when no prior corrections exist for a business (cold-start safeguard).
- **FR-012**: System MUST track matching metrics per business: total orders processed, Tier 1 matches, Tier 2 matches, user corrections, auto-match rate, and average confidence score.
- **FR-013**: System MUST version all trained models with an audit trail: model version, training examples count, accuracy score, optimizer type, and activation status.
- **FR-014**: System MUST NOT re-run matching on an entire batch when a single correction is made — corrections are recorded for future training only.
- **FR-015**: System MUST handle AI service timeouts gracefully by marking unprocessed orders as "unmatched" and allowing manual retry.
- **FR-016**: All Tier 2 match suggestions MUST require explicit user approval before being confirmed — no auto-accept regardless of confidence score.
- **FR-017**: System MUST display Tier 2 suggestions with confidence-based visual highlighting (color-coded high/medium/low), inline reasoning preview, and checkbox selection for bulk approval.
- **FR-018**: System MUST support bulk approve — users can select multiple AI-suggested matches via checkboxes and confirm them in a single action.

### Key Entities

- **Order Matching Correction**: A record of a user overriding an AI-suggested match. Captures the original suggestion (order + suggested invoice + confidence), the user's chosen match (order + correct invoice), business context (customer names, amounts, dates), and metadata (who corrected, when). Used as training data for the learning pipeline.
- **Matching Model Version**: A versioned snapshot of the trained AI matching model for a specific business. Tracks: version number, storage location, training data size, accuracy score, optimizer type (bootstrap/miprov2), activation status (active/inactive/failed), and link to previous version.
- **Matching Metrics**: Aggregate performance data per business per time period. Tracks: orders processed, matches by tier, corrections made, auto-match rate, average confidence, and estimated time saved.
- **Match Suggestion**: A Tier 2 AI output proposing a match between an order and one or more invoices. Contains: confidence score, reasoning trace, matched invoice(s) with allocated amounts, constraint satisfaction results, and the model version used.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Auto-match rate (Tier 1 + confirmed Tier 2) reaches 85% within 3 months for businesses with 50+ corrections, up from the current ~70% Tier 1-only rate.
- **SC-002**: Average time to reconcile a batch of 100 orders decreases by 40% compared to manual-only matching (measured by time from batch import to period close).
- **SC-003**: Tier 2 match precision (percentage of AI suggestions confirmed by users without correction) exceeds 75% after the first 50 corrections for a business.
- **SC-004**: Zero unbalanced journal entries are created from AI-suggested matches (integrity constraint enforcement is 100% effective).
- **SC-005**: User correction rate for Tier 2 suggestions decreases month-over-month as the model learns, demonstrating self-improvement.
- **SC-006**: Cold-start businesses (zero corrections) receive useful match suggestions within 3 seconds per order, with no false-positive matches above 0.80 confidence.
- **SC-007**: The system processes Tier 2 matching for a batch of 50 unmatched orders within 60 seconds total (including AI round-trips).

## Assumptions

- The existing Tier 1 matching logic (exact reference + amount tolerance) is stable and will not be modified — Tier 2 is purely additive.
- Sales orders and invoices are in the same currency within a matching batch (cross-currency matching is out of scope).
- The AI inference infrastructure already exists and can be extended with new endpoints — no new infrastructure provisioning is needed.
- User corrections are relatively rare events (1-5% of matches) and do not require real-time model retraining — batch optimization is sufficient.
- The periodic optimization schedule can be extended to include AR matching optimization alongside existing optimization workloads.
- Business users understand the concept of "AI-suggested matches with confidence scores" from existing AI-assisted features, so no new UX paradigm is needed.
- Configurable tolerance defaults (5.00 units or 1.5%) are reasonable for SE Asian SME transactions — users should be able to adjust these per business.

## Scope Boundaries

### In Scope
- Tier 2 AI matching for unmatched orders after Tier 1 runs
- Reasoning traces on every AI match
- Correction capture and learning pipeline (few-shot + periodic optimization)
- Hard and soft constraints for reconciliation integrity
- 1-to-N split matching and partial payment detection
- Matching metrics collection and basic dashboard display
- Model versioning with accuracy gating

### Out of Scope
- Modifying the existing Tier 1 deterministic matching logic
- Cross-currency order-to-invoice matching
- Real-time model retraining on each correction (batch-only)
- Automated period closing based on AI confidence (users must still approve)
- Integration with external credit reference systems for customer identity resolution
- Mobile-specific UI for the matching dashboard
