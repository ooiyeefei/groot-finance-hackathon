# Feature Specification: Self-Improving AI AP 3-Way Matching Engine

**Feature Branch**: `001-dspy-ap-matching`
**Created**: 2026-03-16
**Status**: Draft
**Input**: Upgrade deterministic AP 3-Way Matching (PO ↔ Invoice ↔ GRN) into a self-improving AI engine using DSPy. Add semantic line-item matching, variance diagnosis with reasoning, and a learning loop from user corrections.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — AI Matches What Rules Miss (Priority: P1)

A finance admin uploads an invoice from Supplier X. The invoice uses the code "L32900-001" for an item, but the PO says "HP Spectre Laptop." Tier 1 deterministic matching cannot pair these line items (word-overlap similarity is 0%). The system automatically escalates to Tier 2 AI matching, which semantically understands that "L32900-001" is a vendor-specific product code for "HP Spectre Laptop" — and pairs them with a confidence score and reasoning trace.

**Why this priority**: This is the core value proposition. Without semantic matching, the "long tail" of vendor-specific codes, abbreviations, and alternate descriptions always falls to manual review. This single capability eliminates 60-80% of manual matching work for businesses with diverse vendors.

**Independent Test**: Upload an invoice with vendor-specific item codes that differ from PO descriptions. Verify the system produces AI-powered line-item pairings with confidence scores and reasoning, where Tier 1 would have failed.

**Acceptance Scenarios**:

1. **Given** a PO with line item "HP Spectre Laptop 14-inch" and an invoice with line item "L32900-001 Laptop", **When** Tier 1 matching runs and produces confidence < 0.6, **Then** Tier 2 AI matching is triggered automatically and pairs the items with confidence ≥ 0.7 and a reasoning trace explaining the match.
2. **Given** an invoice where all line items already match via Tier 1 (exact codes or high word-overlap), **When** the match completes, **Then** Tier 2 is NOT invoked (no unnecessary AI cost).
3. **Given** Tier 2 AI matching runs, **When** it produces pairings, **Then** each pairing includes: matched PO line index, invoice line index (one PO line may appear in multiple pairings for partial deliveries), confidence score (0.0-1.0), match method ("ai_semantic"), and a human-readable reasoning trace.
4. **Given** Tier 2 AI is unavailable (Lambda error, timeout), **When** matching runs, **Then** the system gracefully falls back to Tier 1 results only, marks the match as "pending_review", and logs the failure. No data is lost.

---

### User Story 2 — Learning From Corrections (Priority: P1)

A finance admin reviews a match that the AI got wrong — it paired "Printer Toner" with "Paper A4" incorrectly. The admin rejects the AI pairing and manually matches "Printer Toner" to the correct PO line. This correction is automatically captured as training data. Over time, as corrections accumulate (≥20 per business), the system's prompts are optimized to avoid similar mistakes for that vendor and business context.

**Why this priority**: Equal to P1 because without learning, the AI stays static and users lose trust. The feedback loop is what makes this "self-improving" — each correction makes the system smarter for all future matches.

**Independent Test**: Manually override 20+ AI match results. Verify the system captures each correction and, after optimization runs, produces better match accuracy on similar items.

**Acceptance Scenarios**:

1. **Given** a match in "pending_review" status with AI-generated pairings, **When** the admin rejects an AI pairing and manually matches different line items, **Then** a correction record is created capturing: original AI pairing, corrected pairing, vendor name, PO/invoice descriptions, and the admin who made the correction.
2. **Given** a match that the admin approves without changes, **When** the admin clicks "Approve", **Then** the approval is captured as a positive training signal (the AI was correct).
3. **Given** ≥20 corrections exist for a business, **When** the next AI match runs for that business, **Then** recent corrections are included as few-shot examples in the AI prompt, improving accuracy for similar items.
4. **Given** corrections accumulate over time, **When** the weekly optimization job runs, **Then** the system evaluates whether a new optimized model improves accuracy over the current one and only deploys it if accuracy increases.

---

### User Story 3 — Variance Diagnosis With Reasoning (Priority: P2)

A finance admin sees a match with a price variance of RM12.50 between the PO and invoice. Instead of just showing "Price higher by RM12.50", the system provides an AI-generated reasoning trace: "The price difference is RM12.50. The invoice includes an 'unloading fee' line note that was not present in the original PO. This likely accounts for the variance." The admin can quickly decide whether to approve or investigate further.

**Why this priority**: Reduces the time accountants spend investigating variances from minutes to seconds. High-impact UX improvement but depends on P1 (matching) being functional first.

**Independent Test**: Create a 3-way match with intentional price/quantity variances. Verify the AI produces a human-readable explanation identifying potential causes (extra fees, UOM conversions, rounding differences).

**Acceptance Scenarios**:

1. **Given** a match with price variance exceeding the tolerance threshold, **When** the admin opens the match review panel, **Then** the system displays an AI-generated reasoning trace explaining the likely cause of the variance.
2. **Given** a match with quantity variance where the invoice says "2 pallets" and the PO says "96 units", **When** variance diagnosis runs, **Then** the reasoning trace identifies the UOM conversion ("2 pallets × 48 units/pallet = 96 units, quantities match after conversion").
3. **Given** a match with no variances (all within tolerance), **When** the match is created, **Then** no AI diagnosis is invoked (zero cost for clean matches).

---

### User Story 4 — Business Constraints Enforcement (Priority: P2)

The AI matching engine enforces hard business rules that prevent invalid matches from being created. For example: the total invoice amount must reconcile with the PO total after accounting for discounts, taxes, and adjustments. If the math doesn't balance, the AI must identify and explain the discrepancy rather than silently accepting it. Soft constraints nudge the AI to explain unit-of-measure conversions so humans can verify the logic.

**Why this priority**: Ensures accounting integrity. Without constraints, the AI could create matches that violate IFRS standards or basic arithmetic. Depends on the matching engine (P1) existing first.

**Independent Test**: Submit an invoice where line item totals don't sum to the invoice total. Verify the system flags the discrepancy with an explanation rather than creating an invalid match.

**Acceptance Scenarios**:

1. **Given** an invoice where `sum(line_items) ≠ invoice_total`, **When** AI matching runs, **Then** the system retries with a constraint violation message, and if it still can't reconcile, flags the match as "needs_investigation" with an explanation of the discrepancy.
2. **Given** line items with mismatched units of measure (pallets vs units), **When** AI matching runs, **Then** the system includes a note explaining the UOM conversion logic used, so the admin can verify it.
3. **Given** a matched set where all constraints pass (totals balance, UOM consistent), **When** the match is created, **Then** no constraint warnings are shown.

---

### User Story 5 — Performance Dashboard & Cross-Tenant Intelligence (Priority: P3)

The finance admin can view a matching performance dashboard showing: auto-match rate (% of matches that required zero human intervention), average human review time saved, accuracy per vendor, and trend over time. Across all businesses using Groot, the system identifies vendors whose invoices consistently cause matching failures and can push global prompt improvements to help all customers.

**Why this priority**: This is the "moat" — proving ROI to customers and building cross-tenant intelligence. Depends on all prior stories being live to generate meaningful data.

**Independent Test**: After running 50+ matches, verify the dashboard displays accurate metrics. Verify cross-tenant vendor analysis identifies problematic vendors.

**Acceptance Scenarios**:

1. **Given** a business has processed 50+ matches, **When** the admin views the matching dashboard, **Then** they see: auto-match rate (%), matches pending review count, average match confidence, and top 5 vendors by failure rate.
2. **Given** 10+ businesses struggle with invoices from the same vendor, **When** the cross-tenant analysis runs on anonymized aggregate data, **Then** the system identifies the vendor as a "problem vendor" by failure rate. No line-item details or business identifiers are exposed across tenants.
3. **Given** an optimization run improves accuracy, **When** the admin views the dashboard, **Then** they see a before/after accuracy comparison for the latest optimization.

---

### Edge Cases

- What happens when an invoice references a PO number that doesn't exist in the system? → System logs a "PO not found" warning and skips Tier 2 AI matching (no point matching without a PO).
- What happens when Tier 2 AI returns confidence below 0.5 for all pairings? → All pairings are discarded, match status set to "pending_review" with a note "AI could not find reliable matches — manual review required."
- What happens when the DSPy Lambda times out (>30s)? → Tier 1 results are used as-is. The match is created with Tier 1 confidence scores and flagged for review. A retry can be triggered manually.
- What happens when a vendor sends an invoice with items not on the PO at all (e.g., unsolicited extras)? → AI flags unmatched invoice lines as "no PO line found" with reasoning. These appear in the review panel for the admin to accept or reject.
- What happens when a business has <20 corrections (insufficient training data)? → System uses base AI prompts without few-shot examples. Confidence is capped at 0.80 to signal lower certainty.
- What happens when the weekly optimization produces a worse model? → The system keeps the current model active. The failed optimization is logged with before/after accuracy for debugging. No regression is deployed.
- What happens when two invoice lines could match the same PO line? → This is a valid partial delivery scenario (1:many). AI assigns both invoice lines to the same PO line if their combined quantity does not exceed the PO quantity (plus tolerance). If quantities exceed the PO line, the lower-confidence pairing is flagged as "over-invoiced" for review.
- What happens when a business hits its monthly AI call cap? → Tier 2 is skipped for the remainder of the month. Matches fall back to Tier 1 only, flagged as "pending_review" with a message "AI matching quota reached — upgrade plan for more." Counter resets on the 1st of the next month.

## Requirements *(mandatory)*

### Functional Requirements

**Tier 2 AI Matching Engine**

- **FR-001**: System MUST invoke Tier 2 AI matching when Tier 1 deterministic matching produces any line-item pairing with confidence < 0.6, or when the overall match status is "pending_review".
- **FR-002**: System MUST NOT invoke Tier 2 AI when all Tier 1 pairings have confidence ≥ 0.6 and no variances exceed tolerance thresholds.
- **FR-003**: Tier 2 AI MUST accept as input: PO line items (description, item code, quantity, unit price), invoice line items (description, item code, quantity, unit price), GRN line items (if available), vendor name, and any existing Tier 1 pairings.
- **FR-004**: Tier 2 AI MUST output for each pairing: PO line index, invoice line index, GRN line index (if 3-way), confidence score (0.0-1.0), match method ("ai_semantic"), and a human-readable reasoning trace.
- **FR-005**: System MUST support 1:many line-item matching — one PO line can be matched to multiple invoice lines (covering partial deliveries/split invoices). Each invoice line maps to at most one PO line. The system MUST validate that the sum of matched invoice line quantities does not exceed the PO line quantity (plus tolerance).
- **FR-006**: System MUST gracefully fall back to Tier 1 results when Tier 2 is unavailable, with the match flagged as "pending_review".
- **FR-007**: Tier 2 AI confidence MUST be capped at 0.80 when no optimized model exists for the business (base prompts only).

**Correction Feedback Loop**

- **FR-008**: System MUST capture a correction record when an admin rejects an AI pairing and manually matches different line items.
- **FR-009**: System MUST capture a positive training signal when an admin approves a match without changes.
- **FR-010**: Each correction record MUST include: business ID, vendor name, original AI pairing (PO line description + invoice line description + confidence), corrected pairing, correction type (rejection, override, approval), and the admin who made the correction.
- **FR-011**: System MUST include the most recent corrections (up to 50) as few-shot examples in Tier 2 AI prompts when ≥20 corrections exist for the business.
- **FR-012**: System MUST track a `lastCorrectionId` per business model to prevent re-optimization on the same data.

**Variance Diagnosis**

- **FR-013**: System MUST generate AI reasoning traces for any variance that exceeds the configured tolerance thresholds (quantity or price).
- **FR-014**: Reasoning traces MUST identify potential causes: extra fees, UOM conversions, rounding differences, discount discrepancies, or missing line items.
- **FR-015**: Reasoning traces MUST be stored on the match record and displayed in the match review panel.

**Business Constraints**

- **FR-016**: System MUST enforce a hard constraint that `sum(matched_invoice_line_totals)` reconciles with the invoice total within a configurable tolerance (default ±1%).
- **FR-017**: System MUST enforce a hard constraint that matched account codes / line references are valid (exist in the PO).
- **FR-018**: System SHOULD include a soft constraint nudging the AI to explain any UOM conversions used in matching logic.
- **FR-019**: When a hard constraint fails after retries, the match MUST be flagged as "needs_investigation" with the constraint violation details.

**AI Cost Control**

- **FR-028**: System MUST enforce a per-business monthly cap on Tier 2 AI matching calls: 150 calls/month on Starter plan, 500 calls/month on Pro plan, unlimited on Enterprise (custom pricing).
- **FR-029**: System MUST display the current month's AI call usage count on the AP matching dashboard so admins can monitor consumption.
- **FR-030**: When a business reaches its monthly AI call cap, Tier 2 MUST be skipped — Tier 1 results are used as-is and the match is flagged "pending_review" with a note indicating the AI quota has been reached.
- **FR-031**: AI call counters MUST reset on the first day of each calendar month.

**Optimization Pipeline**

- **FR-020**: System MUST run a weekly optimization job that evaluates whether a new model improves accuracy over the current active model.
- **FR-021**: Optimization MUST only run when ≥20 corrections exist AND ≥10 unique item descriptions exist for the business (prevents overfitting).
- **FR-022**: Optimization MUST use an 80/20 train/test split and only deploy a new model if test accuracy improves.
- **FR-023**: System MUST version all optimized models with metadata: accuracy, training examples count, optimization timestamp, and last correction ID consumed.
- **FR-024**: System MUST support manual optimization triggers by admins (in addition to the weekly cron).

**Performance Dashboard**

- **FR-025**: System MUST display on the AP matching dashboard: auto-match rate (%), matches pending review, average match confidence, and top 5 vendors by failure rate.
- **FR-026**: System MUST track per-match metadata: tier used (1 or 2), AI model version, time to match, and whether human intervention was needed.
- **FR-027**: System MUST support cross-tenant vendor analysis using anonymized aggregate metrics only (vendor failure rates, average match confidence per vendor). No line-item descriptions, amounts, or business identifiers are shared across tenants. Individual business corrections remain fully isolated.

### Key Entities

- **PO Match Correction**: A record of a human correction to an AI-generated match pairing. Links to a specific match, captures original and corrected pairings, vendor context, and the correcting user. Used as training data for the learning loop.
- **AI Match Result**: The output of Tier 2 AI matching — line-item pairings with confidence scores, reasoning traces, and the model version used. Stored alongside the existing `po_matches` record.
- **DSPy Model Version** (existing entity, extended): Tracks optimized AI models per business for the "po_matching" domain. Stores S3 key, accuracy metrics, training data count, and activation status.
- **Matching Performance Metrics**: Aggregated statistics per business: auto-match rate, human review rate, average confidence, vendor-specific failure rates. Computed from match records.

### Assumptions

- The existing Tier 1 deterministic matching in `poMatches.ts` remains unchanged — Tier 2 is additive, never replaces Tier 1.
- The existing DSPy Python Lambda infrastructure (`fee-classifier-python`) will be extended with a new route rather than deploying a separate Lambda, to minimize infrastructure cost.
- Gemini 3.1 Flash-Lite is the LLM for Tier 2 matching (consistent with bank recon and fee classification).
- The weekly optimization cron follows the same pattern as bank recon (Sunday schedule, staggered by 1 hour).
- Per-business model isolation: each business gets its own optimized model, trained on its own corrections. Cross-tenant intelligence uses anonymized aggregates only (vendor failure rates, avg confidence) — no line-item details or business identifiers cross tenant boundaries.
- Correction threshold of 20 aligns with bank recon's proven threshold. Below 20, base prompts are used with confidence capped at 0.80.

## Clarifications

### Session 2026-03-16

- Q: For cross-tenant vendor analysis (FR-027), what data can be shared across tenants? → A: Anonymized aggregates only — vendor failure rates, avg confidence. No line-item descriptions, amounts, or business identifiers.
- Q: Should there be a cost control mechanism for Tier 2 AI calls? → A: Per-business monthly cap tied to plan: Starter 150/month, Pro 500/month, Enterprise unlimited (custom pricing). Admin sees usage on dashboard.
- Q: Should line-item matching support partial deliveries (one PO line → multiple invoice lines)? → A: Yes, 1:many supported (one PO line can match multiple invoice lines). Each invoice line still maps to at most one PO line. Sum of matched quantities must not exceed PO quantity plus tolerance.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Tier 2 AI matching resolves at least 50% of Tier 1 "pending_review" cases without human intervention within 3 months of deployment.
- **SC-002**: Average time for a finance admin to review and approve/reject a match decreases by 40% (from current baseline) due to AI reasoning traces.
- **SC-003**: After 100+ corrections per business, the optimized model achieves ≥80% accuracy on held-out test sets (matching the correct line-item pairing).
- **SC-004**: System completes Tier 2 AI matching for a typical invoice (5-10 line items) in under 5 seconds.
- **SC-005**: Zero regressions: weekly optimization never deploys a model with lower accuracy than the current active model.
- **SC-006**: The matching performance dashboard shows measurable improvement trends (increasing auto-match rate, decreasing pending review rate) over a 90-day period for businesses with active usage.
- **SC-007**: Cross-tenant vendor analysis identifies at least 3 "problem vendors" within the first 6 months of multi-tenant deployment.
