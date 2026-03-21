# Implementation Plan: Scheduled Reports via Chat + Bank Recon Integration

**Branch**: `031-chat-sched-report-bank-recon` | **Date**: 2026-03-21 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/031-chat-sched-report-bank-recon/spec.md`

## Summary

Enable users to schedule recurring financial reports (P&L, Cash Flow, AR/AP Aging, Expense Summary) and trigger bank reconciliation — all via natural-language chat commands. Reports are generated as PDF + HTML email on schedule via EventBridge → Lambda. Bank recon reuses the existing Tier 1 + Tier 2 DSPy matching engine, surfacing results as interactive action cards in chat with Accept/Reject/Bulk Accept capabilities.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (Next.js 15.5.7, Convex 1.31.3), Node.js 20 (Lambda)
**Primary Dependencies**: Convex, LangGraph 0.4.5, @react-pdf/renderer, AWS SES, MCP client
**Storage**: Convex (report_schedules, report_runs, bank_recon_runs tables)
**Testing**: Manual UAT via chat + email verification, build validation (`npm run build`)
**Target Platform**: Vercel (Next.js) + AWS Lambda + Convex Cloud
**Project Type**: Web application (existing monolith)
**Performance Goals**: Report scheduling <60s chat flow, recon results <30s for 500 txns, report delivery within 15min of scheduled time
**Constraints**: Convex 2GB/month bandwidth (report gen in Lambda), MCP-first tool architecture, EventBridge-first for scheduled jobs
**Scale/Scope**: ~50 businesses, ~10 schedules/business max, ~500 bank txns/recon run

## Constitution Check

*No project constitution defined. Proceeding with CLAUDE.md rules as governing constraints.*

Key CLAUDE.md constraints verified:
- MCP-first for all new tools
- EventBridge-first for scheduled jobs reading >10 documents
- Double-entry bookkeeping for all journal entries
- Role-based access control
- `npx convex deploy --yes` after schema changes
- Git author: `grootdev-ai <dev@hellogroot.com>`

## Project Structure

### Documentation (this feature)

```text
specs/031-chat-sched-report-bank-recon/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: research decisions
├── data-model.md        # Phase 1: entity design
├── quickstart.md        # Phase 1: build sequence
├── contracts/
│   └── mcp-tools.md     # Phase 1: MCP tool contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2: implementation tasks
```

### Source Code (repository root)

```text
convex/
├── schema.ts                          # MODIFY: Add 3 tables
├── functions/
│   ├── reportSchedules.ts             # CREATE: CRUD for schedules
│   ├── reportRuns.ts                  # CREATE: Run history queries
│   ├── bankReconRuns.ts               # CREATE: Recon run tracking
│   └── scheduledReportJobs.ts         # MODIFY: Implement from stub

src/
├── lib/
│   └── reports/
│       └── templates/                 # CREATE: PDF templates
│           ├── pnl-template.tsx
│           ├── cash-flow-template.tsx
│           ├── ar-aging-template.tsx
│           ├── ap-aging-template.tsx
│           └── expense-summary-template.tsx
├── domains/
│   └── chat/
│       └── components/
│           └── action-cards/
│               ├── registry.ts                    # MODIFY: Register bank_recon_match
│               └── bank-recon-match-card.tsx       # CREATE: Match action card

infra/
├── lib/
│   ├── mcp-server-stack.ts            # MODIFY: Add 4 MCP endpoints
│   └── scheduled-intelligence-stack.ts # MODIFY: Daily schedule

src/lambda/
├── mcp-server/
│   └── tools/
│       ├── schedule-report.ts         # CREATE: MCP tool handler
│       ├── run-bank-recon.ts          # CREATE: MCP tool handler
│       ├── accept-recon-match.ts      # CREATE: MCP tool handler
│       └── show-recon-status.ts       # CREATE: MCP tool handler
└── scheduled-intelligence/
    └── modules/
        └── scheduled-reports.ts       # MODIFY: Full implementation
```

**Structure Decision**: Existing monolith structure. New code follows domain-driven design: report templates in shared `src/lib/reports/`, chat action card in `src/domains/chat/`, MCP tools in Lambda, Convex functions for data layer.
