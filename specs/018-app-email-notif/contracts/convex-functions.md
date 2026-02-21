# Convex Function Contracts: Notifications

**Feature**: `018-app-email-notif` | **Date**: 2026-02-20

## Queries

### notifications.listForUser

List notifications for the current user and business, with filtering and pagination.

```typescript
// File: convex/functions/notifications.ts
export const listForUser = query({
  args: {
    businessId: v.id("businesses"),
    status: v.optional(v.union(v.literal("unread"), v.literal("read"), v.literal("dismissed"))),
    type: v.optional(v.union(
      v.literal("approval"), v.literal("anomaly"), v.literal("compliance"),
      v.literal("insight"), v.literal("invoice_processing")
    )),
    limit: v.optional(v.number()),    // Default: 20, Max: 100
    cursor: v.optional(v.string()),   // Pagination cursor
  },
  returns: v.object({
    notifications: v.array(/* notification shape */),
    nextCursor: v.optional(v.string()),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    // Auth: Resolve user from Clerk identity
    // Business: Verify active membership
    // Query: by_recipient_business_created index, filter by status/type
    // Return: Paginated results sorted by createdAt desc
  }
})
```

### notifications.getUnreadCount

Get unread notification count for the bell icon badge. Lightweight query optimized for real-time subscription.

```typescript
export const getUnreadCount = query({
  args: {
    businessId: v.id("businesses"),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    // Auth: Resolve user from Clerk identity
    // Business: Verify active membership
    // Query: by_recipient_business_status index, count where status = "unread"
    // Return: Integer count
  }
})
```

### notifications.getPreferences

Get notification preferences for the current user.

```typescript
export const getPreferences = query({
  args: {},
  returns: v.object({
    inApp: v.object({
      approval: v.boolean(),
      anomaly: v.boolean(),
      compliance: v.boolean(),
      insight: v.boolean(),
      invoice_processing: v.boolean(),
    }),
    email: v.object({
      approval: v.boolean(),
      anomaly: v.boolean(),
      compliance: v.boolean(),
      insight: v.boolean(),
      invoice_processing: v.boolean(),
    }),
    digestFrequency: v.union(v.literal("daily"), v.literal("weekly")),
    digestTime: v.number(),
  }),
  handler: async (ctx) => {
    // Auth: Resolve user from Clerk identity
    // Return: user.notificationPreferences with defaults applied
  }
})
```

## Mutations

### notifications.markAsRead

Mark a single notification as read.

```typescript
export const markAsRead = mutation({
  args: {
    notificationId: v.id("notifications"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Auth: Verify user owns this notification
    // Update: status = "read", readAt = Date.now()
    // No-op if already read or dismissed
  }
})
```

### notifications.markAllAsRead

Mark all unread notifications as read for current user + business.

```typescript
export const markAllAsRead = mutation({
  args: {
    businessId: v.id("businesses"),
  },
  returns: v.object({ count: v.number() }),
  handler: async (ctx, args) => {
    // Auth: Resolve user, verify membership
    // Query: All unread notifications for user+business
    // Update: Each to status = "read", readAt = Date.now()
    // Return: Count of updated notifications
  }
})
```

### notifications.dismiss

Dismiss a notification (hide from panel).

```typescript
export const dismiss = mutation({
  args: {
    notificationId: v.id("notifications"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Auth: Verify user owns this notification
    // Update: status = "dismissed", dismissedAt = Date.now()
  }
})
```

### notifications.updatePreferences

Update notification preferences for the current user.

```typescript
export const updatePreferences = mutation({
  args: {
    inApp: v.optional(v.object({
      approval: v.optional(v.boolean()),
      anomaly: v.optional(v.boolean()),
      compliance: v.optional(v.boolean()),
      insight: v.optional(v.boolean()),
      invoice_processing: v.optional(v.boolean()),
    })),
    email: v.optional(v.object({
      approval: v.optional(v.boolean()),
      anomaly: v.optional(v.boolean()),
      compliance: v.optional(v.boolean()),
      insight: v.optional(v.boolean()),
      invoice_processing: v.optional(v.boolean()),
    })),
    digestFrequency: v.optional(v.union(v.literal("daily"), v.literal("weekly"))),
    digestTime: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Auth: Resolve user from Clerk identity
    // Update: Merge provided fields into user.notificationPreferences
    // Preserve: Unspecified fields remain unchanged
  }
})
```

## Internal Mutations (Server-Side Only)

### notifications.create

Create a notification for a specific user. Called by trigger functions, not directly by clients.

```typescript
export const create = internalMutation({
  args: {
    recipientUserId: v.id("users"),
    businessId: v.id("businesses"),
    type: v.union(
      v.literal("approval"), v.literal("anomaly"), v.literal("compliance"),
      v.literal("insight"), v.literal("invoice_processing")
    ),
    severity: v.union(v.literal("info"), v.literal("warning"), v.literal("critical")),
    title: v.string(),
    body: v.string(),
    resourceType: v.optional(v.union(
      v.literal("expense_claim"), v.literal("invoice"),
      v.literal("insight"), v.literal("dashboard")
    )),
    resourceId: v.optional(v.string()),
    resourceUrl: v.optional(v.string()),
    sourceEvent: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  returns: v.id("notifications"),
  handler: async (ctx, args) => {
    // Check: User's notificationPreferences.inApp[type] — skip if disabled
    // Check: Dedup via sourceEvent within 24h
    // Create: notification with status = "unread", createdAt = Date.now()
    // Return: notification ID
  }
})
```

### notifications.createForRole

Create notifications for all users with a specific role in a business. Used for broadcast notifications (anomalies, compliance alerts).

```typescript
export const createForRole = internalMutation({
  args: {
    businessId: v.id("businesses"),
    targetRoles: v.array(v.string()),   // e.g., ["owner", "finance_admin"]
    type: v.union(/* notification types */),
    severity: v.union(v.literal("info"), v.literal("warning"), v.literal("critical")),
    title: v.string(),
    body: v.string(),
    resourceType: v.optional(/* ... */),
    resourceId: v.optional(v.string()),
    resourceUrl: v.optional(v.string()),
    sourceEvent: v.optional(v.string()),
  },
  returns: v.object({ created: v.number(), skipped: v.number() }),
  handler: async (ctx, args) => {
    // Query: business_memberships by businessId where role in targetRoles and status = "active"
    // For each matching member: call create() logic
    // Return: counts of created and skipped (due to preferences)
  }
})
```

### notifications.deleteExpired

Cleanup cron job — delete notifications older than 90 days.

```typescript
export const deleteExpired = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx) => {
    // Query: by_createdAt index where createdAt < (now - 90 days)
    // Delete: Each expired notification
    // Return: Count deleted
  }
})
```

## Internal Actions (for Email Sending)

### notifications.sendTransactionalEmail

Send an immediate transactional email for a notification (approvals, critical anomalies).

```typescript
export const sendTransactionalEmail = internalAction({
  args: {
    notificationId: v.id("notifications"),
    recipientEmail: v.string(),
    recipientName: v.string(),
    templateType: v.string(),       // e.g., "notification_approval_request"
    templateData: v.any(),
    userId: v.string(),             // For unsubscribe token generation
  },
  returns: v.object({
    success: v.boolean(),
    messageId: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    // Generate: Unsubscribe token
    // Send: Via email service (SES)
    // Update: notification.emailSent = true, emailMessageId = messageId
    // Return: Result
  }
})
```

### notifications.sendDigest

Send digest email for a user. Called by the digest cron job.

```typescript
export const sendDigest = internalAction({
  args: {
    userId: v.id("users"),
    businessId: v.id("businesses"),
    recipientEmail: v.string(),
    recipientName: v.string(),
    notifications: v.array(v.any()),  // Aggregated notification data
  },
  returns: v.object({
    success: v.boolean(),
    messageId: v.optional(v.string()),
    notificationCount: v.number(),
  }),
  handler: async (ctx, args) => {
    // Render: Digest template with grouped notifications
    // Send: Via email service (SES)
    // Update: notification_digests record with lastDigestSentAt
    // Return: Result
  }
})
```

## Cron Jobs

### Digest Cron

```typescript
// In convex/crons.ts
// Daily at 8:00 AM UTC (default digest time)
crons.daily("notification-digest",
  { hourUTC: 8, minuteUTC: 0 },
  internal.functions.notificationJobs.runDigest
)

// Daily at 2:00 AM UTC (cleanup)
crons.daily("notification-cleanup",
  { hourUTC: 2, minuteUTC: 0 },
  internal.functions.notifications.deleteExpired
)
```
