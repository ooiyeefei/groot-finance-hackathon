# Quickstart: Multi-Currency Display & Historical Trend Analysis

## Prerequisites

- Node.js 20+, npm
- Convex CLI (`npx convex`)
- Groot Finance repo cloned, on branch `031-multi-curr-history-analysis`

## Setup

```bash
npm install
npx convex dev  # Only from main working directory, never from worktrees
```

## Files to Create/Modify

### New Files
1. `src/lib/ai/tools/analyze-trends-tool.ts` — New tool class
2. `convex/functions/trendAnalysis.ts` — Convex action for journal aggregation
3. `src/domains/chat/components/action-cards/trend-comparison-card.tsx` — Action card component

### Modified Files
1. `src/lib/ai/tools/tool-factory.ts` — Register new tool + RBAC
2. `src/lib/ai/utils/date-range-resolver.ts` — Add quarter support
3. `src/domains/chat/components/action-cards/index.tsx` — Import new card
4. Existing financial tools (cash flow, AR, AP, transactions) — Add optional `display_currency` param

## Testing

```bash
# Build check
npm run build

# Manual UAT via chat:
# 1. "Show revenue in USD" → dual-currency display
# 2. "Compare Q1 2025 vs Q1 2026" → comparison card
# 3. "6-month expense trend" → trend chart card
# 4. "Revenue growth rate" → growth percentage

# Deploy Convex after schema/function changes
npx convex deploy --yes
```

## Key Design Decisions

- **Current exchange rate only** — all conversions use today's rate for consistency
- **Action (not query)** for aggregation — avoids reactive bandwidth burn
- **MANAGER_TOOLS RBAC** — trend tools require manager+ role; currency display is unrestricted
- **Single tool** (`analyze_trends`) with mode parameter — keeps agent tool list clean
- **CSS-based charts** — follows existing spending-time-series pattern, no charting library
