# Implementation Plan: Cross-Business Benchmarking, Email Integration & Voice Input

**Branch**: `031-chat-cross-biz-voice` | **Date**: 2026-03-21 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/031-chat-cross-biz-voice/spec.md`

## Summary

Three independently deliverable chat agent capabilities: (P1) Email financial reports via chat using existing SES infrastructure and a new MCP tool, (P2) Voice-to-text input using Web Speech API and Capacitor native speech recognition, (P3) Cross-business anonymized benchmarking with opt-in, weekly pre-computed aggregates, and a new MCP comparison tool.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (Next.js 15.5.7, Node.js 20 Lambda)
**Primary Dependencies**: LangGraph 0.4.5, Convex 1.31.3, AWS SES, Capacitor 8.1.0, Web Speech API
**Storage**: Convex (3 new tables: `email_send_logs`, `benchmarking_opt_ins`, `benchmarking_aggregates`)
**Testing**: Manual UAT via chat interface + Convex dashboard verification
**Target Platform**: Web (Chrome/Edge/Safari), iOS (Capacitor), Android (Capacitor)
**Project Type**: Web + Mobile hybrid
**Performance Goals**: Email send <30s end-to-end, Benchmarking query <5s, Voice transcription real-time
**Constraints**: 50 emails/business/day, 10 minimum businesses per benchmark group, English-only voice
**Scale/Scope**: ~100 businesses initially, 5 benchmark metrics, ~50 emails/day total

## Constitution Check

*GATE: No constitution defined (template placeholders only). Proceeding with CLAUDE.md rules as governance.*

**CLAUDE.md Compliance**:
- [x] MCP-first: All new tools as MCP endpoints (send_email_report, compare_to_industry, toggle_benchmarking)
- [x] EventBridge-first: Weekly benchmarking aggregation via EventBridge → Lambda → Convex HTTP API
- [x] Agent-first: All features accessible through chat agent (no standalone pages)
- [x] No new tool-factory tools: All via MCP server
- [x] Convex bandwidth: Pre-computed aggregates avoid reactive queries on large datasets
- [x] Security: RBAC enforced at MCP level, email confirmation before send
- [x] AWS-first for AWS operations: Email sending in Lambda (IAM-native SES access)

## Project Structure

### Documentation (this feature)

```text
specs/031-chat-cross-biz-voice/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research decisions
├── data-model.md        # Phase 1 data model
├── quickstart.md        # Phase 1 quickstart guide
├── contracts/
│   └── mcp-tools.md     # MCP tool input/output contracts
└── tasks.md             # Phase 2 task breakdown (via /speckit.tasks)
```

### Source Code (repository root)

```text
# P1: Email Integration
src/lambda/mcp-server/
├── tools/send-email-report.ts          # MCP tool: send formatted report email
├── contracts/mcp-tools.ts              # Updated: add send_email_report schema
lambda/shared/
├── templates/index.ts                  # Updated: add financial_report template
convex/
├── schema.ts                           # Updated: add email_send_logs table
├── functions/emailSendLogs.ts          # New: CRUD + rate limit queries

# P2: Voice Input
src/domains/chat/
├── components/voice-input-button.tsx   # New: microphone button with recording UI
├── components/chat-window.tsx          # Updated: integrate voice button
├── hooks/use-voice-input.ts           # New: voice recording + transcription hook

# P3: Benchmarking
src/lambda/mcp-server/
├── tools/compare-to-industry.ts        # MCP tool: benchmark comparison
├── tools/toggle-benchmarking.ts        # MCP tool: opt-in/out toggle
convex/
├── schema.ts                           # Updated: add benchmarking tables
├── functions/benchmarking.ts           # New: opt-in CRUD, aggregate queries, metric computation
src/lambda/scheduled-intelligence/
├── modules/benchmarking-aggregation.ts # New: weekly EventBridge aggregation module
infra/lib/
├── scheduled-intelligence-stack.ts     # Updated: add benchmarking EventBridge rule
```

**Structure Decision**: Follows existing domain-driven structure. MCP tools in `src/lambda/mcp-server/tools/`, chat UI in `src/domains/chat/`, Convex functions in `convex/functions/`, infra in `infra/lib/`.

## Complexity Tracking

No constitution violations to justify. All patterns follow established CLAUDE.md architecture (MCP-first, EventBridge-first, domain-driven).
