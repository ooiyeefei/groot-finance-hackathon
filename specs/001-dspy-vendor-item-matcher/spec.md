# Feature Specification: DSPy Vendor Item Matcher

**Feature Branch**: `001-dspy-vendor-item-matcher`
**Created**: 2026-03-17
**Status**: Draft
**Input**: User description: "DSPy Tier 2 vendor item matching for Smart Vendor Intelligence (#320). Add the 5 DSPy components for cross-vendor item matching — self-improving fuzzy matching where user confirmations/rejections become training data that generalizes to new items."
**Parent Feature**: Smart Vendor Intelligence (#320)

## Clarifications

### Session 2026-03-17

- Q: When does cross-vendor matching run? → A: Hybrid — on-demand "Suggest Matches" button on Price Intelligence page + lightweight auto-suggest after invoice processing when a new vendor's items closely match an existing group. No separate ticket needed for "more automated" — the auto-suggest path is built in from day one; just remove frequency throttle when bandwidth allows on Pro plan.

- Q: Should the system match items across different currencies? → A: Yes, match across currencies. Items are the same product regardless of pricing currency. The comparison table shows currency per row. SE Asian businesses routinely buy from vendors in MYR, SGD, USD — restricting to same-currency would miss the most valuable comparisons.

- Q: How should rejected item pairs be tracked to prevent re-suggestion? → A: Normalized description pairs — block matches where both descriptions normalize to the same pair (lowercase, trim, collapse whitespace). Not exact string (misses case variants) and not semantic dedup (overkill — DSPy model learns to avoid similar patterns via BootstrapFewShot negative examples).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - AI-Suggested Cross-Vendor Item Matches (Priority: P1)

As a finance manager, I want the system to automatically suggest when items from different vendors are the same product (e.g., "M8 STEEL BOLT" from Vendor A and "BOLT-M8-SS" from Vendor B), so I can compare prices across vendors without manually grouping every item.

**Why this priority**: This is the core intelligence feature. Without AI-suggested matches, users must manually identify equivalent items across dozens of vendors — a tedious, error-prone process that defeats the purpose of automated price comparison. This directly enables the cross-vendor comparison table (US3 of #320).

**Independent Test**: Process invoices from 2+ vendors containing similar items with different naming conventions. Verify system suggests item matches with confidence scores. Verify matches appear in the cross-vendor comparison UI.

**Acceptance Scenarios**:

1. **Given** Vendor A invoices contain "M8 STEEL BOLT" and Vendor B invoices contain "BOLT-M8-SS", **When** the system analyzes price history across vendors, **Then** it suggests these are the same item with a confidence score and reasoning explaining the match (e.g., "Both describe M8 specification steel bolts — different naming convention").

2. **Given** a vendor's item description is "Office Paper A4 80gsm" and another vendor has "A4 Copy Paper 80g/m2", **When** the system runs cross-vendor matching, **Then** it suggests a match because the specifications (A4, 80gsm) are semantically equivalent despite different phrasing.

3. **Given** a vendor sells "Printer Ink Cartridge Black" and another sells "Toner Cartridge Black HP", **When** the system evaluates the match, **Then** it correctly identifies these as DIFFERENT items (ink cartridge vs toner cartridge) and does NOT suggest a match, demonstrating it understands domain-specific distinctions.

4. **Given** an invoice is processed containing a new item from Vendor C, **When** the system detects the item description closely matches an existing cross-vendor group, **Then** it auto-suggests the match (lightweight trigger after invoice processing) without requiring the user to click "Suggest Matches."

5. **Given** a business has fewer than 5 price history records across all vendors, **When** the system is asked to suggest matches, **Then** it returns no suggestions and displays "Not enough data — at least 5 items from 2+ vendors needed" rather than producing low-quality matches.

6. **Given** the system has no pre-trained model (fresh deployment), **When** it generates match suggestions, **Then** confidence scores are capped at 80% (indicating base model without user-validated training data) and suggestions include a note: "Confidence will improve as you confirm or reject matches."

---

### User Story 2 - Learning from User Corrections (Priority: P2)

As a finance manager, when I confirm or reject an AI-suggested cross-vendor item match, I want the system to learn from my decision so that future suggestions become more accurate for my business's specific item naming patterns.

**Why this priority**: The learning loop is what transforms this from a static matching tool into a self-improving AI moat. Without it, the system never gets smarter — it makes the same mistakes repeatedly. Each user correction should make the system better for ALL similar items, not just memorize the specific correction.

**Independent Test**: Confirm/reject 5+ matches. Verify the system's next batch of suggestions reflects learned patterns (e.g., after confirming that "Steel Bolt" patterns match across vendors, similar bolt descriptions get higher confidence).

**Acceptance Scenarios**:

1. **Given** a user confirms that "M8 STEEL BOLT" matches "BOLT-M8-SS", **When** the correction is recorded, **Then** the system stores the correction as a training example with both descriptions, vendor IDs, and the ground truth (match=true).

2. **Given** a user rejects a suggested match between "Printer Ink Cartridge" and "Toner Cartridge", **When** the correction is recorded, **Then** the system stores it as a negative training example (match=false) and will not re-suggest the same pairing.

3. **Given** 20+ corrections have been recorded for a business, **When** the next match suggestion runs, **Then** the system uses BootstrapFewShot to compile recent corrections into few-shot examples, improving suggestion accuracy beyond the base model.

4. **Given** a user has confirmed several "bolt" matches across vendors, **When** a new vendor submits an invoice with "HEX BOLT M10 STAINLESS", **Then** the system generalizes from prior bolt-matching patterns and suggests matches with other bolt items at higher confidence (demonstrating generalization, not memorization).

5. **Given** a correction contradicts a previous correction (user changes their mind), **When** the newer correction is recorded, **Then** the most recent correction takes precedence and the older one is superseded in training data.

---

### User Story 3 - Weekly Model Optimization (Priority: P3)

As a system administrator, I want the matching model to automatically optimize itself weekly using accumulated user corrections, so that match quality continuously improves without manual intervention.

**Why this priority**: While inline BootstrapFewShot (P2) provides immediate improvement, MIPROv2 optimization produces a significantly better model by optimizing prompts holistically across all corrections. This is the "compound interest" of the learning loop — each weekly optimization builds on all prior corrections.

**Independent Test**: Accumulate 20+ corrections. Trigger optimization. Verify new model version is created and activated. Verify subsequent suggestions use the optimized model with higher baseline accuracy.

**Acceptance Scenarios**:

1. **Given** a business has accumulated 20+ corrections with at least 10 unique item description pairs, **When** the weekly optimization check runs, **Then** MIPROv2 trains a new model, saves it to persistent storage, and records the model version with accuracy metrics.

2. **Given** a business has only 15 corrections (below the 20 threshold), **When** the optimization check runs, **Then** the system skips optimization for this business and logs "Insufficient corrections (15/20 required)."

3. **Given** a newly optimized model has lower accuracy than the current active model, **When** the accuracy comparison runs, **Then** the system rejects the new model and keeps the existing one active, logging "New model rejected: accuracy 0.72 < current 0.85."

4. **Given** a new model is successfully activated, **When** the next match suggestion runs, **Then** it loads the optimized model and confidence scores are no longer capped at 80% (the cap only applies to base/unoptimized models).

5. **Given** an optimized model exists but a new batch of corrections arrives, **When** inline BootstrapFewShot runs, **Then** it augments the optimized model with the latest corrections (not replacing it), combining the optimized prompt with recent few-shot examples.

---

### Edge Cases

- **What happens when item descriptions are in multiple languages?** The system should match based on semantic meaning, not exact language. "Kertas A4" (Malay) and "A4 Paper" (English) should match if specifications align. The reasoning should note the cross-language match.

- **What happens when the same vendor has inconsistent naming for the same item?** The system only matches items ACROSS vendors, not within a vendor. Within-vendor item linking uses the existing Tier 1 Jaccard fuzzy matching from #320.

- **What happens when two items have similar descriptions but different specifications?** The system should NOT match items where specifications differ materially (e.g., "M8 Bolt" vs "M10 Bolt" — different sizes). Assert constraints enforce that matched items must have compatible specifications when detectable.

- **What happens when the optimization Lambda fails or times out?** The system falls back to the previous active model version. If no model exists, it uses the base classifier with 80% confidence cap. The failed optimization attempt is logged with error details for debugging.

- **What happens when a correction is recorded for an already-optimized model?** The correction is stored normally. It will be included in the next optimization cycle. Meanwhile, inline BootstrapFewShot uses it immediately for the next suggestion.

- **What happens when matched items are priced in different currencies?** The system matches across currencies — items are the same product regardless of pricing currency. The comparison table displays each vendor's currency alongside the price. No automatic exchange rate conversion is applied; users see raw prices in original currencies.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST analyze item descriptions across different vendors and suggest potential matches using AI-powered semantic reasoning (not just string similarity).

- **FR-002**: System MUST provide a confidence score (0-100%) and human-readable reasoning for each suggested match, explaining WHY the items are considered equivalent.

- **FR-003**: System MUST enforce that suggested matches are only between items from DIFFERENT vendors (never within the same vendor).

- **FR-004**: System MUST enforce that matched items have compatible specifications when specifications are detectable from descriptions (e.g., M8 vs M10 bolt sizes should NOT match).

- **FR-005**: System MUST cap confidence scores at 80% when no business-specific optimized model exists (base model without user-validated training data).

- **FR-006**: System MUST record user confirmations and rejections of suggested matches as training examples, storing: both item descriptions, vendor IDs, match result (true/false), and timestamp.

- **FR-007**: System MUST prevent re-suggesting item pairs that the user has previously rejected. Rejection matching uses normalized description pairs (lowercase, trimmed, collapsed whitespace) so that trivial case/spacing variants of the same rejection are also blocked.

- **FR-008**: System MUST use BootstrapFewShot to compile recent corrections into few-shot examples when 20+ corrections exist, improving suggestion accuracy inline (without waiting for weekly optimization).

- **FR-009**: System MUST run weekly optimization (MIPROv2) when a business has accumulated 20+ corrections with at least 10 unique item description pairs.

- **FR-010**: System MUST compare new model accuracy against the current active model and only activate the new model if accuracy improves (accuracy gating).

- **FR-011**: System MUST support model rollback — if a newly activated model performs poorly, the previous version can be restored.

- **FR-012**: System MUST require a minimum of 5 items from at least 2 vendors before generating any match suggestions.

- **FR-013**: System MUST generalize learned patterns to new items (e.g., learning that vendor naming conventions differ for bolts should improve matching for screws from the same vendors).

- **FR-014**: When a newer correction contradicts an older one for the same item pair, the system MUST use the most recent correction as ground truth.

### Key Entities

- **Item Match Suggestion**: A proposed equivalence between two items from different vendors. Attributes: item descriptions (A and B), vendor IDs (A and B), confidence score, reasoning, match source (base model or optimized model), model version used.

- **Item Match Correction**: A user's confirmation or rejection of a suggested match. Attributes: both item descriptions, vendor IDs, ground truth (match=true or match=false), corrected by user ID, timestamp, supersedes previous correction flag.

- **Model Version**: A trained DSPy model checkpoint. Attributes: version number, platform identifier ("vendor_item_matching"), storage key, accuracy score, training example count, optimizer type (bootstrap_fewshot or miprov2), trained timestamp, status (active/inactive/failed).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: System suggests cross-vendor item matches with 75%+ accuracy on first deployment (base model), improving to 90%+ after 50 user corrections (optimized model).

- **SC-002**: Users spend less than 5 seconds per match confirmation/rejection (simple confirm/reject UI), enabling rapid training data collection.

- **SC-003**: After 20+ corrections, the system demonstrates generalization — suggesting correct matches for NEW items it hasn't seen before, based on learned vendor naming patterns.

- **SC-004**: Weekly optimization completes within 15 minutes per business and produces measurably improved accuracy (verified by held-out test set from corrections).

- **SC-005**: False positive rate (incorrectly suggesting non-matching items are the same) stays below 10% after optimization, verified by user rejection rate on suggestions.

- **SC-006**: The system correctly identifies and does NOT match items with similar descriptions but different specifications (e.g., M8 vs M10 bolts, ink vs toner cartridges) at least 95% of the time.

- **SC-007**: Model optimization failure does not degrade existing match quality — the system gracefully falls back to the previous active model or base classifier.
