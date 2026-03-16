# Feature Specification: Conditional Auto-Approval for AR and AP Matching

**Feature Branch**: `003-conditional-auto-approval`
**Created**: 2026-03-16
**Status**: Draft
**Input**: User description: "Conditional Auto-Approval — Triple-Lock gate for auto-posting high-confidence AI matches with full audit trail and reversal capability."
**Depends On**: `002-unified-ai-transparency` (requires ai_traces infrastructure)

## Clarifications

### Session 2026-03-16

- Q: What counts as a "learning cycle" for Lock 3 (minLearningCycles)? → A: Both user-approved Tier 2 AI matches AND user corrections (where the human manually matched to the same vendor/customer alias) count as learning cycles. Tier 1 exact-reference matches do NOT count because they prove the reference number works, not that the AI learned the alias pattern.
- Q: Where do auto-approval settings live in the UI? → A: Settings drawer within the AR Reconciliation page (gear icon), following the existing fee classification rules drawer pattern. The drawer covers both AR and AP auto-approval settings in one place.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Auto-Approval Settings Configuration (Priority: P1)

A business admin opens the settings drawer (gear icon) within the AR Reconciliation page and enables conditional auto-approval. They configure three parameters: the confidence threshold (default 0.98), the minimum learning cycles (default 5 — how many times the AI must have correctly matched this specific vendor/customer pattern before auto-approving), and a global on/off toggle. Once enabled, the system will automatically approve and post journal entries for matches that pass all three checks of the "Triple-Lock" gate.

**Why this priority**: Without configurable settings, the system has no way to know whether a business wants auto-approval. This is the on-ramp — everything else depends on it being configurable and off by default.

**Independent Test**: Navigate to settings, enable auto-approval with threshold 0.95 and min cycles 3. Verify the settings persist. Disable auto-approval. Verify subsequent matches require manual review.

**Acceptance Scenarios**:

1. **Given** a new business with no matching settings, **When** the admin views the matching settings page, **Then** auto-approval is OFF by default, threshold defaults to 0.98, and minimum learning cycles defaults to 5.
2. **Given** the admin enables auto-approval and sets threshold to 0.95, **When** they save the settings, **Then** the system persists these preferences and applies them to all subsequent AI matching in AR and AP.
3. **Given** auto-approval is enabled, **When** the admin toggles it OFF, **Then** all subsequent AI matches revert to "pending_review" status regardless of confidence — no matches are auto-approved until re-enabled.
4. **Given** the admin sets minimum learning cycles to 10, **When** a high-confidence match arrives for a vendor/customer alias the AI has only correctly matched 7 times, **Then** the match is NOT auto-approved — it goes to "pending_review" because it hasn't met the learning threshold.

---

### User Story 2 - Triple-Lock Auto-Approval Execution (Priority: P1)

When the Tier 2 AI produces a match suggestion, the system evaluates the Triple-Lock gate before deciding whether to auto-approve or send to human review:

**Lock 1 — Setting**: Is `enableAutoApprove` ON for this business?
**Lock 2 — Confidence**: Is the AI confidence ≥ the business's `autoApproveThreshold`?
**Lock 3 — Learning Depth**: Has this specific vendor/customer alias pattern been correctly matched in the corrections/approval history ≥ `minLearningCycles` times?

If all three locks pass: the match is auto-approved, the journal entry is posted immediately, and the match method is set to "auto_agent". If any lock fails: standard "pending_review" behavior.

**Why this priority**: Equal P1 because this is the core logic. Without the Triple-Lock, auto-approval is either too aggressive (bad matches posted) or too conservative (no value over manual review).

**Independent Test**: Create a test scenario where a vendor "ABC Corp" has been correctly matched 6 times (above min cycles of 5), confidence is 0.99, and auto-approve is ON. Verify the match is auto-approved and journal entry posted. Change min cycles to 10 and verify the same match goes to pending_review.

**Acceptance Scenarios**:

1. **Given** auto-approval is ON (threshold 0.98, min cycles 5), and the AI produces a match for "ABC Corp → Invoice INV-500" with confidence 0.99, and "ABC Corp" has been correctly matched 8 times in the corrections history, **When** the Triple-Lock evaluates, **Then** all three locks pass, the match is auto-approved with method "auto_agent", and a journal entry is posted immediately.
2. **Given** the same setup but confidence is 0.95, **When** the Triple-Lock evaluates, **Then** Lock 2 fails (0.95 < 0.98), and the match goes to "pending_review".
3. **Given** the same setup but "ABC Corp" has only been correctly matched 3 times, **When** the Triple-Lock evaluates, **Then** Lock 3 fails (3 < 5), and the match goes to "pending_review".
4. **Given** auto-approval is OFF, **When** any AI match is produced regardless of confidence or learning depth, **Then** it goes to "pending_review".
5. **Given** a split match (1-to-N invoices), **When** the Triple-Lock evaluates, **Then** auto-approval is NOT allowed for split matches — they always require human review (split matches are too complex for unsupervised posting).

---

### User Story 3 - "Verified by Groot" Audit Trail (Priority: P1)

Every auto-approved match carries a complete, immutable audit trail. The journal entry created by auto-approval records "groot_ai_agent" as the preparer (satisfying LHDN/IFRS requirements). The full AI reasoning trace, confidence score, Triple-Lock evaluation results, and model version are stored alongside the entry. In the UI, auto-approved matches display a "Verified by Groot" badge so users can distinguish them from manually approved matches during spot checks.

**Why this priority**: Equal P1 because without audit credibility, auto-approval is a compliance liability. Malaysian LHDN requires identifiable preparers for all journal entries. IFRS requires audit trails for automated processes.

**Independent Test**: Trigger an auto-approved match, navigate to the journal entry, verify "groot_ai_agent" is recorded as preparer with full reasoning trace. Export the accounting records, verify the audit trail is included.

**Acceptance Scenarios**:

1. **Given** a match is auto-approved via Triple-Lock, **When** the journal entry is created, **Then** it records: preparer = "groot_ai_agent", the full reasoning trace as supporting documentation, the confidence score, and all three Triple-Lock results (setting: pass, confidence: pass with score, learning: pass with cycle count).
2. **Given** a user views the AR reconciliation table, **When** they see an auto-approved order, **Then** it displays a "Verified by Groot" badge in the status column, visually distinct from "Matched" (manual/Tier 1) and "AI Suggested" (pending review).
3. **Given** an auditor queries journal entries for a period, **When** they filter for AI-generated entries, **Then** all "auto_agent" entries include the complete reasoning chain and can be traced back to the specific AI model version and correction history that justified the auto-approval.
4. **Given** the AI trace system (from 002-unified-ai-transparency), **When** an auto-approval occurs, **Then** a trace record is created with status "auto_approved" and all Triple-Lock metadata.

---

### User Story 4 - Safety Valve: Reversal of Auto-Approved Matches (Priority: P2)

If a user spots an error in an auto-approved match during a spot check, they can "reverse" it. Reversal un-posts the journal entry (creates a reversal entry per IFRS standards), marks the match as "reversed", and — critically — captures the reversal as a "CRITICAL_FAILURE" training example. Critical failures are weighted 5x in the next MIPROv2 optimization run, ensuring the AI rapidly learns from its mistakes. If a business accumulates 3+ critical failures in a 30-day window, auto-approval is automatically disabled for that business until an admin manually re-enables it.

**Why this priority**: P2 because it's the error recovery path. The system should work correctly most of the time (US1-US3), but when it doesn't, recovery must be safe and educational.

**Independent Test**: Auto-approve a match, then reverse it. Verify the journal entry is reversed (reversal entry created), the correction is marked as "CRITICAL_FAILURE", and the match returns to "unmatched". Trigger 3 reversals in 30 days, verify auto-approval is automatically disabled.

**Acceptance Scenarios**:

1. **Given** an auto-approved match for Order-055 → Invoice-220, **When** the user clicks "Reverse Auto-Match", **Then** the system creates a reversal journal entry (opposite debits/credits), sets the order match status to "unmatched", creates a "CRITICAL_FAILURE" correction in the training data, and logs the reversal in the AI trace system.
2. **Given** a business has had 2 critical failures in the last 30 days, **When** a 3rd critical failure occurs, **Then** auto-approval is automatically disabled for that business, and the admin receives an alert: "Auto-approval paused — 3 critical failures detected. Review and re-enable in Settings."
3. **Given** auto-approval was disabled due to critical failures, **When** the admin reviews the failures and re-enables auto-approval, **Then** the critical failure counter resets and the system resumes auto-approval with the Triple-Lock gate.
4. **Given** a critical failure correction exists, **When** the weekly MIPROv2 optimization runs, **Then** critical failure examples are weighted 5x compared to normal corrections, aggressively teaching the model to avoid that pattern.

---

### User Story 5 - Auto-Approval Dashboard Metrics (Priority: P3)

The matching metrics dashboard (built in the Smart Matcher feature) is extended with auto-approval specific metrics: auto-approval rate (% of Tier 2 matches that passed Triple-Lock), critical failure count, and a "Trust Score" showing how close each vendor/customer is to qualifying for auto-approval (learning cycles completed / threshold).

**Why this priority**: P3 because it's visibility into the auto-approval system, not the system itself. Valuable for admin monitoring but not required for auto-approval to function.

**Independent Test**: Enable auto-approval for a business with 50+ AI matches, verify the dashboard shows auto-approval rate and trust scores per vendor.

**Acceptance Scenarios**:

1. **Given** a business with auto-approval enabled and 100 Tier 2 matches processed, 60 auto-approved and 40 pending review, **When** the admin views the dashboard, **Then** it shows: Auto-Approval Rate: 60%, Critical Failures: 0, Trust Score (per top vendors).
2. **Given** a vendor "XYZ Trading" has been correctly matched 3 out of 5 required cycles, **When** the admin views the trust score, **Then** it shows: "XYZ Trading — 3/5 cycles (60%) — not yet eligible for auto-approval."

---

### Edge Cases

- What happens if the AI model version changes between match suggestion and auto-approval evaluation? The Triple-Lock should use the model version that produced the suggestion — not re-evaluate with a newer model.
- What happens if auto-approval is enabled mid-batch? Only new matches after the setting change should be evaluated for auto-approval — existing "pending_review" matches are not retroactively auto-approved.
- What happens if the journal entry posting fails during auto-approval (e.g., accounting period is closed)? The match should revert to "pending_review" with a note: "Auto-approval attempted but posting failed — review manually."
- What if the same vendor/customer name appears with slight spelling variations? Learning cycle counting should use the normalized alias from the corrections table, not raw string matching.
- What happens to auto-approved matches when the period is closed? They follow the same period close flow as manually approved matches — no special treatment.
- Can auto-approval be enabled for bank recon classification? Not in v1 — only AR and AP matching. Bank recon auto-classification is a future extension.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a per-business matching settings configuration with three fields: enableAutoApprove (boolean, default false), autoApproveThreshold (number 0.90-1.00, default 0.98), and minLearningCycles (integer 1-50, default 5).
- **FR-002**: System MUST evaluate a "Triple-Lock" gate on every Tier 2 AI match: (1) auto-approve is enabled, (2) confidence meets threshold, (3) vendor/customer alias has been correctly matched at least minLearningCycles times.
- **FR-003**: When all three locks pass, the system MUST auto-approve the match, set method to "auto_agent", and immediately post the corresponding journal entry.
- **FR-004**: When any lock fails, the system MUST set the match to "pending_review" (standard behavior) with no journal entry posted.
- **FR-005**: Split matches (1-to-N) MUST NOT be eligible for auto-approval — they always require human review.
- **FR-006**: Auto-approved journal entries MUST record "groot_ai_agent" as the preparer, with the full reasoning trace, confidence score, and Triple-Lock evaluation results as supporting documentation.
- **FR-007**: System MUST provide a reversal action for auto-approved matches that: creates a reversal journal entry, marks the match as "reversed" and "unmatched", and captures a "CRITICAL_FAILURE" correction in the training data.
- **FR-008**: Critical failure corrections MUST be weighted 5x in the next MIPROv2 optimization run to aggressively teach the model to avoid that pattern.
- **FR-009**: If a business accumulates 3 or more critical failures within a rolling 30-day window, the system MUST automatically disable auto-approval for that business and alert the admin.
- **FR-010**: Auto-approval MUST NOT be applied retroactively — enabling the setting only affects new AI matches, not existing "pending_review" matches.
- **FR-011**: Auto-approved matches MUST display a "Verified by Groot" badge in all UI surfaces (reconciliation table, detail sheet, journal entry view).
- **FR-012**: The system MUST create an AI trace record (per 002-unified-ai-transparency) for every auto-approved match with status "auto_approved" and all Triple-Lock metadata.
- **FR-013**: Learning cycle counting MUST use normalized vendor/customer aliases from the corrections and approval history — not raw string matching. A "learning cycle" is defined as either: (a) a user-approved Tier 2 AI match for that alias, or (b) a user correction that teaches the AI the correct match for that alias. Tier 1 exact-reference matches do NOT count toward learning cycles.
- **FR-014**: If journal entry posting fails during auto-approval (e.g., closed accounting period), the match MUST revert to "pending_review" with a failure note — no silent failures.

### Key Entities

- **Matching Settings**: Per-business configuration for auto-approval behavior. Contains: enableAutoApprove flag, autoApproveThreshold, minLearningCycles, and metadata (last updated by, last updated at). Single record per business.
- **Auto-Approval Evaluation**: A transient evaluation of the Triple-Lock gate for a specific match. Contains: lock 1 result (setting check), lock 2 result (confidence vs threshold), lock 3 result (learning cycles for this alias vs minimum), and the overall pass/fail decision. Persisted as part of the AI trace record.
- **Critical Failure**: A special correction type created when a user reverses an auto-approved match. Carries a 5x weight multiplier for MIPROv2 training. Contributes to the rolling 30-day failure counter that can auto-disable auto-approval.
- **Vendor/Customer Trust Score**: A computed metric showing how close a specific vendor or customer alias is to qualifying for auto-approval. Calculated as: (correct matches for this alias) / (minLearningCycles). Not persisted — computed on-demand from corrections and approval history.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Auto-approval handles at least 40% of Tier 2 matches for businesses with 100+ corrections and auto-approve enabled, reducing manual review volume by nearly half.
- **SC-002**: Zero critical failures in the first 30 days for a business that has met the default Triple-Lock thresholds (0.98 confidence, 5 learning cycles), demonstrating the gate's effectiveness.
- **SC-003**: Time from "match produced" to "journal entry posted" for auto-approved matches is under 5 seconds (vs. minutes/hours for manual review).
- **SC-004**: Every auto-approved journal entry passes LHDN/IFRS audit verification: preparer identified, reasoning documented, model version traceable.
- **SC-005**: After a critical failure reversal, the AI model's subsequent predictions for that same pattern improve within 1 optimization cycle (demonstrating the 5x weighting works).
- **SC-006**: The safety valve (auto-disable after 3 failures) triggers correctly — no business experiences more than 3 critical failures before auto-approval is paused.

## Assumptions

- The Unified AI Transparency System (002-unified-ai-transparency) is complete and the ai_traces infrastructure is available for recording auto-approval events.
- The AR Smart Matcher and AP matching modules already support the "ai_suggested" match method and correction capture — auto-approval extends this, not replaces it.
- Journal entry posting infrastructure (double-entry bookkeeping helpers) is stable and can be called programmatically without user interaction.
- The MIPROv2 optimization pipeline supports weighted training examples — critical failures at 5x weight is a configuration change, not a fundamental redesign.
- Auto-approval is limited to AR and AP matching in v1 — bank recon classification auto-approval is a future extension.
- The "Verified by Groot" badge is a visual distinction only — it does not grant or restrict any user permissions.

## Scope Boundaries

### In Scope
- Per-business auto-approval settings (threshold, learning cycles, toggle)
- Triple-Lock evaluation logic for AR and AP Tier 2 matches
- Automatic journal entry posting on Triple-Lock pass
- "groot_ai_agent" preparer audit trail on journal entries
- Reversal action with reversal journal entry and CRITICAL_FAILURE correction
- Auto-disable after 3 critical failures in 30 days
- "Verified by Groot" badge in UI
- 5x weighted critical failures in MIPROv2 training

### Out of Scope
- Auto-approval for bank reconciliation classification (future extension)
- Auto-approval for fee classification (no journal entries to post)
- User-level auto-approval permissions (business-level only in v1)
- Automatic re-enabling of auto-approval after critical failure pause
- Auto-approval for cross-currency matches
- Real-time Slack/push notifications for auto-approved matches
