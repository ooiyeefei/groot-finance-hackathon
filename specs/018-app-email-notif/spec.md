# Feature Specification: In-App & Email Notification System

**Feature Branch**: `018-app-email-notif`
**Created**: 2026-02-20
**Status**: Draft
**Input**: User description: "In-App and Email Notification System for Proactive Alerts — notification bell/center, email digests, and notification triggers leveraging existing anomaly detection, approval workflows, and AI intelligence engine"
**GitHub Issue**: [#211](https://github.com/grootdev-ai/groot-finance/issues/211)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - In-App Notification Center (Priority: P1)

As a finance team member, I want to see a notification bell in the app header with a count of unread notifications, so I can stay informed about pending actions, anomalies, and system events without leaving the app.

When I click the notification bell, a dropdown/panel shows my recent notifications grouped by type (approval requests, anomaly alerts, compliance warnings, AI insights). Each notification shows its severity (info, warning, critical), a brief description, and a timestamp. Clicking a notification takes me directly to the relevant resource (e.g., the specific expense claim, invoice, or dashboard).

**Why this priority**: The in-app notification center is the foundational delivery mechanism. Without it, there is no way for users to receive proactive alerts within the application. All other notification features (email digests, triggers) depend on a centralized notification store that this story establishes.

**Independent Test**: Can be fully tested by creating a notification via the system, verifying it appears in the bell icon with correct count, opening the notification panel, and clicking through to the linked resource.

**Acceptance Scenarios**:

1. **Given** a user is logged in, **When** a new notification is created for them (e.g., an expense claim submitted for their approval), **Then** the notification bell in the header shows an updated unread count badge.
2. **Given** a user has unread notifications, **When** they click the notification bell, **Then** a panel opens showing notifications sorted by most recent, with unread items visually distinguished from read items.
3. **Given** a notification references an expense claim, **When** the user clicks that notification, **Then** they are navigated to the expense claim detail page and the notification is marked as read.
4. **Given** a user has no notifications, **When** they click the notification bell, **Then** the panel shows an empty state message (e.g., "No notifications yet").
5. **Given** a critical anomaly notification exists, **When** the user views the notification panel, **Then** critical notifications are visually distinguished with a severity indicator (e.g., red accent for critical, yellow for warning, blue for info).

---

### User Story 2 - Notification Preferences (Priority: P2)

As a user, I want to control which types of notifications I receive and through which channels (in-app, email), so I am not overwhelmed by irrelevant alerts and can focus on what matters to me.

A notification preferences page (accessible from user settings) lets me toggle notification categories on or off for each channel. Categories include: approval requests, anomaly alerts, compliance warnings, AI insights, and invoice processing updates. Email digest frequency is configurable as daily or weekly.

**Why this priority**: Preferences are essential before enabling email notifications at scale. Without user control, email notifications risk being marked as spam or causing users to disengage entirely. This also extends the existing email preferences system already in the user schema.

**Independent Test**: Can be tested by navigating to notification preferences, toggling categories, and verifying that subsequent notifications respect the toggled settings.

**Acceptance Scenarios**:

1. **Given** a user navigates to notification preferences, **When** the page loads, **Then** they see toggles for each notification category with separate in-app and email columns, pre-populated with default settings (all in-app enabled, email digest enabled for approval and anomaly categories).
2. **Given** a user disables "Anomaly Alerts" for in-app, **When** a new anomaly is detected, **Then** no in-app notification is created for that user (but the anomaly still appears in the Action Center dashboard).
3. **Given** a user sets email digest frequency to "Weekly", **When** the digest job runs, **Then** that user receives a weekly aggregated email instead of daily.
4. **Given** a user has globally unsubscribed from emails (existing `globalUnsubscribe` flag), **When** the notification system attempts to send any email, **Then** no email is sent and the in-app notification is still delivered.

---

### User Story 3 - Approval Workflow Notifications (Priority: P2)

As a manager, I want to be notified immediately when an expense claim is submitted for my approval, so I can review and act on it promptly without having to check the dashboard repeatedly.

As a submitter, I want to be notified when my expense claim has been approved or rejected, including the reason for rejection, so I know the status of my submission.

**Why this priority**: Approval workflow is the highest-frequency notification trigger in the system. The expense claim workflow engine already has integration points marked for notifications (placeholder in `enhanced-workflow-engine.ts`). This directly reduces approval turnaround time.

**Independent Test**: Can be tested by submitting an expense claim and verifying the approver receives a notification; then by approving/rejecting the claim and verifying the submitter receives a status notification.

**Acceptance Scenarios**:

1. **Given** an employee submits an expense claim, **When** the claim enters "pending approval" state, **Then** the assigned approver receives an in-app notification with the claim amount, description, and a link to review it.
2. **Given** a manager approves an expense claim, **When** the approval is confirmed, **Then** the submitter receives an in-app notification confirming approval with the approved amount.
3. **Given** a manager rejects an expense claim with a reason, **When** the rejection is saved, **Then** the submitter receives an in-app notification showing the rejection reason and a link to edit and resubmit.
4. **Given** an approver has email notifications enabled for approvals, **When** a claim is submitted, **Then** the approver also receives an email notification with claim details and a direct link to review.

---

### User Story 4 - Email Digest for Managers (Priority: P3)

As a finance admin or manager, I want to receive a scheduled email digest summarizing pending approvals, detected anomalies, and critical AI insights, so I can stay on top of important items even when I am not logged into the application.

The digest aggregates all unactioned notifications since the last digest, grouped by category with counts and a summary of the most critical items. It includes direct links to each item in the application.

**Why this priority**: Email delivery extends the reach of the notification system beyond the app. This leverages the existing SES email infrastructure (already used for welcome emails) and email preference management. It is P3 because it depends on notification data (P1) and preferences (P2) being in place.

**Independent Test**: Can be tested by configuring a user for daily digest, generating several notifications, triggering the digest job, and verifying the email contains the correct aggregated content.

**Acceptance Scenarios**:

1. **Given** a finance admin has daily digest enabled, **When** the daily digest job runs (e.g., 8:00 AM local time), **Then** they receive an email listing all unactioned notifications from the past 24 hours grouped by category (approvals, anomalies, insights, compliance).
2. **Given** a user has no new notifications since the last digest, **When** the digest job runs, **Then** no email is sent (avoid empty digest emails).
3. **Given** a digest email is sent, **When** the user clicks "View Details" on an anomaly item, **Then** they are taken to the anomaly detail in the Action Center.
4. **Given** a user has unsubscribed from digest emails, **When** the digest job runs, **Then** no email is sent to that user.

---

### User Story 5 - Proactive Anomaly & Insight Alerts (Priority: P3)

As a finance admin, I want to be automatically notified when the system detects a financial anomaly or generates a critical AI insight, so I can investigate and act before issues escalate.

Anomalies detected by the existing intelligence engine and DetectAnomaliesTool are automatically converted into notifications for the relevant users. Critical-severity anomalies trigger immediate in-app notifications. High-severity anomalies are included in the next scheduled digest.

**Why this priority**: This connects the existing intelligence pipeline (which already generates and stores insights in the Action Center) to the notification delivery system. It is P3 because it requires the notification infrastructure (P1) and trigger integration, and the insight system already has its own UI (Action Center).

**Independent Test**: Can be tested by triggering the anomaly detection cron job with test data that produces a critical anomaly, and verifying a notification is created and visible in the notification center.

**Acceptance Scenarios**:

1. **Given** the anomaly detection system identifies a critical anomaly (e.g., expense 3x above baseline), **When** the insight is created in the Action Center, **Then** an in-app notification is simultaneously created for all finance admins in the business.
2. **Given** the intelligence engine generates a high-priority cash flow prediction, **When** the insight is stored, **Then** a notification is created for the business owner and finance admins.
3. **Given** a compliance alert is generated (e.g., cross-border tax threshold approaching), **When** the alert is created, **Then** finance admins receive an in-app notification with the compliance details and recommended action.

---

### Edge Cases

- What happens when a notification references a resource (expense claim, invoice) that has been deleted? The notification should still be visible but display a "Resource no longer available" message instead of a broken link.
- What happens when a user belongs to multiple businesses? Notifications must be scoped to the active business context. Users only see notifications for the business they are currently viewing.
- What happens when the email service (SES) is temporarily unavailable? Email delivery failures should be retried with exponential backoff. The in-app notification must still be created regardless of email delivery status.
- What happens when a user receives hundreds of notifications (e.g., bulk import triggers many events)? The notification panel should paginate or virtualize the list. Bulk operations should generate a single summary notification rather than one per item.
- What happens when the digest job runs but no critical/high notifications exist? No email should be sent — avoid empty or low-value digest emails.
- What happens when a user marks all notifications as read? The bell icon badge should update to zero and the panel should reflect the read state immediately.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display a notification indicator (bell icon) in the application header that shows the count of unread notifications for the current user and business.
- **FR-002**: System MUST provide a notification panel (dropdown or slide-out) that displays notifications sorted by recency, with unread items visually distinguished.
- **FR-003**: System MUST support notification types: `approval`, `anomaly`, `compliance`, `insight`, `invoice_processing`.
- **FR-004**: System MUST support severity levels: `info`, `warning`, `critical` — consistent with the existing `IntelligentInsight` severity classification.
- **FR-005**: Each notification MUST link to the relevant resource (expense claim, invoice, Action Center insight) via a click-through action.
- **FR-006**: System MUST allow users to mark individual notifications as read, and provide a "mark all as read" action.
- **FR-007**: System MUST create notifications automatically when: an expense claim is submitted for approval, an expense claim is approved or rejected, an anomaly is detected, an AI insight is generated with high or critical priority, a compliance alert is triggered.
- **FR-008**: System MUST provide a notification preferences page where users can enable/disable each notification category per channel (in-app and email).
- **FR-009**: System MUST send scheduled email digests (daily or weekly, per user preference) summarizing unactioned notifications, grouped by category.
- **FR-015**: System MUST send individual transactional emails immediately for time-sensitive notification types: approval requests and critical-severity anomalies. All other notification types are delivered via the scheduled digest only.
- **FR-010**: System MUST respect the existing email preference system (`globalUnsubscribe`, category-level toggles) and comply with CAN-SPAM/RFC 8058 unsubscribe requirements for all notification emails.
- **FR-011**: System MUST scope all notifications to a specific business — users only see notifications for their currently active business.
- **FR-018**: System MUST determine notification recipients based on Convex-defined business roles (finance, manager, employee): finance-role users receive anomaly, compliance, and insight notifications; managers receive approval request notifications for claims assigned to them; employees receive status notifications for their own submitted claims. Personal notification preferences (FR-008) further filter delivery within these role-based defaults.
- **FR-012**: System MUST generate a single summary notification when 5 or more events of the same notification type are triggered within a 60-second window from the same source (user or system process), rather than individual notifications per item.
- **FR-013**: System MUST skip sending digest emails when there are no new notifications since the last digest.
- **FR-014**: System MUST support real-time delivery of in-app notifications (notification appears without page refresh).
- **FR-016**: System MUST automatically delete notifications older than 90 days via a scheduled cleanup process.
- **FR-017**: System MUST allow users to dismiss individual notifications (hiding them from the notification panel) without hard-deleting the underlying record.

### Key Entities

- **Notification**: Represents a single alert for a user. Key attributes: recipient user, business, notification type (approval/anomaly/compliance/insight/invoice_processing), severity (info/warning/critical), title, body, status (unread/read/dismissed), link to referenced resource, creation timestamp, optional expiration timestamp. Notifications are retained for 90 days and then auto-deleted. Users can dismiss notifications (hiding them from the panel) but cannot hard-delete them.
- **Notification Preference**: Per-user settings controlling which notification categories are enabled for each channel (in-app, email). Includes digest frequency (daily/weekly). Extends the existing email preferences model.
- **Digest Record**: Tracks when the last digest was sent to each user per business, to determine which notifications to include in the next digest.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can see new in-app notifications within 5 seconds of the triggering event, without needing to refresh the page.
- **SC-002**: Approval turnaround time (submission to approval/rejection) decreases by at least 30% compared to the pre-notification baseline, as measured over the first month after launch.
- **SC-003**: 90% of email digests are delivered successfully (not bounced or marked as spam) as tracked by the email delivery infrastructure.
- **SC-004**: Users can configure all notification preferences in under 2 minutes on first use.
- **SC-005**: Zero empty digest emails are sent — every digest email contains at least one actionable notification.
- **SC-006**: Critical anomaly notifications reach the user's notification panel within 10 seconds of anomaly detection.
- **SC-007**: At least 60% of notification click-throughs result in the user taking action on the linked resource (approving/rejecting a claim, reviewing an anomaly) within the same session.

## Clarifications

### Session 2026-02-20

- Q: Should the system send individual transactional emails for time-sensitive events (approvals, critical anomalies), or digest-only? → A: Both — individual transactional emails for approvals and critical anomalies; digest for everything else.
- Q: How long should notifications be retained, and can users delete them? → A: 90-day retention with auto-cleanup; users can dismiss (hide) but not hard-delete.
- Q: How should the system determine who receives anomaly/insight notifications? → A: Role-based using Convex-defined business roles (finance/manager/employee) — finance-role users get anomaly/insight/compliance notifications; managers get approval requests; employees get status updates on their own claims.
- Q: What defines a "bulk operation" for notification batching (FR-012)? → A: 5+ events of the same type within 60 seconds from the same source.
- Q: Are other notification channels (browser push, mobile push, SMS, Slack/Teams) in scope? → A: No — all explicitly out of scope for this iteration. In-app and email only.

## Out of Scope

- Browser push notifications (service workers, Web Push API)
- Mobile push notifications (Firebase Cloud Messaging, APNs)
- SMS notifications
- Slack, Microsoft Teams, or other third-party messaging integrations
- Multi-language/localized email templates (English only for this iteration)

## Assumptions

- The existing SES email infrastructure (already provisioned via CDK for welcome emails) will be extended for digest emails — no new email service setup is needed.
- The existing email preference schema in the users table (`emailPreferences`) will be extended with notification-specific categories rather than creating a separate preference system.
- Notification triggers for expense claims will integrate with the existing `enhanced-workflow-engine.ts` which already has marked integration points for notifications.
- The Action Center insight creation pipeline (cron jobs creating `actionCenterInsights`) will be augmented to also create notification records — the Action Center UI and notification system are complementary, not replacing each other.
- The existing Discord and Telegram notifiers are for operations/support team error monitoring and will remain separate from this user-facing notification system.
- Business scoping follows the existing pattern where users operate within one active business at a time (determined by their session/org context via Clerk).
- The digest job scheduling will use the existing background job infrastructure (Convex cron jobs or Lambda scheduled events).

## Dependencies

- **Existing SES Infrastructure** (`infra/lib/system-email-stack.ts`): Email delivery for digest and individual notification emails.
- **Email Service** (`lambda/shared/email-service.ts`): Template rendering and sending — needs new templates for notification and digest emails.
- **Email Preferences** (`convex/functions/emails.ts`): Existing preference management to be extended with notification categories.
- **Action Center Insights** (`convex/functions/actionCenterInsights.ts`): Insight creation pipeline to trigger notifications.
- **Expense Claim Workflow** (`src/domains/expense-claims/lib/enhanced-workflow-engine.ts`): Approval state transitions to trigger notifications.
- **Intelligence Engine** (`src/domains/analytics/lib/intelligence-engine.ts`): Anomaly and insight generation as notification sources.
