# Data Model: Proactive Chat Alerts

**Date**: 2026-03-21

## Existing Tables (Modified)

### messages (add proactive alert metadata convention)

No schema change needed. The `metadata: v.optional(v.any())` field carries the alert payload:

```typescript
// Proactive alert metadata shape (within existing messages table)
{
  type: "proactive_alert",
  insightId: string,           // Reference to actionCenterInsights._id
  category: string,            // anomaly | compliance | deadline | cashflow | optimization | categorization
  priority: string,            // critical | high
  title: string,               // Insight title (max 100 chars)
  description: string,         // Insight description
  recommendedAction: string,   // Suggested next step
  affectedEntities: string[],  // Related entity IDs
  actions: string[],           // ["investigate", "dismiss"]
  dismissed: boolean,          // Set to true when user dismisses
  dismissedAt?: number,        // Timestamp of dismissal
  investigated: boolean,       // Set to true when user clicks investigate
  // Batched summary (when 3+ alerts in 5-min window)
  batchedInsights?: Array<{
    insightId: string,
    title: string,
    category: string,
    priority: string,
  }>,
}
```

### conversations (no schema change)

System-initiated conversations use existing fields:
- `title: "Groot Alerts"` — distinguishes from user-initiated conversations
- `isActive: true`
- `userId` + `businessId` — scoped to user+business

## New Tables

### proactive_alert_delivery

Tracks delivery status of each insight-to-user alert for dedup, batching, and analytics.

```typescript
proactive_alert_delivery: defineTable({
  insightId: v.string(),         // actionCenterInsights._id reference
  userId: v.id("users"),
  businessId: v.id("businesses"),
  conversationId: v.id("conversations"),
  messageId: v.id("messages"),
  priority: v.union(v.literal("critical"), v.literal("high")),
  category: v.string(),
  status: v.union(
    v.literal("delivered"),       // Chat message created
    v.literal("batched"),         // Included in a batch summary
    v.literal("investigated"),    // User clicked Investigate
    v.literal("dismissed"),       // User clicked Dismiss
  ),
  deliveredAt: v.number(),
  interactedAt: v.optional(v.number()),
  pushSent: v.optional(v.boolean()),  // Whether mobile push was sent (critical only)
})
  .index("by_user_business", ["userId", "businessId", "deliveredAt"])
  .index("by_insight", ["insightId"])
  .index("by_user_status", ["userId", "status"])
  .index("by_business_delivered", ["businessId", "deliveredAt"])
```

## State Transitions

### Proactive Alert Lifecycle

```
insight created (high/critical)
  → check batching window (5 min)
    → if < 3 pending: deliver individual message → status: "delivered"
    → if >= 3 pending: batch into summary → status: "batched"
  → if critical: also send mobile push → pushSent: true
  → user clicks "Investigate" → status: "investigated", interactedAt set
  → user clicks "Dismiss" → status: "dismissed", interactedAt set
     → also updates actionCenterInsights status to "dismissed"
```

### Unread Badge Count

Derived from: count of `messages` where:
- `conversationId` belongs to user's conversations
- `role === "system"`
- `metadata.type === "proactive_alert"`
- `metadata.dismissed !== true` AND `metadata.investigated !== true`
- Message not yet "read" (no explicit read tracking — use `deliveredAt > lastReadAt` on conversation)

## Entity Relationships

```
actionCenterInsights (1) ──→ (N) proactive_alert_delivery
                                    │
conversations (1) ──→ (N) messages  │
                              ↑     │
                              └─────┘ (messageId reference)

push_subscriptions (user) ──→ mobile push (critical only)
```

## Volume Estimates

- Insights per business per day: ~2-5 (Action Center runs every 4 hours)
- High/critical subset: ~1-3 per day
- proactive_alert_delivery rows per business per month: ~30-90
- Messages added per business per month: ~30-90 (negligible vs existing message volume)
- Bandwidth impact: < 1MB/month additional (well within free plan)
