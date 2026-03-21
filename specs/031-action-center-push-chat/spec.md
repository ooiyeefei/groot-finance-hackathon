# Feature Specification: Proactive Chat Alerts — Push Action Center Insights to Chat

**Feature Branch**: `031-action-center-push-chat`
**Created**: 2026-03-21
**Status**: Draft
**GitHub Issue**: [#346](https://github.com/grootdev-ai/groot-finance/issues/346)
**Input**: User description: "Proactive chat alerts — push Action Center insights to chat and weekly email digest"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — High-Priority Insight Appears in Chat (Priority: P1)

A finance admin or business owner is having a normal workday. The Action Center cron detects a critical anomaly (e.g., duplicate payment, unusual spending spike, cash flow risk). Instead of waiting for the user to check the Action Center dashboard, the system proactively pushes this insight as a message into the user's active chat conversation. The user opens chat and sees the alert with contextual details and action buttons (Investigate, Dismiss).

**Why this priority**: This is the core value proposition — turning passive dashboard insights into proactive, conversational alerts. Users who live in chat (the primary interface per Groot's agent-first philosophy) currently miss critical financial alerts entirely. This closes that gap.

**Independent Test**: Can be fully tested by triggering a high-priority insight and verifying it appears as a system message in the user's chat with appropriate action buttons.

**Acceptance Scenarios**:

1. **Given** the Action Center cron detects a new high-priority anomaly for a business, **When** the insight is created, **Then** a system message with an action card appears in the finance admin's active chat conversation within 60 seconds.
2. **Given** a critical cash flow risk is detected, **When** the insight is pushed to chat, **Then** the message includes a summary of the risk, severity indicator, and "Investigate" / "Dismiss" action buttons.
3. **Given** a user has no active chat conversation, **When** a high-priority insight is generated, **Then** the system creates a new system-initiated conversation and delivers the alert there.
4. **Given** a user clicks "Investigate" on a proactive alert, **When** the chat processes the action, **Then** the AI agent responds with detailed analysis of the insight (e.g., which transactions triggered the anomaly, historical context, recommended next steps).
5. **Given** a user clicks "Dismiss" on a proactive alert, **When** the dismissal is processed, **Then** the insight is marked as dismissed and no further alerts are sent for the same issue within the deduplication window.

---

### User Story 2 — Unread Proactive Alert Badge (Priority: P1)

When proactive alerts are pushed to chat, the chat widget displays an unread badge count so users know there are pending alerts without opening the chat. The badge is visible from any page in the application, drawing attention to time-sensitive financial alerts.

**Why this priority**: Without a visual indicator, users won't know proactive alerts exist. The badge is essential for the push model to work — it's the "notification" that drives the user to open chat.

**Independent Test**: Can be tested by pushing a proactive alert and verifying the badge appears on the chat widget across different pages, and disappears when the user reads the message.

**Acceptance Scenarios**:

1. **Given** a proactive alert is pushed to a user's chat, **When** the user has not yet opened the conversation, **Then** the chat widget shows a badge with the count of unread proactive alerts.
2. **Given** three proactive alerts have been pushed, **When** the user views the badge, **Then** it displays "3" (individual count, not grouped).
3. **Given** the user opens the chat and views the proactive messages, **When** the messages are scrolled into view, **Then** the badge count decreases accordingly and disappears when all are read.
4. **Given** the user is on any page in the application (expenses, invoices, analytics, etc.), **When** a proactive alert arrives, **Then** the badge is visible on the chat widget without requiring a page refresh.

---

### User Story 3 — Weekly Email Digest of Top Insights (Priority: P2)

Finance admins and business owners receive a weekly email summarizing the top 5 Action Center insights from the past week. The email includes a cash flow summary, overdue invoice highlights, and any detected anomalies — giving users a quick pulse check without logging into the app.

**Why this priority**: Email digest extends proactive intelligence beyond the app. Users who don't check the app daily still get critical financial visibility. However, it's P2 because the in-app chat alerts (P1) deliver more immediate value for active users.

**Independent Test**: Can be tested by triggering the weekly digest job and verifying an email is sent with the correct content to users with finance_admin or owner roles.

**Acceptance Scenarios**:

1. **Given** the weekly digest schedule triggers (once per week), **When** a business has had Action Center insights generated during the past 7 days, **Then** an email is sent to all users with finance_admin or owner roles in that business.
2. **Given** a business had 12 insights this week, **When** the digest is generated, **Then** the email contains the top 5 insights ranked by priority (critical first, then high), with a link to the Action Center for the full list.
3. **Given** a business had zero insights this week, **When** the digest schedule triggers, **Then** no email is sent for that business (no empty digest emails).
4. **Given** the email is received, **When** the user views it, **Then** it includes: (a) top 5 insights with severity and brief description, (b) cash flow summary (current balance trend, upcoming large payments), (c) overdue invoice count and total amount, (d) a prominent "Open Groot" call-to-action button.
5. **Given** a user has opted out of email digest notifications in their preferences, **When** the weekly digest runs, **Then** that user does not receive the email.

---

### User Story 4 — Contextual Conversation from Alert (Priority: P2)

After seeing a proactive alert in chat, the user can naturally continue the conversation to explore the insight further. The AI agent understands the alert context and can answer follow-up questions like "Tell me more about this anomaly" or "Show me the transactions involved."

**Why this priority**: This transforms alerts from static notifications into interactive, agentic experiences — the core differentiator of Groot's agent-first approach. P2 because it builds on top of P1 (the alert must exist first).

**Independent Test**: Can be tested by pushing an alert, then sending follow-up messages and verifying the agent responds with contextually relevant analysis.

**Acceptance Scenarios**:

1. **Given** a proactive anomaly alert is displayed in chat, **When** the user types "Tell me more about this," **Then** the AI agent responds with detailed analysis including the specific transactions, amounts, dates, and historical comparison.
2. **Given** a budget alert is in chat, **When** the user asks "What can I do about this?", **Then** the agent provides actionable recommendations (e.g., "You could reallocate budget from Category X which is 40% underspent").
3. **Given** multiple proactive alerts exist in the conversation, **When** the user references a specific one (e.g., "the vendor concentration issue"), **Then** the agent correctly identifies which alert is being discussed and responds accordingly.

---

### User Story 5 — Alert Routing by Role (Priority: P3)

Different user roles receive different types of proactive alerts based on relevance. Employees see expense-related alerts (duplicate claims, policy violations). Managers see team-level alerts (spending spikes, late approvals). Finance admins and owners see all alerts including cash flow, vendor concentration, and compliance issues.

**Why this priority**: P3 because the system works without role-based filtering (all high-priority alerts go to admins), but role-based routing makes the experience more relevant and less noisy for each persona.

**Independent Test**: Can be tested by generating different insight types and verifying they route to the correct user roles.

**Acceptance Scenarios**:

1. **Given** an expense anomaly is detected for a specific employee's claim, **When** the alert is routed, **Then** it is delivered to the employee (their claim), their manager, and finance admins — but not to unrelated employees.
2. **Given** a cash flow risk is detected, **When** the alert is routed, **Then** only finance_admin and owner roles receive it (not employees or managers without financial oversight).
3. **Given** a user has multiple roles, **When** alerts are routed, **Then** they receive the union of alerts for all their roles (no duplicates).

---

### Edge Cases

- **What happens when** the user is offline and multiple alerts accumulate? Alerts queue as unread system messages; the badge shows total count; no alert is lost.
- **What happens when** the same insight triggers multiple times within the dedup window? Only the first alert is pushed to chat; subsequent duplicates are suppressed (leveraging existing 90-day / 7-day dedup in Action Center).
- **What happens when** the user has disabled the chat feature or has no active business? No alerts are pushed; the weekly digest still sends if email preferences allow.
- **What happens when** there are more than 20 unread proactive alerts? The badge shows "20+" to avoid overwhelming the UI. Older alerts remain in chat history but don't inflate the badge beyond the cap.
- **What happens when** the Action Center generates many insights at once (e.g., after a batch bank import)? If 3+ insights fire within a 5-minute window for the same user, they are batched into a single summary message with a "View all" action — preventing chat spam while preserving visibility.
- **What happens when** the weekly digest email bounces or fails to deliver? The system logs the delivery failure via existing SES event tracking (bounce/complaint SNS topics) and retries once. Failed deliveries surface in operational monitoring.
- **What happens when** an insight is dismissed from the Action Center dashboard after being pushed to chat? The chat message remains (for audit trail) but is visually marked as "Resolved" with muted styling.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST push high-priority (high/critical) Action Center insights to relevant users' chat conversations as system messages within 60 seconds of insight creation.
- **FR-002**: System MUST create a system-initiated conversation for a user if no active conversation exists when a proactive alert needs to be delivered.
- **FR-003**: Proactive alert messages MUST include: insight summary, severity indicator, insight category, and at least two action buttons (Investigate, Dismiss).
- **FR-004**: The chat widget MUST display an unread badge count reflecting the number of unread proactive alert messages, visible from any page in the application.
- **FR-005**: The unread badge MUST update in real-time without requiring page refresh when new alerts arrive or existing alerts are read.
- **FR-006**: Users MUST be able to dismiss a proactive alert, which marks the underlying insight as dismissed and suppresses future alerts for the same issue within the dedup window.
- **FR-007**: The "Investigate" action MUST trigger the AI agent to provide detailed contextual analysis of the insight, including relevant transactions, historical patterns, and recommended actions.
- **FR-008**: System MUST send a weekly email digest to users with finance_admin or owner roles, containing the top 5 Action Center insights from the past 7 days, cash flow summary, and overdue invoice highlights.
- **FR-009**: Weekly digest MUST NOT be sent for businesses with zero insights in the past week.
- **FR-010**: Users MUST be able to opt out of the weekly email digest via their notification preferences.
- **FR-011**: Proactive alerts MUST respect the existing deduplication logic — if an insight has already been created within the dedup window, no duplicate alert is pushed to chat.
- **FR-014**: When 3 or more insights are generated for the same user within a 5-minute window, the system MUST batch them into a single summary message listing all insights with a "View all" action, instead of delivering individual messages.
- **FR-015**: Critical-priority insights MUST also trigger a native mobile push notification (iOS/Android) to users who have registered a device, in addition to the in-app chat message. High-priority insights do NOT trigger mobile push.
- **FR-016**: Mobile push notifications MUST deep-link to the chat conversation containing the proactive alert when tapped.
- **FR-012**: Alert routing MUST be role-aware: expense-related alerts to the affected employee + their manager + finance admins; financial overview alerts (cash flow, vendor concentration, compliance) to finance_admin and owner roles only.
- **FR-013**: The weekly email digest MUST include a prominent call-to-action link that opens the Groot application.

### Key Entities

- **Proactive Alert**: A system-initiated chat message linked to an Action Center insight. Attributes: source insight reference, severity, category, delivery status, action taken (investigated/dismissed/pending), delivered-at timestamp.
- **Alert Preference**: Per-user settings controlling which alert types they receive in chat and whether they receive the weekly email digest. Extends existing notification preferences.
- **Weekly Digest**: A generated email artifact containing aggregated insights, cash flow summary, and overdue invoice data for a specific business and time period.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 80% of high-priority insights are seen by at least one user within 24 hours of detection (compared to current baseline where dashboard-only visibility means many are never seen).
- **SC-002**: Users interact with (investigate or dismiss) at least 60% of proactive chat alerts within 48 hours of delivery.
- **SC-003**: Weekly digest email open rate exceeds 40% within the first month of launch.
- **SC-004**: Time from anomaly detection to user awareness decreases from "next dashboard visit" (hours/days) to under 5 minutes for active app users.
- **SC-005**: Chat-initiated investigation of alerts leads to at least 30% of users taking a corrective action (e.g., flagging a transaction, adjusting a budget, contacting a vendor) directly from the conversation.
- **SC-006**: Zero duplicate alerts delivered to the same user for the same insight within the deduplication window.

---

## Assumptions

- The existing Action Center cron and insight generation pipeline does not need modification — this feature consumes insights after they're created.
- The existing chat action card system supports adding new card types for proactive alerts without major refactoring.
- SES infrastructure (domain, configuration set, delivery tracking) is already operational and can be used for the weekly digest without additional AWS setup.
- User notification preferences (existing notification preference system) can be extended to include proactive alert and digest settings.
- The existing real-time chat subscription mechanism will handle badge updates without additional infrastructure.
- The Convex free-plan bandwidth constraints are manageable for this feature because: (a) proactive alerts are low-volume (a few per business per day at most), and (b) the weekly digest runs via EventBridge/Lambda (not Convex cron).
- The priority threshold for chat alerts is fixed at high/critical for MVP — not user-configurable. Configurability is a future enhancement if demand warrants it.
- Native mobile push notifications use the existing APNs infrastructure and are limited to critical-priority insights only, to avoid notification fatigue.

## Clarifications

### Session 2026-03-21

- Q: Should burst insights (many generated at once) be individual messages or batched? → A: Batch into a single summary message when 3+ insights fire within a 5-minute window for the same user, with a "View all" action.
- Q: Should proactive alerts also trigger native mobile push notifications (APNs infrastructure exists)? → A: Yes, but only for critical-priority insights. High-priority stays in-app only. Critical also sends native mobile push with deep-link to chat.
- Q: Should the priority threshold for chat alerts (high/critical) be user-configurable? → A: No. Fixed at high/critical for MVP. Medium/low insights stay dashboard-only. Configurability can be added later if users request it.
