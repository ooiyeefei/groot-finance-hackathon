# Feature Specification: Unified AI Transparency System

**Feature Branch**: `002-unified-ai-transparency`
**Created**: 2026-03-16
**Status**: Draft
**Input**: User description: "Unified AI Transparency System — centralized ai_traces table, reusable Groot Insight UI component, and Daily AI Digest email across AR Recon, AP 3-Way Matching, and Bank Reconciliation."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Centralized AI Decision Logging (Priority: P1)

Every time Groot's AI makes a matching decision — whether in AR reconciliation, AP 3-way matching, or bank reconciliation — the system records a standardized trace. This trace captures what the AI decided, why it decided it (reasoning chain), how confident it was, which tier handled it, and how much human time the automation saved. All three modules write to the same centralized record format, enabling cross-feature analytics and a single source of truth for auditors.

**Why this priority**: Without centralized logging, the Groot Insight component and Daily Digest have no data to display. This is the foundation layer — everything else consumes it.

**Independent Test**: Trigger an AI match in AR reconciliation, verify a trace record is created with all required fields (feature area, confidence, reasoning, time saved). Repeat for AP matching and bank recon. Verify all three produce structurally identical records.

**Acceptance Scenarios**:

1. **Given** a Tier 2 AI match suggestion is produced in AR reconciliation, **When** the suggestion is stored on the sales order, **Then** a corresponding trace record is created with: feature area = "ar_matching", confidence score, full reasoning chain from the AI, tier = 2, status = "suggested", and estimated time saved (120 seconds default for AR).
2. **Given** a bank transaction is classified by the Tier 2 AI, **When** the classification result is stored, **Then** a trace record is created with: feature area = "bank_recon", the AI's debit/credit reasoning, and estimated time saved (90 seconds default for bank recon).
3. **Given** an AP 3-way match is evaluated by AI, **When** the match result is recorded, **Then** a trace record is created with: feature area = "ap_matching", the variance analysis reasoning, and estimated time saved (180 seconds default for AP).
4. **Given** a user approves, rejects, or corrects an AI suggestion, **When** the status changes, **Then** the corresponding trace record is updated with the final outcome status ("approved", "rejected", "corrected") and the user who acted.
5. **Given** a Tier 1 deterministic match succeeds, **When** the match is recorded, **Then** a trace record is created with tier = 1, confidence = 1.0, reasoning = "Exact reference match", and status = "auto_confirmed" (Tier 1 matches don't need human review).

---

### User Story 2 - Groot Insight Component in Match Review Sidebars (Priority: P1)

When a finance user opens the match review sidebar (in AR, AP, or bank recon), they see a consistent "Groot Insight" panel that explains the AI's reasoning in a human-friendly, step-by-step format. The panel shows the confidence level with a visual indicator, the reasoning chain broken into digestible steps, and a "Verified by Groot" or "Needs Review" badge. This replaces the current inconsistent presentation of AI reasoning across modules.

**Why this priority**: Equal P1 because explainability is the trust-building layer. Users won't adopt auto-approval (future feature) unless they can understand and verify the AI's logic today.

**Independent Test**: Open the AR reconciliation detail sheet for an AI-suggested match, verify the Groot Insight panel displays the reasoning with step-by-step formatting and confidence indicator. Verify the same component renders in AP match review and bank recon classification review.

**Acceptance Scenarios**:

1. **Given** an order with an AI match suggestion in AR reconciliation, **When** the user opens the detail sheet, **Then** a "Groot Insight" panel appears showing: a confidence indicator (green/yellow/red), the reasoning chain formatted as numbered steps, the tier used (e.g., "AI Match — Tier 2"), and the model version.
2. **Given** a bank transaction with AI classification, **When** the user opens the classification detail, **Then** the same Groot Insight component renders with the bank recon reasoning trace, maintaining visual consistency with the AR version.
3. **Given** a Tier 1 deterministic match, **When** the user views the detail, **Then** the Groot Insight panel shows "Exact Match — Tier 1" with a simple explanation (e.g., "Reference INV-001 matched exactly") and a green "Verified" badge.
4. **Given** an AI suggestion with confidence below 0.60, **When** the user views the Groot Insight panel, **Then** it displays a red "Low Confidence" badge and highlights the uncertain reasoning steps in amber.

---

### User Story 3 - Daily AI Intelligence Digest Email (Priority: P2)

Every business day at 6:00 PM local time (or next business day for weekends), the system sends an email digest to the business admin summarizing the day's AI activity. The digest shows: how many transactions the AI handled, the automation rate (% AI vs manual), estimated time saved in hours, and highlights the top 3-5 items needing human attention (low confidence or pending review). The email includes deep links directly to the review pages in the app.

**Why this priority**: P2 because the digest requires trace data (US1) to exist and is a "push" communication channel. The in-app Insight (US2) is the "pull" channel and must work first.

**Independent Test**: Trigger the digest generation for a test business that has processed 50 orders (30 Tier 1, 15 Tier 2 approved, 5 pending review) in the last 24 hours. Verify the email contains correct metrics and deep links.

**Acceptance Scenarios**:

1. **Given** a business processed 100 transactions today (70 Tier 1, 20 Tier 2 approved, 5 Tier 2 pending, 5 unmatched), **When** the daily digest runs at 6 PM, **Then** the email shows: Automation Rate: 90% (70+20 of 100), Time Saved: 3.0 hours (90 matches × 2 min avg), and lists the 5 pending items with deep links to their review pages.
2. **Given** a business had zero AI activity today, **When** the digest would run, **Then** no email is sent (avoid "nothing happened" noise).
3. **Given** a business has 3 "corrected" matches today (user overrode AI), **When** the digest includes the "Learning" section, **Then** it notes: "3 corrections captured — Groot is learning from your feedback" and shows the current total correction count toward the next optimization threshold.
4. **Given** the digest is scheduled for Saturday, **When** the cron evaluates the schedule, **Then** it skips Saturday/Sunday and sends a combined weekend digest on Monday morning.

---

### User Story 4 - Retrofitting Existing AI Modules to Unified Traces (Priority: P2)

The existing AI-powered modules (AR Smart Matcher, fee classification, bank recon classification, AP PO matching) are updated to write trace records to the centralized system. This is a backend-only change — no user-facing behavior changes, but the trace data becomes available for the Insight component and Digest email.

**Why this priority**: P2 because the Insight component (US2) can initially work with the data already embedded in sales_orders.aiMatchSuggestions and bank_transactions classification fields. The retrofit enables cross-feature aggregation and the Digest (US3).

**Independent Test**: Run a full AR reconciliation import + matching flow, verify trace records are created. Run a bank statement import, verify trace records are created. Query traces by business, verify both AR and bank traces appear in the same result set.

**Acceptance Scenarios**:

1. **Given** the AR Smart Matcher processes 10 unmatched orders, **When** the Tier 2 AI returns suggestions, **Then** 10 trace records are created with feature area "ar_matching" and the full reasoning chain from the DSPy module.
2. **Given** the bank recon classifier processes 20 unclassified transactions, **When** the Tier 2 AI returns classifications, **Then** 20 trace records are created with feature area "bank_recon".
3. **Given** the fee classification module classifies 30 fees, **When** results are stored, **Then** 30 trace records are created with feature area "fee_classification" and tier information (1 for rule-based, 2 for AI).
4. **Given** traces from all three modules exist for a business, **When** the system queries traces for that business in the last 24 hours, **Then** all traces appear sorted by timestamp regardless of feature area.

---

### User Story 5 - Consistent "Voice of Groot" Across AI Modules (Priority: P3)

The AI reasoning traces across AR, AP, and bank recon use a consistent voice and structure. Instead of module-specific phrasing (e.g., AR says "amount proximity" while bank recon says "debit/credit alignment"), the reasoning follows a standardized template: "Step 1: Identified [match type]. Step 2: Compared [signal]. Step 3: Confidence assessment." This standardization is achieved by aligning the output field descriptions in all AI module signatures.

**Why this priority**: P3 because functional correctness comes first. Voice consistency is UX polish that improves readability but doesn't block any other feature.

**Independent Test**: Generate reasoning traces from all three modules for similar scenarios (amount match, customer mismatch). Verify the reasoning structure follows the same step-by-step pattern and uses consistent terminology.

**Acceptance Scenarios**:

1. **Given** the AR matcher produces a reasoning trace, **When** the trace is displayed in the Groot Insight component, **Then** it follows the format: "Step 1: [Signal analysis]. Step 2: [Comparison]. Step 3: [Confidence justification]."
2. **Given** the bank recon classifier produces a reasoning trace, **When** displayed alongside an AR trace for the same business, **Then** both use the same terminology (e.g., "confidence assessment" not "certainty level") and the same step structure.

---

### Edge Cases

- What happens when an AI module fails mid-processing (Lambda timeout)? A trace record should still be created with status "failed" and the error message as the reasoning trace.
- What happens when a business has no AI activity for 30+ days? The system should not accumulate empty digest attempts — skip silently.
- How are trace records handled when an order is deleted or voided? Trace records are immutable — they remain as a historical audit trail even if the source record is voided.
- What happens when the daily digest cron runs during a business's off-hours? The digest uses the business's timezone (from user preferences) to determine "6 PM local."
- How long are trace records retained? Follow the existing PDPA data retention policy (7 years for financial records, per Malaysian accounting standards).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST create a standardized trace record for every AI decision across AR matching, AP matching, bank reconciliation, and fee classification, using a single unified record format.
- **FR-002**: Each trace record MUST capture: business identity, feature area (which module), target record identity, tier used (1 or 2), confidence score (0.0-1.0), reasoning chain (full text from AI), decision status, and estimated time saved in seconds.
- **FR-003**: Trace records MUST be updated when a user approves, rejects, or corrects an AI suggestion, recording the final outcome and the acting user.
- **FR-004**: Trace records MUST be immutable after creation — status updates append to the record but never delete the original reasoning or confidence.
- **FR-005**: System MUST provide a reusable "Groot Insight" visual component that renders AI reasoning in a consistent step-by-step format with confidence indicators across all match review interfaces.
- **FR-006**: The Groot Insight component MUST display a visual confidence indicator (green for high ≥0.85, yellow for medium 0.60-0.84, red for low <0.60) and a badge distinguishing AI suggestions from Tier 1 deterministic matches.
- **FR-007**: System MUST send a daily email digest to business admins summarizing: total AI activity count, automation rate (%), estimated time saved (hours), and the top items needing human review with deep links to the app.
- **FR-008**: The daily digest MUST NOT be sent when there is zero AI activity for that business in the preceding 24 hours.
- **FR-009**: The daily digest MUST respect the business's timezone for scheduling (default: Asia/Kuala_Lumpur, 6:00 PM local).
- **FR-010**: The daily digest MUST include a "Learning Progress" section showing: total corrections to date, unique patterns learned, and progress toward the next optimization threshold.
- **FR-011**: System MUST support querying trace records by business, feature area, date range, and status — enabling both the Insight component and the Digest aggregation.
- **FR-012**: The existing AR Smart Matcher, bank recon classifier, fee classifier, and AP matcher MUST be updated to write trace records on every AI decision.
- **FR-013**: Trace records for Tier 1 (deterministic) matches MUST also be created with status "auto_confirmed" and a simplified reasoning description, enabling complete automation rate calculation.
- **FR-014**: The system MUST store model metadata on each trace: the model version identifier used, the number of training examples the model was trained on, and the optimization type.
- **FR-015**: All trace data MUST be accessible for Malaysian LHDN and IFRS audit purposes — supporting the "preparer" documentation requirement where AI-generated entries must identify "groot_ai_agent" as the preparer with the full reasoning as supporting evidence.

### Key Entities

- **AI Trace**: A standardized record of a single AI decision. Captures: which business, which feature (AR/AP/bank/fee), which record was evaluated, what the AI decided (reasoning + confidence + tier), what the user did (approved/rejected/corrected), how much time was saved, and which model version was used. Immutable after creation — status updates are additive.
- **Daily Digest**: An aggregated summary of AI traces for one business over a 24-hour period. Calculated on-demand by the digest cron. Contains: total actions, automation rate, time saved, and a prioritized list of items needing attention. Not persisted as a separate entity — computed from traces.
- **Groot Insight Component**: A reusable UI element (not a data entity) that renders AI trace reasoning in a consistent visual format. Consumes trace data and displays it with confidence indicators, step-by-step reasoning, and status badges.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of AI decisions across all modules (AR, AP, bank recon, fee classification) produce a trace record within 2 seconds of the decision being made.
- **SC-002**: The Groot Insight component renders consistently across all 3 match review interfaces (AR, AP, bank recon) with identical visual structure and no module-specific formatting divergence.
- **SC-003**: Daily digest emails are delivered to business admins within 15 minutes of the scheduled time (6 PM local), with 99% delivery rate.
- **SC-004**: Users can identify, from the digest email alone, which items need their review and navigate directly to those items via deep links — reducing average time from "email received" to "review started" to under 30 seconds.
- **SC-005**: The trace data satisfies LHDN/IFRS audit requirements: every AI-assisted journal entry can be traced back to the specific reasoning, confidence score, and model version that produced it.
- **SC-006**: Cross-feature analytics are possible: a single query can return automation rate across all modules for a business, enabling the "total hours saved this month" metric with no feature-specific logic.

## Assumptions

- The existing AI modules (AR Smart Matcher, bank recon, fee classification) are stable and producing reasoning traces in their current format — the retrofit is a write-through addition, not a rewrite.
- Email delivery uses the existing AWS SES infrastructure already configured for the system (notifications.hellogroot.com domain).
- Business admins are the digest recipients — the system uses the same admin user list as existing notification features.
- Time saved estimates are constants per feature area (AR: 120s, AP: 180s, bank recon: 90s, fee classification: 60s) — these can be refined later with actual user timing data.
- The daily digest is a single email per business, not per user — one admin receives it on behalf of the team.
- Trace records follow the same PDPA retention policy as other financial records (7 years).

## Scope Boundaries

### In Scope
- Centralized AI trace record creation across AR, AP, bank recon, and fee classification
- Trace record status updates on user actions (approve, reject, correct)
- Reusable Groot Insight UI component for all match review sidebars
- Daily AI digest email with automation rate, time saved, and attention items
- Retrofit of existing AI modules to write traces
- LHDN/IFRS audit trail support (preparer documentation)

### Out of Scope
- Auto-approval logic (future feature — depends on this trace infrastructure)
- Real-time notification push (app notifications, Slack) — email digest only
- Custom digest frequency (weekly, monthly) — daily only for v1
- Trace-based anomaly detection or fraud alerting
- User-configurable time-saved estimates
- Trace data export to external BI tools
