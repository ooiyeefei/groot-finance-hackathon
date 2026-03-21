# Implementation Plan: Multi-Currency Display & Historical Trend Analysis

**Branch**: `031-multi-curr-history-analysis` | **Date**: 2026-03-21 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/031-multi-curr-history-analysis/spec.md`

## Summary

Add multi-currency display and historical trend analysis capabilities to the chat agent. Two new tools: `analyze_trends` (comparison, trend, growth rate) and `display_currency` extension on existing financial tools. Results rendered as action cards with CSS-based charts. Manager+ RBAC for analytical tools, all-user access for currency display.

## Technical Context

**Language/Version**: TypeScript 5.9.3
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, LangGraph 0.4.5
**Storage**: Convex (journal_entries, journal_entry_lines, manual_exchange_rates)
**Testing**: `npm run build` + manual UAT via chat
**Target Platform**: Web (Vercel) + iOS (Capacitor)
**Project Type**: Web application (Next.js + Convex)
**Performance Goals**: Trend queries <3s for 12-month range
**Constraints**: Convex free tier bandwidth (2GB/month) — use action, not reactive query
**Scale/Scope**: 4 metrics × arbitrary date ranges × 4 currencies

## Constitution Check

*No project constitution defined — using CLAUDE.md rules as governance.*

**CLAUDE.md Gates**:
- [x] Convex bandwidth: Using `action` not `query` for aggregation ✅
- [x] MCP-first: Read-only analytical tools tightly coupled to Convex — tool-factory is appropriate ✅
- [x] Domain-driven design: Tools in `src/lib/ai/tools/`, action card in `src/domains/chat/` ✅
- [x] No new files without necessity: 3 new files (tool, convex action, action card) — all required ✅
- [x] IFRS compliance: Aggregation respects Chart of Accounts standard ranges ✅

## Project Structure

### Documentation (this feature)

```text
specs/031-multi-curr-history-analysis/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research decisions
├── data-model.md        # Data structures
├── quickstart.md        # Setup guide
├── contracts/
│   └── tool-schemas.md  # Tool and action card contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Implementation tasks (next phase)
```

### Source Code Changes

```text
# New files
src/lib/ai/tools/analyze-trends-tool.ts          # Chat agent tool
convex/functions/trendAnalysis.ts                  # Convex action for aggregation
src/domains/chat/components/action-cards/trend-comparison-card.tsx  # Action card

# Modified files
src/lib/ai/tools/tool-factory.ts                   # Register tool + RBAC
src/lib/ai/utils/date-range-resolver.ts            # Add quarter + YoY support
src/domains/chat/components/action-cards/index.tsx  # Import new card
src/lib/ai/tools/analyze-cashflow-tool.ts           # Add display_currency param
src/lib/ai/tools/ar-summary-tool.ts                 # Add display_currency param
src/lib/ai/tools/ap-aging-tool.ts                   # Add display_currency param
src/lib/ai/tools/business-transactions-tool.ts      # Add display_currency param
```

**Structure Decision**: Follows existing domain structure. Tools in `src/lib/ai/tools/`, Convex functions in `convex/functions/`, action cards in `src/domains/chat/components/action-cards/`. No new directories needed.
