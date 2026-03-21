# Research: Multi-Currency Display & Historical Trend Analysis

**Date**: 2026-03-21
**Branch**: `031-multi-curr-history-analysis`

## Decision 1: Exchange Rate Source

**Decision**: Use `currencyService.convertAmount()` from `src/lib/services/currency-service.ts` for current-rate conversion. Falls back to `manual_exchange_rates` table, then static fallback rates.

**Rationale**: The service already handles provider failover (Fixer.io → ExchangeRate-API → static), 5-minute caching, and the `CurrencyConversion` return type. No need to build new rate-fetching logic.

**Alternatives considered**:
- Query `manual_exchange_rates` directly — rejected because currencyService already wraps this with caching and fallback
- Call external API from Convex action — rejected because Convex actions can't use external HTTP natively without workarounds

## Decision 2: Date Range Resolution

**Decision**: Extend existing `resolveDateRange()` from `src/lib/ai/utils/date-range-resolver.ts` to support quarter references ("Q1 2025", "Q1 vs Q2") and year-over-year patterns.

**Rationale**: The resolver already handles months, relative periods, rolling windows, and explicit dates. Adding quarter support is a small extension. The resolver is deterministic (no LLM inference needed).

**Alternatives considered**:
- Build separate date parser for trend tools — rejected, DRY violation
- Let the LLM parse dates — rejected, non-deterministic and error-prone

## Decision 3: Journal Entry Aggregation Pattern

**Decision**: Create a new Convex `action` (not `query`) for trend aggregation that calls internal queries. Follow the bandwidth-conscious pattern from CLAUDE.md.

**Rationale**: Trend analysis scans potentially thousands of journal entry lines across 12+ months. Using a reactive `query` would re-run on every document change, burning bandwidth. An `action` runs once on demand.

**Alternatives considered**:
- Convex reactive `query` — rejected per CLAUDE.md Rule 1 (never use reactive query for heavy aggregations)
- Lambda via EventBridge — overkill for on-demand user-triggered queries; EventBridge is for scheduled jobs

## Decision 4: Metric Calculation from Account Codes

**Decision**: Map financial metrics to Chart of Accounts ranges:
- **Revenue**: Account codes 4000-4999 (credit amounts)
- **Expenses**: Account codes 5000-5999 (debit amounts)
- **COGS**: Account codes 5000-5099 (subset of expenses, if tracked separately)
- **Profit**: Revenue - Expenses (derived)
- **Cash Flow**: Net of all account movements (Assets 1xxx cash accounts)

**Rationale**: This matches the existing `analyzeCashFlow` pattern in `financialIntelligence.ts` (lines 274-282) where revenue = 4000-4999 credits, expenses = 5000-5999 debits.

## Decision 5: Tool Architecture

**Decision**: Create 2 new tools (not 3) — `analyze_trends` handles both comparison and trend use cases based on parameters. `display_currency` parameter added as optional to existing financial tools.

**Rationale**:
- `analyze_trends` — single tool for comparisons, trends, and growth rates (differentiated by params: `mode: 'compare' | 'trend' | 'growth'`)
- Currency display is an overlay on existing tool responses, not a separate tool. Existing tools (cash flow, AR summary, etc.) gain an optional `display_currency` param.

**Alternatives considered**:
- 3 separate tools (compare, trend, growth) — rejected, too many similar tools pollute the agent's tool list
- MCP-first per CLAUDE.md — considered, but these are read-only analytical tools tightly coupled to Convex data; MCP-first applies to new capabilities that cross service boundaries

## Decision 6: Action Card Design

**Decision**: Create one new action card `trend_comparison_card` that handles both comparison (2-period side-by-side) and trend (multi-period chart) views. Reuse the CSS-based bar chart pattern from `spending-time-series.tsx`.

**Rationale**: The existing `spending-time-series.tsx` already renders multi-period bar charts with trend arrows using pure CSS (no charting library). The same pattern works for trend visualization. A single card with a `mode` field keeps the registry clean.

## Decision 7: RBAC Placement

**Decision**: Add `analyze_trends` to `MANAGER_TOOLS` set (accessible by manager, finance_admin, owner). Currency display parameter on existing tools requires no RBAC change — it's just a formatting option.

**Rationale**: Per clarification, trend/comparison/growth tools are Manager + CFO only. The `MANAGER_TOOLS` set already includes tools accessible to manager and above. Currency display is a presentation concern, not a data access concern.
