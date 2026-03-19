# Implementation Plan: AI Agent RBAC Security Hardening & Intelligence Gaps

**Branch**: `026-agent-rbac-hardening` | **Date**: 2026-03-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/026-agent-rbac-hardening/spec.md`

## Summary

Harden the AI chat agent's role-based access control across 3 layers (schema filtering, tool execution, system prompt), fix businessId validation, add 5 new finance tools (AP search, AP aging, AR summary, business-wide transactions, scoped action center insights), enhance team summary with vendor filtering, and improve clarification logic for manager queries.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Next.js 15.5.7
**Primary Dependencies**: LangGraph 0.4.5, Convex 1.31.3, Qwen3-8B (Modal), Zod 3.23.8
**Storage**: Convex (tables: invoices, sales_invoices, journal_entry_lines, business_memberships, users)
**Testing**: Manual UAT via chat agent (3 test accounts: admin, manager, employee in .env.local)
**Target Platform**: Vercel (web) + Capacitor (iOS)
**Project Type**: Web application (Next.js App Router + Convex backend)
**Performance Goals**: Tool response < 2s, no regression in existing tool performance
**Constraints**: Convex free plan bandwidth limits (2GB/month) — use `action` + `internalQuery` for aggregations, never reactive `query`
**Scale/Scope**: ~20 files modified, ~5 new files, 4 roles × 16+ tools matrix

## Constitution Check

No project-specific constitution defined. Proceeding with CLAUDE.md rules:
- All Convex changes must be deployed with `npx convex deploy --yes`
- Use `action` + `internalQuery` for aggregations (bandwidth rule)
- Button styling: primary for actions, secondary for cancel, destructive for delete
- Git author: grootdev-ai / dev@hellogroot.com
- Build must pass before task completion

## Project Structure

### Documentation (this feature)

```text
specs/026-agent-rbac-hardening/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: research findings
├── data-model.md        # Phase 1: entity & access model
├── contracts/           # Phase 1: Convex function contracts
│   └── convex-functions.md
├── quickstart.md        # Phase 1: implementation guide
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2: implementation tasks
```

### Source Code (repository root)

```text
# Files to MODIFY (existing):
src/lib/ai/tools/base-tool.ts                    # FR-001: Add role propagation
src/lib/ai/tools/tool-factory.ts                  # FR-002: Tiered tool access
src/lib/ai/agent/config/prompts.ts                # FR-004: Role-aware system prompt
src/lib/ai/agent/nodes/intent-node.ts             # FR-007-010: Smart clarification
src/lib/ai/tools/team-summary-tool.ts             # FR-016: Add vendor filter
src/lib/ai/tools/get-invoices-tool.ts             # FR-011: Add search filters
src/app/api/copilotkit/route.ts                   # FR-003: BusinessId validation
convex/functions/financialIntelligence.ts          # Backend queries for new tools
convex/functions/invoices.ts                       # AP search/aging queries
convex/functions/salesInvoices.ts                  # AR summary query

# Files to CREATE (new):
src/lib/ai/tools/search-invoices-tool.ts          # FR-011/012: AP invoice search + detail
src/lib/ai/tools/ar-summary-tool.ts               # FR-013: AR aging/revenue summary
src/lib/ai/tools/ap-aging-tool.ts                 # FR-014: AP aging report
src/lib/ai/tools/business-transactions-tool.ts    # FR-015: Business-wide transactions
```

**Structure Decision**: All changes fit within the existing domain structure. New tools follow the established `BaseTool` pattern in `src/lib/ai/tools/`. New Convex queries go in existing function files (no new Convex modules needed). No new pages or UI components — all output flows through the existing chat action card system.
