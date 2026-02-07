# Implementation Plan: Manager Cross-Employee Financial Queries

**Branch**: `008-manager-agent-queries` | **Date**: 2026-02-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-manager-agent-queries/spec.md`

## Summary

Enable managers to query their direct reports' financial data through the AI assistant using natural language (e.g., "How much did Sarah spend at Starbucks in January 2026?"). This requires: new LangGraph tools for employee expense lookup and team aggregation, a new MCP server tool for team spending analytics, shared utilities for deterministic date calculation and category mapping, Convex query functions with authorization checks, role-based tool routing in the tool factory, and Zod output schemas for structured response formatting.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, LangGraph/LangChain, Zod 3.23.8, AWS CDK
**Storage**: Convex (document database with real-time sync)
**Testing**: Manual integration testing via AI assistant chat + `npm run build` validation
**Target Platform**: Vercel (Next.js) + AWS Lambda (MCP server) + Convex Cloud
**Project Type**: Web application (Next.js + Convex + Lambda)
**Performance Goals**: Manager query responses within 2x current personal query response time
**Constraints**: Convex query limitations (single index + in-memory filtering), Lambda 30s timeout
**Scale/Scope**: SME-sized businesses (typically <50 employees per manager, <10K accounting entries per business)

## Constitution Check

*No project constitution defined. Proceeding with standard engineering practices.*

## Project Structure

### Documentation (this feature)

```text
specs/008-manager-agent-queries/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research decisions
├── data-model.md        # Entity definitions and relationships
├── quickstart.md        # Build and deployment guide
├── contracts/
│   ├── langgraph-tools.md    # LangGraph tool input/output schemas
│   ├── mcp-tools.md          # MCP server tool contracts
│   └── convex-functions.md   # Convex query function signatures
└── checklists/
    └── requirements.md       # Spec quality checklist
```

### Source Code (repository root)

```text
src/lib/ai/
├── utils/
│   ├── date-range-resolver.ts     # NEW: Shared deterministic date calculator
│   └── category-mapper.ts         # NEW: NL category → IFRS mapping
├── tools/
│   ├── tool-factory.ts            # MODIFIED: Role-based tool routing
│   ├── base-tool.ts               # EXISTING: No changes
│   ├── transaction-lookup-tool.ts # MODIFIED: Use shared date resolver
│   ├── employee-expense-tool.ts   # NEW: get_employee_expenses
│   └── team-summary-tool.ts       # NEW: get_team_summary
├── config/
│   └── prompts.ts                 # MODIFIED: Manager tool descriptions
└── mcp/
    └── (existing, no changes)

convex/functions/
├── financialIntelligence.ts       # MODIFIED: 4 new query functions
└── memberships.ts                 # MODIFIED: resolveEmployeeByName

src/lambda/mcp-server/
├── handler.ts                     # MODIFIED: Register new tool
├── contracts/mcp-tools.ts         # MODIFIED: New tool schema
└── tools/
    └── analyze-team-spending.ts   # NEW: Team spending analytics
```

**Structure Decision**: All changes fit within the existing directory structure. No new directories created except `src/lib/ai/utils/` for shared utilities. The feature touches 3 layers: Convex (data), LangGraph tools (retrieval), and MCP server (analytics).

## Complexity Tracking

No complexity violations. All changes follow existing patterns:
- New tools follow the existing `BaseTool` abstract class pattern
- New Convex functions follow the existing `financialIntelligence.ts` query pattern
- New MCP tool follows the existing `detect-anomalies.ts` implementation pattern
- No new databases, services, or architectural layers introduced
