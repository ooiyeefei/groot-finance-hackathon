# Quickstart: Proactive Chat Alerts

## Prerequisites
- Convex dev environment running (`npx convex dev` from main working directory only)
- SES domain verified (notifications.hellogroot.com — already done)
- APNs credentials in SSM (already configured)

## Implementation Order

1. **Schema** — Add `proactive_alert_delivery` table to `convex/schema.ts`
2. **Backend** — Create `convex/functions/proactiveAlerts.ts` with pushToChat, handleAction, getUnreadCount, sendMobilePush
3. **Hook** — Modify `actionCenterInsights.internalCreate` to schedule pushToChat for high/critical
4. **Action Card** — Create `proactive-alert-card` component in `src/domains/chat/components/action-cards/`
5. **Badge** — Add unread count query to chat widget
6. **Email Digest** — Implement `emailDigestJobs.runWeeklyDigest` body
7. **Deploy** — `npx convex deploy --yes` then verify

## Testing

1. Create a test insight via Convex dashboard or test utility
2. Verify chat message appears in user's conversation
3. Click Investigate — verify AI agent responds with analysis
4. Click Dismiss — verify insight status updates
5. Check badge count on sidebar chat widget
6. Trigger weekly digest — verify email delivery via SES console

## Key Files to Modify

| File | Change |
|------|--------|
| `convex/schema.ts` | Add proactive_alert_delivery table |
| `convex/functions/proactiveAlerts.ts` | NEW — core alert pipeline |
| `convex/functions/actionCenterInsights.ts` | Add scheduler call in internalCreate |
| `convex/functions/emailDigestJobs.ts` | Implement runWeeklyDigest body |
| `src/domains/chat/components/action-cards/proactive-alert-card.tsx` | NEW — alert card UI |
| `src/domains/chat/components/action-cards/index.tsx` | Register new card |
| `src/domains/chat/components/chat-widget.tsx` (or equivalent) | Add badge |
| `src/lambda/scheduled-intelligence/modules/` | Wire weekly-email-digest module |
