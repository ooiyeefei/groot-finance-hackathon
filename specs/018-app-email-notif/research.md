# Research: In-App & Email Notification System

**Feature**: `018-app-email-notif` | **Date**: 2026-02-20

## Research Summary

### R1: Notification Storage & Real-Time Delivery

**Decision**: New `notifications` Convex table with real-time subscriptions via `useQuery`

**Rationale**: Convex's built-in subscription model eliminates the need for WebSocket infrastructure or polling. The existing `actionCenterInsights` table proves this pattern at scale — insights already update the Action Center dashboard in real-time. A dedicated `notifications` table (separate from insights) allows notification-specific fields (read/dismissed status, recipient targeting, resource links) without polluting the insights schema.

**Alternatives considered**:
- Piggyback on `actionCenterInsights` — rejected because insights have different lifecycle (review/action status), not all notifications are insights (e.g., approval status), and the table schema doesn't support read/unread tracking per-user.
- External notification service (e.g., Novu, Knock) — rejected for cost and complexity; Convex real-time subscriptions provide equivalent in-app delivery for free.

### R2: Recipient Targeting via RBAC

**Decision**: Use `business_memberships` table with role-based filtering (owner/finance_admin/manager/employee)

**Rationale**: The RBAC system is fully Convex-defined in `business_memberships.role` with a clear hierarchy (owner:4 > finance_admin:3 > manager:2 > employee:1). Role constants are in `src/lib/constants/statuses.ts`. The `by_businessId` index on memberships enables efficient "find all admins for business X" queries.

**Key pattern**:
```
anomaly/compliance/insight → finance_admin + owner roles
approval request → specific manager (from claim assignment or managerId on membership)
status update → specific employee (claim submitter)
```

**Alternatives considered**:
- Clerk organization roles — rejected because RBAC is Convex-defined, not Clerk-based. Clerk handles authentication only.
- Per-business configurable assignment — deferred to future iteration; role-based defaults are sufficient for MVP.

### R3: Email Delivery Architecture

**Decision**: Dual-mode — immediate transactional emails for approvals/critical anomalies + scheduled digest for everything else

**Rationale**: Approval requests are time-sensitive (SC-002 targets 30% turnaround improvement). A digest-only approach would delay visibility by hours. Existing SES infrastructure (`infra/lib/system-email-stack.ts`) and email service (`lambda/shared/email-service.ts`) already handle transactional email sending with RFC 8058 headers.

**Implementation approach**:
- **Transactional**: Convex action → call Lambda or direct SES send for approval requests + critical anomalies
- **Digest**: Convex cron job (daily/weekly per user preference) → aggregate unactioned notifications → render digest template → send via SES
- **Preference gating**: Check `notificationPreferences` before any email; respect `globalUnsubscribe`

**Alternatives considered**:
- All individual emails (no digest) — rejected to avoid email flooding for high-frequency events like insight generation.
- Digest-only — rejected because approval turnaround would suffer.

### R4: Notification Bell UI Placement

**Decision**: Bell icon in `header-with-user.tsx` right section, notification panel via Radix Sheet component

**Rationale**: The header component (`src/components/ui/header-with-user.tsx`) has a clear right-aligned section with `FeedbackButton`, `ThemeToggle`, `LanguageSwitcher`, `UserButton`. The notification bell fits naturally before these. The app already uses `Sheet` (Radix UI) for side panels, and `Badge` for count indicators.

**Placement**: Between `actions` slot and `FeedbackButton`

**Panel pattern**: Right-side Sheet with notification list, severity indicators, mark-as-read actions, and "View all" link.

**Alternatives considered**:
- Popover/dropdown — rejected because notification list needs vertical scroll space; Sheet provides full-height panel.
- Dedicated notifications page only — rejected because quick-glance access from any page is essential for real-time awareness.

### R5: Notification Preferences UI

**Decision**: Extend existing email preferences in user profile section + new notification category toggles

**Rationale**: Email preferences already exist in `users.emailPreferences` (marketing, product updates, onboarding, global unsubscribe). Notification preferences will extend this schema with per-category, per-channel toggles. The UI will be added as a section within the Profile tab of business settings (`business-settings?tab=profile`), near the existing email preferences.

**Schema extension**: Add `notificationPreferences` embedded object alongside `emailPreferences` on the users table. Keep them separate because notification preferences are per-category/per-channel while email preferences are per-type.

### R6: Workflow Integration Points

**Decision**: Hook into `enhanced-workflow-engine.ts` at the existing placeholder (line 414) for expense claim notifications

**Rationale**: The workflow engine already defines `sendNotifications` arrays in transition configurations:
- `draft → submitted`: `['manager', 'system']`
- `approved → reimbursed`: `['finance', 'employee']`
- `submitted → approved` (override): `['compliance', 'audit']`

The integration point at line 414 currently only logs. This is the exact insertion point for notification creation.

**Data available at trigger**: Full claim object, transition details, actor context, approval step, compliance results.

### R7: Action Center Integration

**Decision**: Augment `actionCenterInsights.internalCreate` to also create notification records

**Rationale**: The insight creation pipeline (4-hour proactive analysis cron, daily deadline tracking) already detects anomalies and stores them. Adding a notification creation call alongside insight creation avoids duplicating detection logic. The Action Center UI remains the primary detail view; notifications serve as the delivery/awareness layer.

**Deduplication**: Insights already check for duplicates within 24 hours (category + title match). Notification creation will follow the same dedup window.

### R8: Bulk Notification Batching

**Decision**: 5+ events of the same type within 60 seconds from the same source triggers summary notification

**Rationale**: Batch receipt upload can generate dozens of events. Without batching, a 20-receipt upload would create 20 individual notifications. The 5-event/60-second threshold catches genuine bulk operations while allowing individual events through.

**Implementation**: Buffer notifications in a short-lived accumulator. After 60 seconds, if count >= 5, replace with summary. Otherwise, deliver individually.

### R9: Retention & Cleanup

**Decision**: 90-day retention with daily auto-cleanup cron job

**Rationale**: Matches industry standard (Slack 90 days, GitHub 90 days). Existing cleanup pattern in `convex/crons.ts` — `deleteExpired` for insights runs daily at 2 AM UTC. Notification cleanup follows the same pattern.

### R10: Existing Infrastructure Inventory

| Component | Location | Status | Reuse Plan |
|-----------|----------|--------|------------|
| SES domain verification | `infra/lib/system-email-stack.ts` | Deployed | Reuse — send from `noreply@notifications.hellogroot.com` |
| Email service | `lambda/shared/email-service.ts` | Deployed | Reuse — add new templates |
| Template system | `lambda/shared/templates/index.ts` | Deployed | Extend — add notification + digest templates |
| Unsubscribe tokens | `lambda/shared/unsubscribe-token.ts` | Deployed | Reuse — generate tokens for notification emails |
| Email preferences | `convex/functions/emails.ts` | Deployed | Extend — add notification category prefs |
| RBAC system | `convex/functions/memberships.ts` | Deployed | Reuse — role hierarchy for recipient targeting |
| Cron infrastructure | `convex/crons.ts` | Deployed | Extend — add digest + cleanup crons |
| Sheet component | `src/components/ui/sheet.tsx` | Available | Reuse — notification panel |
| Badge component | `src/components/ui/badge.tsx` | Available | Reuse — unread count indicator |
| Header component | `src/components/ui/header-with-user.tsx` | Available | Modify — add notification bell |
| Workflow engine | `src/domains/expense-claims/lib/enhanced-workflow-engine.ts` | Deployed | Modify — activate notification hook at line 414 |
| Action Center insights | `convex/functions/actionCenterInsights.ts` | Deployed | Augment — add notification creation alongside insight creation |
