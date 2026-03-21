# Convex Function Contracts: Proactive Chat Alerts

## New Functions

### proactiveAlerts.pushToChat (internalMutation)

Called by `actionCenterInsights.internalCreate` after insight insert.

```typescript
args: {
  insightId: v.string(),
  userId: v.string(),
  businessId: v.string(),
  category: v.string(),
  priority: v.union(v.literal("critical"), v.literal("high")),
  title: v.string(),
  description: v.string(),
  recommendedAction: v.string(),
  affectedEntities: v.array(v.string()),
  metadata: v.optional(v.any()),
}
returns: { delivered: boolean, batched: boolean, messageId?: string }
```

**Behavior**:
1. Skip if priority is not high/critical
2. Check 5-min batching window for same user
3. If < 3 pending: create individual system message with proactive_alert metadata
4. If >= 3 pending: create/update batch summary message
5. Record in proactive_alert_delivery table
6. If critical: schedule mobile push via `proactiveAlerts.sendMobilePush`

### proactiveAlerts.sendMobilePush (internalAction)

```typescript
args: {
  userId: v.id("users"),
  businessId: v.id("businesses"),
  title: v.string(),
  body: v.string(),
  conversationId: v.string(),
}
returns: { sent: boolean, deviceCount: number }
```

**Behavior**:
1. Query push_subscriptions for active devices
2. Call APNs send endpoint for each device
3. Deep-link payload: `{ screen: "chat", conversationId }`

### proactiveAlerts.handleAction (mutation)

Called when user clicks Investigate or Dismiss on a proactive alert card.

```typescript
args: {
  messageId: v.id("messages"),
  action: v.union(v.literal("investigate"), v.literal("dismiss")),
}
returns: { success: boolean }
```

**Behavior**:
- **investigate**: Update message metadata (investigated: true), update delivery record, insert user message "Investigate this alert: [title]" with insight context for AI agent
- **dismiss**: Update message metadata (dismissed: true), update delivery record, update linked actionCenterInsights status to "dismissed"

### proactiveAlerts.getUnreadCount (query)

Reactive query for badge count.

```typescript
args: {
  userId: v.id("users"),
  businessId: v.id("businesses"),
}
returns: { count: number, capped: boolean }  // capped=true when count > 20
```

### emailDigestJobs.runWeeklyDigest (internalAction) — EXISTING, implement body

```typescript
args: {}
returns: { businessesProcessed: number, emailsSent: number, durationMs: number }
```

**Behavior**:
1. Query all active businesses
2. For each: get insights from past 7 days, cash flow summary, overdue invoices
3. Skip businesses with zero insights
4. For each eligible user (finance_admin/owner with digest preference enabled): send SES email
5. Log results

## Modified Functions

### actionCenterInsights.internalCreate — ADD scheduler call

After line ~420 (successful insert), add:

```typescript
if (args.priority === "critical" || args.priority === "high") {
  await ctx.scheduler.runAfter(0, internal.functions.proactiveAlerts.pushToChat, {
    insightId: insightId.toString(),
    userId: args.userId,
    businessId: args.businessId,
    category: args.category,
    priority: args.priority,
    title: args.title,
    description: args.description,
    recommendedAction: args.recommendedAction,
    affectedEntities: args.affectedEntities,
    metadata: args.metadata,
  });
}
```
