# Quickstart: Usage Tracking

**Branch**: `001-usage-tracking`
**Prerequisites**: Node.js 20.x, Convex CLI, access to Stripe test mode

## Setup

```bash
git checkout 001-usage-tracking
npm install
npx convex dev   # Start Convex dev server (auto-syncs schema changes)
```

## Key Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `convex/schema.ts` | Add tables | `ai_message_usage`, `einvoice_usage`, `credit_packs` |
| `convex/functions/aiMessageUsage.ts` | Create | AI chat usage queries, mutations, pre-flight |
| `convex/functions/einvoiceUsage.ts` | Create | E-invoice usage queries, mutations |
| `convex/functions/salesInvoiceUsage.ts` | Create | Sales invoice count query (derived from existing table) |
| `convex/functions/creditPacks.ts` | Create | Credit pack management, FIFO consumption, expiry |
| `convex/crons.ts` | Modify | Add daily credit pack expiry job |
| `src/lib/stripe/catalog.ts` | Modify | Add `aiMessageLimit`, `invoiceLimit`, `einvoiceLimit` to `PlanConfig` |
| `src/app/api/copilotkit/route.ts` | Modify | Add AI chat pre-flight check |
| `convex/functions/salesInvoices.ts` | Modify | Add invoice count pre-flight check in `create()` |
| `src/app/api/v1/billing/subscription/route.ts` | Modify | Extend response with all usage types + credit packs |
| `src/domains/billing/hooks/use-subscription.ts` | Modify | Extend client hook with new usage data |
| `src/lib/stripe/webhook-handlers-convex.ts` | Modify | Handle credit pack checkout completion |

## Reference Patterns

**OCR Usage** (follow this pattern for all new usage modules):
- Schema: `convex/schema.ts` lines 727-746
- Functions: `convex/functions/ocrUsage.ts`
- Key patterns: `getCurrentUsage()`, `hasCredits()`, `recordUsageFromApi()`, `reserveCredits()`

**Stripe Webhooks** (follow this pattern for credit pack purchases):
- Handler: `src/app/api/v1/billing/webhooks/route.ts`
- Event processors: `src/lib/stripe/webhook-handlers-convex.ts`
- Idempotency: `stripeEvents` table prevents duplicate processing

**Cron Jobs** (follow this pattern for daily expiry):
- Config: `convex/crons.ts`
- Example: `mark-overdue-invoices` runs daily at 00:00 UTC

## Implementation Order

1. Schema changes (tables + indexes)
2. Plan config extension (catalog.ts limits)
3. Usage query/mutation modules (follow OCR pattern)
4. Credit pack module (FIFO + expiry)
5. Pre-flight checks (API routes + Convex mutations)
6. Billing API extension (subscription endpoint)
7. Client hook extension (use-subscription.ts)
8. Daily cron job (credit pack expiry)
9. Stripe webhook extension (credit pack purchases)

## Testing Strategy

- **Unit**: Test each Convex function in isolation (getCurrentUsage, hasCredits, recordUsage)
- **Integration**: Test pre-flight → action → usage recording flow end-to-end
- **Edge cases**: Concurrent access, month rollover, credit pack FIFO, expiry boundary
- **Build verification**: `npm run build` must pass before completion
- **Convex deployment**: `npx convex deploy --yes` after all schema/function changes
