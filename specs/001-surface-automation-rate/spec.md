# Feature Specification: Surface Automation Rate Metric

**Feature Branch**: `001-surface-automation-rate`
**Created**: 2026-03-16
**Status**: Draft
**Input**: User description: "Surface automation rate metric to demonstrate AI value, showing X invoices processed with only Y needing review, including trend charts and milestone notifications"

## Clarifications

### Session 2026-03-16

- Q: What happens when a user corrects an AI decision multiple times for the same document? Should it count as one correction or multiple? → A: Count as one correction (first correction only) - subsequent edits to the same decision are updates, not new reviews
- Q: How does the system handle corrections made days or weeks after the original AI decision? Does it recalculate historical automation rates? → A: No retroactive recalculation (historical rates are immutable) - rates reflect knowledge at time of reporting
- Q: How are partial corrections weighted? (e.g., user accepts 80% of OCR extraction but edits 20% - does this count as a full correction or partial?) → A: Full correction (any edit counts as needing review) - if the user had to manually intervene at all, the AI didn't fully automate that task
- Q: What if a business has zero AI activity in a given period - should the automation rate be 0%, undefined, or "N/A"? → A: Display "No AI activity in this period" - prevents confusion between "0% automated" (AI failed) and no data
- Q: What happens when DSPy optimization reduces automation rate temporarily (e.g., model becomes more conservative)? Should the trend chart show this honestly or smooth it? → A: Show honestly (no smoothing) - transparency builds trust, and "Model optimized" annotations provide context for temporary dips

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Current Automation Rate (Priority: P1)

As a business owner or manager, I want to see how many AI-powered decisions were made versus how many required my review, so I can understand the value the AI is providing and justify the investment.

**Why this priority**: This is the core competitive differentiator mentioned in the issue - similar to competitor's "2,230 invoices processed, only looked at 12" social proof. This metric directly demonstrates ROI and builds trust in the AI system.

**Independent Test**: Can be fully tested by processing a mix of invoices/transactions (some auto-approved, some requiring corrections) and verifying the automation rate calculation displays correctly on the analytics dashboard and Action Center. Delivers immediate value by showing users the AI's impact.

**Acceptance Scenarios**:

1. **Given** 100 invoices have been processed this week with 4 requiring manual correction, **When** I view the analytics dashboard, **Then** I see "**96 invoices processed** this week, only **4 needed review** (**96.0% automated**)"

2. **Given** I am on the Action Center page today, **When** the page loads, **Then** I see a summary like "Today: **47 documents** processed, **2 needed your attention**"

3. **Given** multiple AI features have made decisions (AR reconciliation, bank classification, fee breakdown, expense OCR), **When** I view the automation rate, **Then** the rate aggregates decisions across all these features into a single percentage

4. **Given** no AI decisions have been made in the selected time period, **When** I view the automation rate, **Then** I see a clear message "No AI activity in this period" instead of 0% or undefined values

5. **Given** I am in business settings under the AI section, **When** I view cumulative stats, **Then** I see total lifetime automation metrics (e.g., "**15,234 documents** processed, **782 reviewed** - **94.9% automation rate**")

6. **Given** the AI extracted 10 fields from an expense receipt and I edited 2 of them, **When** the automation rate is calculated, **Then** this counts as a full correction (the document is included in "decisions requiring review")

---

### User Story 2 - Track Automation Rate Improvement Over Time (Priority: P2)

As a business owner, I want to see how the automation rate has improved over weeks and months, so I can understand that the AI is learning and getting better at handling my specific business patterns.

**Why this priority**: This demonstrates the DSPy self-improving moat - the automation rate genuinely increases as the model learns. This is a powerful retention and upgrade driver, showing the system's value compounds over time.

**Independent Test**: Can be tested by simulating multiple weeks of AI decisions with varying accuracy, running optimization cycles, and verifying the trend chart shows improvement. Delivers value by visualizing the learning curve and justifying long-term investment.

**Acceptance Scenarios**:

1. **Given** I have 8 weeks of historical AI decision data, **When** I view the analytics dashboard, **Then** I see a line chart showing weekly automation rate percentages with an upward trend

2. **Given** a DSPy MIPROv2 optimization ran on 2026-02-15, **When** I view the trend chart, **Then** I see an annotation marker on that date labeled "Model optimized"

3. **Given** the automation rate improved from 85% in Week 1 to 95% in Week 8, **When** I view the chart, **Then** I can clearly see the progression and understand the AI is learning

4. **Given** I hover over a data point on the chart, **When** the tooltip appears, **Then** I see the exact automation rate percentage and the number of decisions for that week

5. **Given** I have less than 2 weeks of data, **When** I view the trend section, **Then** I see a message like "Tracking automation trends - check back after 2 weeks of activity"

6. **Given** I corrected an AI decision 2 weeks after it was made, **When** I view the trend chart for that historical week, **Then** the automation rate for that week remains unchanged (historical rates are immutable)

7. **Given** there was a week with zero AI activity, **When** I view the trend chart, **Then** that data point shows "No activity" in the tooltip instead of attempting to calculate a percentage

8. **Given** a DSPy optimization made the model more conservative and the automation rate dropped from 94% to 89% in the week following optimization, **When** I view the trend chart, **Then** I see the actual 89% value with the "Model optimized" marker providing context (no smoothing or hiding of the temporary dip)

---

### User Story 3 - Receive Milestone Celebration Notifications (Priority: P3)

As a business owner, I want to be notified when my AI automation rate reaches significant milestones (90%, 95%, 99%), so I feel accomplished and understand the system is working exceptionally well.

**Why this priority**: This is an engagement and retention feature that celebrates user success and reinforces the value proposition. It's less critical than visibility (P1) and trend tracking (P2) but improves user experience and satisfaction.

**Independent Test**: Can be tested by simulating AI decisions that push the automation rate over threshold values and verifying notifications appear. Delivers value through positive reinforcement and user delight.

**Acceptance Scenarios**:

1. **Given** my automation rate crosses 90% for the first time, **When** the threshold is reached, **Then** I see an in-app toast notification: "🎉 Your AI automation rate just hit 90%!"

2. **Given** my automation rate crosses 95% threshold, **When** I receive the daily AI Intelligence Digest email, **Then** the email includes a celebration message about reaching 95% automation

3. **Given** I have already crossed the 90% milestone once, **When** my rate drops to 88% and then rises to 91% again, **Then** I do NOT receive a duplicate 90% milestone notification

4. **Given** my automation rate reaches 99%, **When** the notification appears, **Then** it includes additional context like "Only 1 in 100 documents needs your review!"

5. **Given** I have milestone notifications disabled in my settings, **When** my automation rate crosses a threshold, **Then** I do NOT receive toast notifications (but the achievement may still be noted in email digest)

---

### Edge Cases

- **Multiple corrections per document**: When a user corrects an AI decision multiple times for the same document, only the first correction counts toward "decisions requiring review". Subsequent edits are considered refinements of the same review action.
- **Delayed corrections and historical immutability**: Corrections made days or weeks after the original AI decision do not retroactively recalculate historical automation rates. Historical trend chart data points remain unchanged to preserve data integrity.
- **Partial corrections**: Any edit to AI-extracted data, regardless of magnitude (editing 1 field or 10 fields), counts as a full correction. If the user had to manually intervene, the AI didn't fully automate that task.
- **Zero AI activity**: When a business has zero AI activity in a given period, display the clear message "No AI activity in this period" instead of showing 0% or undefined values. This prevents confusion between "AI failed" and "AI wasn't used."
- **DSPy optimization temporary dips**: When DSPy optimization causes the automation rate to decrease temporarily (e.g., model becomes more conservative to avoid costly errors), the trend chart displays the actual rate without smoothing. The "Model optimized" annotation marker provides context for users to understand this is part of the learning process.
- How does the system handle businesses that just started and have <10 AI decisions? Should there be a minimum threshold before displaying percentages?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST calculate automation rate as `(total_ai_decisions - decisions_requiring_review) / total_ai_decisions * 100`

- **FR-002**: System MUST aggregate AI decisions from AR reconciliation matches (auto-approved via Triple-Lock + manually reviewed)

- **FR-003**: System MUST aggregate AI decisions from bank transaction classifications (auto-classified + manually corrected)

- **FR-004**: System MUST aggregate AI decisions from fee breakdown classifications

- **FR-005**: System MUST aggregate AI decisions from expense OCR extractions (accepted vs edited)

- **FR-006**: System MUST count decisions requiring review from `order_matching_corrections` table (user corrected an AR match)

- **FR-007**: System MUST count decisions requiring review from `bank_recon_corrections` table (user corrected a bank classification)

- **FR-008**: System MUST count decisions requiring review when expense claim extracted data was edited before submission

- **FR-009**: System MUST display automation rate prominently on the analytics dashboard as a large hero metric

- **FR-010**: System MUST display daily automation summary on Action Center in format "Today: X documents processed, Y needed your attention"

- **FR-011**: System MUST display cumulative automation statistics in business settings AI section

- **FR-012**: System MUST show weekly automation rate as a line chart with time on x-axis and percentage on y-axis

- **FR-013**: System MUST annotate the trend chart with "Model optimized" markers when MIPROv2 optimization runs

- **FR-014**: System MUST trigger an in-app toast notification when automation rate crosses 90% threshold for the first time

- **FR-015**: System MUST trigger an in-app toast notification when automation rate crosses 95% threshold for the first time

- **FR-016**: System MUST trigger an in-app toast notification when automation rate crosses 99% threshold for the first time

- **FR-017**: System MUST include milestone achievements in the AI Intelligence Digest email when reached

- **FR-018**: System MUST NOT send duplicate milestone notifications if the rate crosses the same threshold multiple times

- **FR-019**: System MUST support filtering automation rate by date range (today, this week, this month, custom range)

- **FR-020**: System MUST handle zero AI decisions gracefully by displaying the clear message "No AI activity in this period" instead of showing 0%, undefined values, or error states

- **FR-021**: System MUST deduplicate corrections per document by counting only the first correction for each unique AI decision (subsequent edits to the same decision do not increment "decisions requiring review")

- **FR-022**: System MUST NOT retroactively recalculate historical automation rates when corrections are made after the reporting period ends (historical rates are immutable and reflect the state of knowledge at the time they were calculated)

- **FR-023**: System MUST treat any manual edit to AI-extracted data as a full correction, regardless of the number or proportion of fields edited (no partial weighting)

- **FR-024**: System MUST display actual automation rates on the trend chart without smoothing, interpolation, or moving averages (show real data including temporary dips after optimization)

### Key Entities

- **Automation Rate Metric**: Represents the percentage of AI decisions that did not require human review, calculated across multiple AI features (AR recon, bank classification, fee breakdown, expense OCR). Aggregates data from various correction tables. Historical metrics are immutable once the reporting period ends. When no AI activity exists for a period, displays "No AI activity in this period" instead of a percentage. Trend data is displayed honestly without smoothing.

- **AI Decision**: A single automated action taken by any AI feature (matching an order, classifying a transaction, extracting expense data, categorizing a fee). Includes metadata about which feature made the decision and timestamp.

- **Decision Correction**: A record indicating a user manually reviewed and modified an AI decision. Links to the original decision and includes the feature type that was corrected. Only the first correction per decision is counted toward automation rate. Any edit, regardless of magnitude, counts as a full correction. Corrections do not affect historical period metrics.

- **Automation Milestone**: A threshold value (90%, 95%, 99%) that triggers celebration notifications. Tracks whether each threshold has been reached to prevent duplicate notifications.

- **Model Optimization Event**: A record of when DSPy MIPROv2 optimization runs, used for annotating the trend chart to show when the AI was retrained. Provides context for understanding temporary dips in automation rate.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can view their current automation rate percentage within 2 seconds of loading the analytics dashboard

- **SC-002**: The automation rate calculation accurately reflects decisions from all four AI feature sources (AR recon, bank classification, fee breakdown, expense OCR)

- **SC-003**: Users can see a weekly trend chart showing at least 8 weeks of automation rate history (when available)

- **SC-004**: Milestone notifications appear within 5 seconds of the automation rate crossing a threshold

- **SC-005**: The Action Center displays today's automation summary in a format that takes less than 3 seconds to comprehend ("X processed, Y needed review")

- **SC-006**: 90% of users understand the automation rate metric without additional explanation (measured through user interviews or support ticket volume)

- **SC-007**: The trend chart visually demonstrates improvement over time, with optimization markers clearly visible

- **SC-008**: Zero calculation errors occur when aggregating decisions across multiple AI features (validated through automated tests)

- **SC-009**: Users can view cumulative lifetime automation statistics in business settings showing total documents processed and reviewed

- **SC-010**: The system handles edge cases gracefully (zero decisions, new businesses, partial corrections) without errors or confusing displays

- **SC-011**: Historical trend chart data points remain stable and unchanged when viewing past periods, even after delayed corrections are made

- **SC-012**: Users viewing a period with zero AI activity immediately understand no data exists (clear "No AI activity" message, not 0% or N/A)

- **SC-013**: Temporary dips in automation rate following DSPy optimization are visible on the trend chart with contextual "Model optimized" markers, maintaining user trust through transparency

## Assumptions

1. The existing `order_matching_corrections` and `bank_recon_corrections` tables are the source of truth for user corrections
2. A "correction" means the user disagreed with and changed an AI decision - any edit, regardless of magnitude (1 field or all fields), counts as a full correction. Only the first correction per decision increments the "decisions requiring review" count
3. Historical corrections do not retroactively recalculate past automation rates - rates represent the state of knowledge at the time they were calculated, ensuring trend chart stability
4. Expense OCR "edits" are tracked somewhere in the existing expense claims system (implementation will discover the exact mechanism)
5. MIPROv2 optimization events are already logged somewhere in the system (e.g., in `dspy_model_versions` table or similar)
6. The daily AI Intelligence Digest email system already exists and can be extended to include milestone achievements
7. In-app toast notifications use an existing notification system (like Sonner)
8. The analytics dashboard already exists and has space for adding a hero metric
9. "Today" means the current calendar day in the business's local timezone
10. A minimum of 10 AI decisions is recommended before displaying percentages to avoid misleading small-sample statistics (display "Collecting data..." instead)
11. Periods with zero AI activity display "No AI activity in this period" - this is distinct from periods with <10 decisions which show "Collecting data..."
12. Transparency builds trust - showing actual automation rates (including temporary dips after optimization) with contextual annotations is preferable to smoothing or hiding data

## Scope Boundaries

### In Scope
- Automation rate calculation across four AI features (AR recon, bank classification, fee breakdown, expense OCR)
- Hero metric display on analytics dashboard, Action Center, and business settings
- Weekly trend chart with historical data and optimization markers
- Milestone notifications at 90%, 95%, 99% thresholds via in-app toast and email digest
- Date range filtering (today, week, month, custom)
- Deduplication logic to count only first correction per AI decision
- Immutable historical rates (no retroactive recalculation)
- Full correction counting (any edit = full correction, no partial weighting)
- Clear messaging for zero-activity periods ("No AI activity in this period")
- Honest trend display (actual rates without smoothing, including post-optimization dips)

### Out of Scope
- Detailed breakdown of automation rate by individual AI feature (e.g., showing AR recon is 98% but bank classification is 92%)
- Predictive forecasting of future automation rates
- Comparison of automation rate across multiple businesses (for resellers/agencies)
- Exporting automation rate data to external analytics platforms
- A/B testing different AI confidence thresholds to optimize automation rate
- Historical recalculation of automation rates when corrections are made retroactively
- User-configurable milestone thresholds (fixed at 90%, 95%, 99%)
- Tracking correction frequency or confidence penalties for repeated edits
- Partial weighting of corrections based on proportion of fields edited
- Smoothing, moving averages, or interpolation of trend chart data

## Dependencies

- Existing `order_matching_corrections` table and data population logic
- Existing `bank_recon_corrections` table and data population logic
- Existing fee breakdown classification decision tracking
- Existing expense OCR extraction and edit tracking
- Existing analytics dashboard UI and layout
- Existing Action Center UI
- Existing business settings UI structure
- Existing AI Intelligence Digest email system
- Existing in-app notification system (toast notifications)
- DSPy model optimization event logging (assumed to exist in `dspy_model_versions` or similar)

## Open Questions

Only one remaining minor question (not blocking planning):
- How does the system handle businesses that just started and have <10 AI decisions? Should there be a minimum threshold before displaying percentages? (Assumption #10 suggests "Collecting data..." message, can be confirmed during planning)
