# Implementation Plan: MCP-First Tool Architecture

**Branch**: `032-mcp-first` | **Date**: 2026-03-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/032-mcp-first/spec.md`

## Summary

Migrate all chat agent tools from a dual-system architecture (tool-factory + MCP server) to MCP-first: new tools built as MCP endpoints, existing 22 tool-factory-only tools migrated in domain batches, tool-factory refactored to thin MCP client wrapper. Adds CloudWatch alarms and extends metrics tracking for observability.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (Next.js 15.5.7, Node.js 20 Lambda)
**Primary Dependencies**: LangGraph 0.4.5 (chat agent), Convex 1.31.3 (DB), AWS CDK v2 (infra), JSON-RPC 2.0 (MCP protocol)
**Storage**: Convex (data layer), S3 (artifacts), CloudWatch (logs/metrics)
**Testing**: Manual regression testing via chat queries per tool, CloudWatch Insights for latency verification
**Target Platform**: Vercel (Next.js frontend), AWS Lambda (MCP server), Convex Cloud (DB)
**Project Type**: Web application (monorepo)
**Performance Goals**: <150ms additional latency per MCP tool call vs direct execution
**Constraints**: Convex 2GB/month bandwidth limit (free plan), Lambda 512MB/30s timeout, ARM_64
**Scale/Scope**: 34 total tools (12 already on MCP, 22 to migrate), 4 domain batches, 3 phases

## Constitution Check

*No project constitution defined — gates pass by default.*

## Project Structure

### Documentation (this feature)

```text
specs/032-mcp-first/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: technical research
├── data-model.md        # Phase 1: MCP tool contracts & data model
├── quickstart.md        # Phase 1: developer guide for MCP-first tools
├── contracts/           # Phase 1: MCP tool contract definitions
│   ├── finance-batch.md # AP/AR/invoice tool contracts
│   ├── team-batch.md    # Team/manager tool contracts
│   ├── memory-batch.md  # Memory tool contracts
│   └── misc-batch.md    # Remaining tool contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2: implementation tasks
```

### Source Code (repository root)

```text
# MCP Server (Lambda) — tool implementations
src/lambda/mcp-server/
├── handler.ts                    # JSON-RPC router (MODIFY: add new tools)
├── contracts/mcp-tools.ts        # Tool schemas (MODIFY: add migrated tool schemas)
├── lib/logger.ts                 # Structured logger (REUSE as-is)
├── tools/                        # Tool implementations
│   ├── [existing 12 tools]       # Already on MCP
│   ├── get-invoices.ts           # NEW: migrated from tool-factory
│   ├── get-sales-invoices.ts     # NEW: migrated from tool-factory
│   ├── get-transactions.ts       # NEW: migrated from tool-factory
│   ├── get-vendors.ts            # NEW: migrated from tool-factory
│   ├── search-documents.ts       # NEW: migrated from tool-factory
│   ├── search-regulatory-kb.ts   # NEW: migrated from tool-factory
│   ├── get-ar-summary.ts         # NEW: migrated from tool-factory
│   ├── get-ap-aging.ts           # NEW: migrated from tool-factory
│   ├── get-business-transactions.ts # NEW: migrated from tool-factory
│   ├── get-employee-expenses.ts  # NEW: migrated from tool-factory
│   ├── get-team-summary.ts       # NEW: migrated from tool-factory
│   ├── get-late-approvals.ts     # NEW: migrated from tool-factory
│   ├── compare-team-spending.ts  # NEW: migrated from tool-factory
│   ├── set-budget.ts             # NEW: migrated from tool-factory
│   ├── check-budget-status.ts    # NEW: migrated from tool-factory
│   ├── memory-store.ts           # NEW: migrated from tool-factory
│   ├── memory-search.ts          # NEW: migrated from tool-factory
│   ├── memory-recall.ts          # NEW: migrated from tool-factory
│   ├── memory-forget.ts          # NEW: migrated from tool-factory
│   ├── create-expense-from-receipt.ts # NEW: migrated from tool-factory
│   ├── get-action-center-insight.ts   # NEW: migrated from tool-factory
│   └── analyze-trends.ts         # NEW: migrated from tool-factory

# Tool Factory (chat agent) — becomes thin wrapper
src/lib/ai/tools/
├── tool-factory.ts               # MODIFY: replace business logic with MCP client calls
├── mcp-tool-wrapper.ts           # NEW: generic MCP delegation helper
└── [existing 34 tool files]      # MODIFY: each becomes MCP delegate or DELETE

# MCP Client (Convex) — internal service calls
convex/lib/mcpClient.ts           # REUSE: callMCPTool() / callMCPToolsBatch()

# Infrastructure (CDK)
infra/lib/
├── mcp-server-stack.ts           # MODIFY: add CloudWatch alarms + SNS
└── scheduled-intelligence-stack.ts # REFERENCE: alarm patterns to copy

# Convex Schema
convex/schema.ts                  # MODIFY: extend dspy_metrics_daily for MCP tool names
```

**Structure Decision**: No new directories created. All changes go into existing MCP server, tool-factory, infra, and Convex schema locations. The migration replaces tool-factory implementations with MCP client delegates.

## Complexity Tracking

No constitution violations to justify.
