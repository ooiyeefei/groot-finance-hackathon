# Research: Proactive Chat Alerts

**Date**: 2026-03-21
**Branch**: `031-action-center-push-chat`

## Decision 1: Where to Hook — Insight Creation → Chat Alert Pipeline

**Decision**: Hook into `actionCenterInsights.internalCreate` (after successful insert, line ~420) using `ctx.scheduler.runAfter()` to asynchronously push chat alerts. This keeps the alert pipeline decoupled from the notification system while ensuring every insight triggers a chat check.

**Rationale**:
- `internalCreate` is the single funnel — ALL insights (cron-detected, AI-discovered, manual) pass through it
- Already has role-based notification dispatch via `ctx.scheduler.runAfter()` calling `notifications.createForRole`
- Adding a parallel `ctx.scheduler.runAfter()` for chat alerts keeps the two systems independent
- No risk of missing insights from new detection algorithms added later

**Alternatives considered**:
- Hook into `notifications.createForRole` — rejected because notification preferences might suppress creation, but chat alerts should always deliver for high/critical
- Hook into each detection algorithm individually — rejected because it's fragile (new algorithms would need manual wiring)

## Decision 2: Chat Message Structure for Proactive Alerts

**Decision**: Use the existing `messages` table with `role: "system"` and structured `metadata` containing action card payload. Register a new `proactive-alert-card` action card type.

**Rationale**:
- Existing `messages.createSystemMessage()` mutation handles conversation update (lastMessageAt, messageCount)
- `metadata` field (type `v.any()`) can carry the full action card payload without schema changes
- The action card registry (`registerActionCard()`) supports adding new types via side-effect imports

**Key metadata shape**:
```typescript
{
  type: "proactive_alert",
  insightId: string,
  category: "anomaly" | "compliance" | "deadline" | "cashflow" | "optimization" | "categorization",
  priority: "critical" | "high",
  title: string,
  description: string,
  recommendedAction: string,
  affectedEntities: string[],
  actions: ["investigate", "dismiss"],
  batchedInsights?: Array<{ insightId, title, category, priority }>,  // when batched
}
```

## Decision 3: Conversation Resolution for System-Initiated Messages

**Decision**: Find the user's most recent active conversation for the business. If none exists, create a new conversation with title "Groot Alerts" and `isActive: true`.

**Rationale**:
- Users typically have one active conversation per business
- Creating a dedicated "Groot Alerts" conversation prevents mixing alerts with user-initiated chat history
- The `conversations` table has `by_userId` and `by_businessId` indexes for efficient lookup

## Decision 4: Unread Badge Implementation

**Decision**: Add a `proactiveAlertCount` field to the existing conversation query or create a dedicated reactive query that counts unread system messages with `metadata.type === "proactive_alert"`.

**Rationale**:
- Convex reactive queries automatically push updates to the client — no polling needed
- A dedicated query scoped to proactive alerts avoids bandwidth waste from scanning all messages
- Badge cap at 20+ prevents UI overflow

## Decision 5: Burst Batching Strategy

**Decision**: Use a 5-minute batching window. When `internalCreate` fires, check if there are pending (undelivered) alerts for the same user created within the last 5 minutes. If count >= 2 (making this the 3rd+), convert all pending into a single batched summary message.

**Rationale**:
- The Action Center cron runs every 4 hours — bursts happen when multiple detection algorithms find issues simultaneously
- 5 minutes is wide enough to catch same-cron bursts but narrow enough to not delay isolated alerts
- Implementation: use a `proactive_alert_queue` tracking table or a simple time-window check on recent messages

## Decision 6: Weekly Email Digest via EventBridge

**Decision**: Implement the weekly digest in the existing `emailDigestJobs.ts` (currently a placeholder) and trigger via the existing `weekly-email-digest` EventBridge rule.

**Rationale**:
- EventBridge rule already exists in `scheduled-intelligence-stack.ts`
- Lambda dispatcher already routes `weekly-email-digest` module
- SES infrastructure (domain, config set, delivery tracking) is operational
- Avoids Convex bandwidth — Lambda reads insights via HTTP API, processes locally

## Decision 7: Mobile Push for Critical Alerts

**Decision**: After creating the chat alert message, if the insight is `critical` priority, call the existing APNs send endpoint `/api/v1/notifications/send-push` via internal HTTP call.

**Rationale**:
- APNs infrastructure is fully ready (SSM credentials, device token table, JWT sender)
- Only critical alerts trigger push — keeps notification fatigue low
- Reuses existing endpoint rather than duplicating push logic

## Decision 8: Investigate Action Flow

**Decision**: When user clicks "Investigate", insert a user message "Investigate this alert: [insight title]" into the conversation with the insight metadata attached. The AI agent's existing tool-calling pipeline will handle the analysis using existing MCP tools.

**Rationale**:
- The chat agent already has access to expense, invoice, bank transaction, and analytics tools
- Injecting a structured user message with insight context gives the agent everything it needs
- No new agent tools required — existing `financial_intelligence` MCP tools cover the analysis
