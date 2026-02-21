# Data Model: In-App & Email Notification System

**Feature**: `018-app-email-notif` | **Date**: 2026-02-20

## New Tables

### notifications

Stores individual notification records for each recipient.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| recipientUserId | ID (users) | Yes | The user who should see this notification |
| businessId | ID (businesses) | Yes | Business scope for multi-tenant isolation |
| type | Union: `approval` \| `anomaly` \| `compliance` \| `insight` \| `invoice_processing` | Yes | Notification category |
| severity | Union: `info` \| `warning` \| `critical` | Yes | Severity level consistent with IntelligentInsight |
| status | Union: `unread` \| `read` \| `dismissed` | Yes | Lifecycle status (default: `unread`) |
| title | String | Yes | Short notification title (max 100 chars) |
| body | String | Yes | Notification description text |
| resourceType | Optional Union: `expense_claim` \| `invoice` \| `insight` \| `dashboard` | No | Type of linked resource |
| resourceId | Optional String | No | ID of the linked resource for click-through |
| resourceUrl | Optional String | No | Direct URL path for click-through (e.g., `/expense-claims/{id}`) |
| sourceEvent | Optional String | No | Identifier for the triggering event (for deduplication) |
| emailSent | Optional Boolean | No | Whether a transactional email was sent for this notification |
| emailMessageId | Optional String | No | SES message ID if email was sent |
| createdAt | Number | Yes | Unix timestamp (ms) of creation |
| readAt | Optional Number | No | Unix timestamp when marked as read |
| dismissedAt | Optional Number | No | Unix timestamp when dismissed |
| expiresAt | Optional Number | No | Auto-expiration timestamp (optional) |

**Indexes**:
- `by_recipient_business_status`: `[recipientUserId, businessId, status]` — Primary query: user's unread notifications for current business
- `by_recipient_business_created`: `[recipientUserId, businessId, createdAt]` — Notification panel: sorted by recency
- `by_business_type`: `[businessId, type]` — Admin: all notifications by type for a business
- `by_createdAt`: `[createdAt]` — Retention cleanup: delete notifications older than 90 days
- `by_sourceEvent`: `[sourceEvent]` — Deduplication: prevent duplicate notifications for same event

### notification_digests

Tracks digest email delivery per user to determine which notifications to include in the next digest.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| userId | ID (users) | Yes | The user receiving the digest |
| businessId | ID (businesses) | Yes | Business scope |
| lastDigestSentAt | Number | Yes | Unix timestamp of last successful digest delivery |
| lastDigestEmailMessageId | Optional String | No | SES message ID of last digest |
| notificationCount | Number | Yes | Number of notifications included in last digest |

**Indexes**:
- `by_userId_businessId`: `[userId, businessId]` — Lookup last digest time for a user+business pair

## Modified Tables

### users (extend emailPreferences)

Add `notificationPreferences` embedded object alongside existing `emailPreferences`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| notificationPreferences | Optional Object | No | Per-category, per-channel notification settings |

**notificationPreferences structure**:

```
notificationPreferences: {
  // Per-category in-app toggles (default: all true)
  inApp: {
    approval: boolean        // Default: true
    anomaly: boolean         // Default: true
    compliance: boolean      // Default: true
    insight: boolean         // Default: true
    invoice_processing: boolean  // Default: true
  }
  // Per-category email toggles (default: approval + anomaly true, rest false)
  email: {
    approval: boolean        // Default: true
    anomaly: boolean         // Default: true
    compliance: boolean      // Default: false
    insight: boolean         // Default: false
    invoice_processing: boolean  // Default: false
  }
  // Digest settings
  digestFrequency: "daily" | "weekly"  // Default: "daily"
  digestTime: number                    // Hour in UTC (0-23), Default: 8 (8 AM UTC)
}
```

**Note**: `globalUnsubscribe` in existing `emailPreferences` overrides all notification email delivery. Transactional emails (approval requests for the approver) bypass individual category toggles but still respect `globalUnsubscribe`.

## State Transitions

### Notification Status Lifecycle

```
[created] → unread
    │
    ├── user views notification panel → read (readAt set)
    │       │
    │       └── user dismisses → dismissed (dismissedAt set)
    │
    └── user dismisses directly → dismissed (dismissedAt set)

[any status] → deleted (by 90-day cleanup cron)
```

### Notification Creation Flow

```
Trigger Event (expense submit, anomaly detected, etc.)
    │
    ├── Determine recipients (role-based via business_memberships)
    │
    ├── For each recipient:
    │   ├── Check notificationPreferences.inApp[type] → skip if false
    │   ├── Check deduplication (sourceEvent within 24h) → skip if duplicate
    │   ├── Check bulk batching (5+ same type in 60s) → batch if threshold met
    │   └── Create notification record (status: unread)
    │
    └── For transactional email (approval + critical anomaly):
        ├── Check notificationPreferences.email[type] → skip if false
        ├── Check emailPreferences.globalUnsubscribe → skip if true
        ├── Send via SES email service
        └── Update notification.emailSent + emailMessageId
```

## Relationships

```
users (1) ──── (N) notifications       via recipientUserId
users (1) ──── (N) notification_digests via userId
businesses (1) ── (N) notifications     via businessId
business_memberships ── notifications   via role-based targeting
actionCenterInsights ── notifications   via sourceEvent (insight ID as event source)
```

## Data Volume Estimates

| Metric | Estimate | Basis |
|--------|----------|-------|
| Notifications per user per day | 5-20 | Based on typical SME activity |
| Active users per business | 5-50 | SME target market |
| Notifications per business per day | 25-1000 | Users × daily rate |
| Storage per notification | ~500 bytes | Title + body + metadata |
| 90-day retention per business | ~2.25-90 MB | Conservative upper bound |
| Digest emails per day | 1 per active user | Daily digest default |
