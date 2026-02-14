# Quickstart: Chat Action Cards Expansion

**Feature**: 013-chat-action-cards
**Branch**: `013-chat-action-cards`

## Prerequisites

- Node.js 20.x
- `npm install` (dependencies already in package.json)
- Convex dev running: `npx convex dev`
- Environment variables set (`.env.local`)

## Adding a New Action Card (Pattern)

Every action card follows this 3-step pattern:

### Step 1: Create the card component

```
src/domains/chat/components/action-cards/<card-name>.tsx
```

- Import `registerActionCard` and `ActionCardProps` from `./registry`
- Define a data interface for the card's expected data shape
- Build the React component using `action.data` and `isHistorical`
- Call `registerActionCard('card_type', Component)` at module level

### Step 2: Register via side-effect import

```
src/domains/chat/components/action-cards/index.tsx
```

- Add `import './<card-name>'` to trigger the side-effect registration

### Step 3: Update the system prompt

```
src/lib/ai/agent/config/prompts.ts
```

- Add a numbered entry under `ACTION CARD GENERATION PROTOCOL`
- Define when the card should be emitted and what data shape to use

## File Map

| File | Purpose |
|------|---------|
| `src/domains/chat/components/action-cards/registry.ts` | Card registry (unchanged) |
| `src/domains/chat/components/action-cards/index.tsx` | Side-effect imports + FallbackCard |
| `src/domains/chat/components/action-cards/invoice-posting-card.tsx` | NEW: Invoice posting card |
| `src/domains/chat/components/action-cards/cash-flow-dashboard.tsx` | NEW: Cash flow dashboard |
| `src/domains/chat/components/action-cards/compliance-alert-card.tsx` | NEW: Compliance alert |
| `src/domains/chat/components/action-cards/budget-alert-card.tsx` | NEW: Budget alert |
| `src/domains/chat/components/action-cards/spending-time-series.tsx` | NEW: Time-series chart |
| `src/domains/chat/components/action-cards/bulk-action-bar.tsx` | NEW: Bulk action wrapper |
| `src/domains/chat/lib/csv-export.ts` | NEW: CSV export utility |
| `src/lib/ai/agent/config/prompts.ts` | MODIFY: Add new card types to prompt |
| `src/domains/chat/components/chat-window.tsx` | MODIFY: Wire rich content panel |
| `src/domains/chat/components/rich-content-panel.tsx` | MODIFY: Add trigger mechanism |

## Build & Verify

```bash
npm run build          # Must pass with zero errors
npx convex dev         # Verify no schema issues (no schema changes in this feature)
```

## Testing

1. Start dev server: `npm run dev`
2. Open chat widget
3. Test each card type:
   - Invoice posting: "Show my recently processed invoices"
   - Cash flow: "What's my cash flow situation?"
   - Compliance: "What are the GST registration requirements in Singapore?"
   - Budget: "Am I overspending this month?"
   - Time-series: "Show spending trends for the last 6 months"
4. Verify historical view: Reload page, scroll to old messages — cards should render read-only
