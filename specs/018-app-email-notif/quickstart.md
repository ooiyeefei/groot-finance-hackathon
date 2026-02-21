# Quickstart: In-App & Email Notification System

**Feature**: `018-app-email-notif` | **Date**: 2026-02-20

## Prerequisites

- Node.js 20.x
- Convex CLI (`npx convex dev` running for local development)
- AWS credentials configured (`--profile groot-finanseal`)
- Existing SES domain verified (`notifications.hellogroot.com`)

## Domain Structure

```
src/domains/notifications/
├── components/
│   ├── notification-bell.tsx          # Header bell icon + badge
│   ├── notification-panel.tsx         # Side panel (Sheet) with notification list
│   ├── notification-item.tsx          # Individual notification row
│   └── notification-preferences-form.tsx  # Preferences grid
├── hooks/
│   ├── use-notifications.ts           # Real-time notification data + actions
│   └── use-notification-preferences.ts  # Preferences query + mutation
├── lib/
│   └── notification-triggers.ts       # Server-side trigger logic (called from workflows)
└── CLAUDE.md                          # Domain documentation

convex/functions/
├── notifications.ts                   # Queries, mutations, internal functions
└── notificationJobs.ts                # Digest aggregation + sending logic

lambda/shared/templates/
├── notification_approval_request.html     # Transactional: new approval needed
├── notification_approval_status.html      # Transactional: approved/rejected
├── notification_critical_anomaly.html     # Transactional: critical anomaly alert
└── notification_digest.html               # Digest: aggregated summary
```

## Implementation Order

### Step 1: Schema + Convex Functions (Backend Foundation)

1. Add `notifications` and `notification_digests` tables to `convex/schema.ts`
2. Add `notificationPreferences` to users table schema
3. Create `convex/functions/notifications.ts` with queries and mutations
4. Run `npx convex dev` to sync schema
5. Run `npx convex deploy --yes` to deploy to production

### Step 2: Notification Bell + Panel (In-App UI)

1. Create `src/domains/notifications/` directory structure
2. Implement `useNotifications` hook
3. Build `NotificationItem`, `NotificationPanel`, `NotificationBell` components
4. Add `NotificationBell` to `header-with-user.tsx`
5. Verify real-time updates work (create test notification via Convex dashboard)

### Step 3: Notification Triggers (Workflow Integration)

1. Implement `notifications.create` and `notifications.createForRole` internal mutations
2. Hook into `enhanced-workflow-engine.ts` at line 414 to create approval notifications
3. Augment `actionCenterInsights.internalCreate` to also create notifications
4. Test: submit expense claim → approver sees notification in bell

### Step 4: Notification Preferences (User Settings)

1. Create `useNotificationPreferences` hook
2. Build `NotificationPreferencesForm` component
3. Add to user profile section in business settings
4. Test: toggle preference → verify notification filtering

### Step 5: Email Templates + Transactional Emails

1. Create email templates in `lambda/shared/templates/`
2. Implement `notifications.sendTransactionalEmail` action
3. Wire transactional email sending into notification creation for approval + critical types
4. Test: submit expense → approver gets in-app notification + email

### Step 6: Digest Job + Cron

1. Create `convex/functions/notificationJobs.ts` with digest aggregation logic
2. Create digest email template
3. Add cron jobs to `convex/crons.ts` (digest + cleanup)
4. Run `npx convex deploy --yes`
5. Test: trigger digest manually → verify email content

## Key Commands

```bash
# Local development
npx convex dev                    # Auto-sync Convex schema + functions

# Production deploy (after Convex changes)
npx convex deploy --yes           # MANDATORY after schema/function changes

# Build verification
npm run build                     # Must pass before task completion

# CDK deploy (only if Lambda changes needed)
cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2
```

## Testing Approach

- **In-app notifications**: Create test notification via Convex dashboard mutation → verify bell badge updates in real-time
- **Preference filtering**: Toggle preference off → trigger notification → verify it's suppressed
- **Transactional email**: Submit expense claim → check SES delivery logs
- **Digest email**: Run digest job manually → verify email content and grouping
- **Cleanup**: Insert notification with old timestamp → run cleanup → verify deletion
- **Bulk batching**: Submit 10 expense claims rapidly → verify single summary notification created
