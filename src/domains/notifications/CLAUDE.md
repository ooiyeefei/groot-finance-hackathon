# Notifications Domain

In-app and email notification system for proactive alerts across all domains.

## Structure

```
src/domains/notifications/
├── components/
│   ├── notification-bell.tsx          # Header bell icon + unread badge
│   ├── notification-panel.tsx         # Side panel (Sheet) with notification list
│   ├── notification-item.tsx          # Individual notification row
│   └── notification-preferences-form.tsx  # Preferences grid
├── hooks/
│   ├── use-notifications.ts           # Real-time notification data + actions
│   └── use-notification-preferences.ts  # Preferences query + mutation
└── lib/
    └── notification-triggers.ts       # Server-side trigger helpers
```

## Backend

- `convex/functions/notifications.ts` — Queries, mutations, internal functions
- `convex/functions/notificationJobs.ts` — Digest aggregation + sending
- `convex/schema.ts` — `notifications` + `notification_digests` tables

## Key Patterns

- Real-time delivery via Convex `useQuery` subscriptions
- Auth: `ctx.auth.getUserIdentity()` → `resolveUserByClerkId`
- Business scoping: All queries filtered by `businessId`
- RBAC: Convex-defined roles in `business_memberships` (owner > finance_admin > manager > employee)
- Email: SES via `lambda/shared/email-service.ts` with RFC 8058 unsubscribe headers

## Notification Types

| Type | Severity | Trigger |
|------|----------|---------|
| approval | info/warning | Expense claim workflow transitions |
| anomaly | warning/critical | Proactive analysis detection |
| compliance | warning | Compliance gap detection |
| insight | info | AI insight generation |
| invoice_processing | info | Invoice processing events |

## Integration Points

- `enhanced-workflow-engine.ts` line 414: Approval notification triggers
- `actionCenterInsights.ts` `internalCreate`: Anomaly/insight notification triggers
- `header-with-user.tsx`: NotificationBell placement
- `user-profile-section.tsx`: Notification preferences form
