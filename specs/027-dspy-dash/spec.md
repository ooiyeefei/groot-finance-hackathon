# Feature Specification: DSPy Observability Dashboard

**Feature Branch**: `027-dspy-dash`
**Created**: 2026-03-19
**Status**: Draft
**Input**: GitHub Issue #338 — Build DSPy observability dashboard for self-improvement metrics
**Audience**: Internal team only (not customer-facing)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Health Check at a Glance (Priority: P1)

As an internal team member, I want to see whether all 5 DSPy tools are functioning correctly so I can identify broken tools before trial users report issues.

**Why this priority**: If a Lambda is crashing on import or Gemini API keys are expired, nothing else matters. Health is the prerequisite for everything.

**Independent Test**: Navigate to the dashboard and confirm health status indicators are visible for all 5 tools — classify_fees, classify_bank_transaction, match_orders, match_po_invoice, match_vendor_items.

**Acceptance Scenarios**:

1. **Given** the dashboard is loaded, **When** I view the overview, **Then** I see a cross-business summary with per-tool health indicators (success rate, average latency, Refine retry rate, fallback rate) for a selectable time window (last 24h, 7d, 30d). I can drill down into any business for detailed metrics.
2. **Given** a tool's Refine retry rate exceeds 30%, **When** I view the dashboard, **Then** that tool is visually flagged as degraded.
3. **Given** a tool's fallback rate (confidence=0.0) exceeds 10%, **When** I view the dashboard, **Then** that tool is visually flagged as unreliable.
4. **Given** no metrics data exists yet (new deployment), **When** I view the dashboard, **Then** I see an empty state explaining that data will appear after classifications run.

---

### User Story 2 - Self-Improvement Tracking (Priority: P1)

As an internal team member, I want to see whether DSPy's BootstrapFewShot optimization is actually improving accuracy so I can validate our "self-improving AI" thesis to stakeholders.

**Why this priority**: This is the core question the dashboard must answer — "Is DSPy learning?" Without this, the dashboard doesn't fulfill its purpose.

**Independent Test**: View per-business correction counts, confidence trends over time, and before/after comparison when a business crosses the 20-correction threshold.

**Acceptance Scenarios**:

1. **Given** the dashboard is loaded, **When** I view the self-improvement section, **Then** I see a per-business correction funnel showing cumulative corrections vs the 20-correction BootstrapFewShot threshold for each tool.
2. **Given** a business has crossed the 20-correction threshold for a tool, **When** I view the confidence trend chart, **Then** I see average confidence before and after the threshold crossing, colored by model version (base vs BootstrapFewShot vs pre-trained).
3. **Given** the dashboard is loaded, **When** I view the correction diversity metric, **Then** I see the ratio of unique corrections to total corrections per business per tool (high = generalizing, low = repeating mistakes).
4. **Given** the dashboard is loaded, **When** I view the re-correction rate, **Then** I see how often users correct something DSPy was already trained on (indicates DSPy not learning).
5. **Given** the dashboard is loaded, **When** I view accuracy over time, **Then** I see the percentage of classifications that were correct on first try (no user override) per tool per time period.

---

### User Story 3 - Cost Visibility (Priority: P2)

As an internal team member, I want to understand the cost of running DSPy classifications so I can evaluate whether Tier 2 AI is worth it compared to Tier 1 rules alone.

**Why this priority**: Important for business viability but secondary to knowing whether the system works at all.

**Independent Test**: View estimated Gemini spend per business, Tier 1 hit rate, and cost per correct classification.

**Acceptance Scenarios**:

1. **Given** the dashboard is loaded, **When** I view the cost section, **Then** I see estimated Gemini API cost per business per month.
2. **Given** the dashboard is loaded, **When** I view Tier 1 vs Tier 2 breakdown, **Then** I see the percentage of classifications handled by rules (free) vs DSPy/LLM (paid) per tool.
3. **Given** the dashboard is loaded, **When** I view cost efficiency, **Then** I see cost per correct classification (estimated tokens * token price / correct classifications).
4. **Given** the dashboard is loaded, **When** I view Refine overhead, **Then** I see extra token cost from Refine retries (wasted attempts).

---

### User Story 4 - Lambda Instrumentation (Priority: P1)

As a developer, I want the Lambda functions to emit structured metrics after each classification so the dashboard has data to display.

**Why this priority**: Without instrumentation, the dashboard has nothing to show. This is the data pipeline that enables all other stories.

**Independent Test**: Invoke a DSPy tool and confirm structured metrics are logged and stored.

**Acceptance Scenarios**:

1. **Given** a DSPy tool is invoked, **When** the classification completes, **Then** a structured metrics record is emitted containing: tool name, business ID, usedDspy flag, model version, average confidence, number of corrections available, Refine retry count, latency, and timestamp.
2. **Given** metrics are emitted from Lambda, **When** the Lambda calls the Convex HTTP action, **Then** metrics are persisted in Convex and immediately accessible by the dashboard.
3. **Given** a classification fails or times out, **When** the error occurs, **Then** the failure is recorded as a metric with error type.

---

### User Story 5 - Alerting on Key Thresholds (Priority: P3)

As an internal team member, I want to receive alerts when key thresholds are crossed so I can react proactively.

**Why this priority**: Nice-to-have for proactive monitoring but the dashboard itself provides the same information on demand. Can be deferred to a later phase.

**Independent Test**: Trigger a threshold crossing and confirm an alert notification is sent.

**Acceptance Scenarios**:

1. **Given** a business crosses 20 corrections for a tool, **When** the threshold is detected, **Then** an alert is sent to the configured channel.
2. **Given** a business's re-correction rate exceeds 20%, **When** the threshold is detected, **Then** an alert is sent indicating DSPy may not be learning for that business/tool.
3. **Given** a tool's Refine retry rate exceeds 30% over a 24h window, **When** the threshold is detected, **Then** an alert is sent indicating model quality degradation.

---

### Edge Cases

- What happens when a business has zero classifications? Dashboard shows empty state with explanation.
- What happens when Lambda metrics are missing fields (e.g., older logs without Refine retry count)? Dashboard handles gracefully with "N/A" for missing fields.
- What happens when a business is deleted? Metrics are retained for historical analysis but labeled as "(deleted business)".
- What happens when the metrics storage table grows very large? Metrics are retained for 90 days; a scheduled cleanup purges older records. Dashboard uses time-windowed queries (default 30 days) to limit read cost.
- What happens when multiple Lambda versions are running (during deployment)? Metrics include Lambda version for disambiguation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST instrument all 5 DSPy Lambda tools (classify_fees, classify_bank_transaction, match_orders, match_po_invoice, match_vendor_items) to emit structured metrics after each classification.
- **FR-002**: System MUST store classification metrics in a persistent, queryable store with business ID, tool name, and timestamp as queryable dimensions.
- **FR-003**: System MUST provide an internal-only dashboard page accessible only to admin users (not visible to regular business users).
- **FR-004**: System MUST display per-tool health metrics: success rate, average latency, Refine retry rate, and fallback rate (confidence=0.0).
- **FR-005**: System MUST display per-business correction funnels showing progress toward the 20-correction BootstrapFewShot threshold per tool.
- **FR-006**: System MUST display confidence trends over time, segmented by model version (base, BootstrapFewShot, pre-trained).
- **FR-007**: System MUST display correction diversity (unique corrections / total corrections) per business per tool.
- **FR-008**: System MUST display re-correction rate (corrections on items DSPy was already trained on) per business per tool.
- **FR-009**: System MUST display accuracy over time (% correct on first try, no user override) per tool.
- **FR-010**: System MUST display estimated cost metrics: Gemini spend per business, Tier 1 vs Tier 2 breakdown (Tier 1 hits tracked via Convex-side counter), cost per correct classification.
- **FR-011**: System MUST support time window filtering (last 24h, 7 days, 30 days) on all metrics.
- **FR-012**: System MUST visually flag tools with degraded health (Refine retry rate > 30% or fallback rate > 10%).
- **FR-013**: System MUST handle empty states gracefully when no metrics data exists for a business or tool.
- **FR-014**: System MUST automatically purge classification metrics older than 90 days via scheduled cleanup to stay within storage limits.
- **FR-015**: System MUST display a cross-business overview as the default view, with summary cards per business showing key health and self-improvement indicators, and allow drill-down into a single-business detail view.

### Key Entities

- **Classification Metric**: A single record of a DSPy tool invocation — includes tool name, business ID, model version, confidence, latency, Refine retry count, usedDspy flag, success/failure, timestamp.
- **Correction**: A user override of a DSPy classification — includes business ID, tool name, original classification, corrected classification, timestamp. (Already exists in `dspy_corrections` / `fee_corrections` tables.)
- **Business**: The organizational unit for which metrics are aggregated. (Already exists.)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Team can answer "Is DSPy learning for business X?" within 30 seconds by viewing the dashboard (vs current 15+ minutes of CloudWatch log searching).
- **SC-002**: All 5 DSPy tools emit structured metrics on every invocation with zero data loss under normal operation.
- **SC-003**: Dashboard loads and renders all metrics within 5 seconds for any time window.
- **SC-004**: Team can identify a degraded tool (high retry rate, high fallback rate) within 10 seconds of opening the dashboard.
- **SC-005**: Cost per business per month is visible and accurate to within 20% of actual Gemini billing.
- **SC-006**: Before/after confidence comparison is available for any business that has crossed the 20-correction threshold.

## Clarifications

### Session 2026-03-19

- Q: How do classification metrics travel from Lambda to the dashboard's data store? → A: Lambda calls a Convex HTTP action directly after each classification (near-real-time, no intermediate stores or CloudWatch parsing).
- Q: How are Tier 1 (rule-based) hits tracked, since they never invoke Lambda? → A: Add a lightweight Tier 1 hit counter in the existing Convex mutation that handles rule-based matching, using the same business/tool dimensions.
- Q: How long should classification metrics be retained? → A: 90 days. Balances trend visibility with Convex storage cost. Older records are purged via scheduled cleanup.
- Q: What is the default dashboard navigation structure? → A: Cross-business overview first (summary cards per business), with drill-down into single-business detail view.

## Assumptions

- Existing Convex tables `dspy_corrections` and `fee_corrections` contain correction data needed for self-improvement metrics. No new correction tracking mechanism is needed.
- Lambda sends metrics directly to Convex via HTTP action after each classification (no CloudWatch parsing or intermediate stores needed).
- The 20-correction threshold for BootstrapFewShot is consistent across all 5 tools.
- Token usage can be estimated from response metadata or LiteLLM logging (exact billing-level accuracy is not required).
- The dashboard is internal-only and does not need customer-facing polish — functional clarity over visual polish.
- Alerting (User Story 5) can use existing notification channels (Slack webhook or similar) and does not require building new notification infrastructure.

## Scope

### In Scope
- All 5 DSPy tools listed in the issue
- Lambda instrumentation (structured logging + metrics persistence)
- Dashboard UI for health, self-improvement, and cost metrics
- Time window filtering
- Admin-only access control

### Out of Scope
- Customer-facing analytics or reports
- Real-time streaming updates (polling/refresh is acceptable)
- Historical backfill of metrics from before instrumentation
- Integration with external monitoring tools (Datadog, Grafana)
- Automated remediation (dashboard is read-only, no actions)

## Dependencies

- Access to all 5 DSPy Lambda functions for instrumentation changes
- Existing Convex `dspy_corrections` and `fee_corrections` tables for correction data
- Gemini API pricing data for cost estimation
- Admin role infrastructure for access control (assumes existing Clerk-based role system)
