# Research: Scheduled Reports via Chat + Bank Recon Integration

**Date**: 2026-03-21
**Branch**: `031-chat-sched-report-bank-recon`

## Decision 1: Tool Architecture (MCP vs Tool Factory)

**Decision**: All new chat tools built as MCP server endpoints, consumed via `convex/lib/mcpClient.ts`.
**Rationale**: CLAUDE.md mandates MCP-first. Tool factory is deprecated for new tools. MCP enables Slack bots, API partners, and mobile apps to use the same capabilities.
**Alternatives considered**: Adding to `tool-factory.ts` (rejected — violates architecture mandate).

## Decision 2: Report Schedule Storage

**Decision**: Extend the existing `export_schedules` pattern. Create a new `report_schedules` table with similar fields (frequency, dayOfWeek, dayOfMonth, recipients, nextRunDate, lastRunDate, isActive, deletedAt).
**Rationale**: `export_schedules` already has the scheduling infrastructure (frequency validators, next-run calculation). Report schedules add report-type-specific fields (reportType, currency, periodType).
**Alternatives considered**: Reusing `export_schedules` directly (rejected — report schedules have different semantics: report type, PDF generation, different execution path).

## Decision 3: Report Generation Location

**Decision**: PDF generation happens in Lambda (not Convex). EventBridge triggers Lambda → Lambda queries Convex for data → generates PDF in Lambda → sends email via SES → writes run history back to Convex.
**Rationale**: PDF generation is CPU-intensive and would consume Convex bandwidth. Lambda has native SES access via IAM. Existing `scheduled-reports` EventBridge rule already exists (monthly, can be extended to daily/weekly).
**Alternatives considered**: Generating PDF in Convex action (rejected — bandwidth cost, no native AWS SDK access). Generating in Vercel API route (rejected — no persistent scheduling).

## Decision 4: Report PDF Template Approach

**Decision**: Use `@react-pdf/renderer` in Lambda (Node.js) with shared report template components. Each report type (P&L, Cash Flow, AR Aging, AP Aging, Expense Summary) gets its own template.
**Rationale**: `@react-pdf/renderer` is already used for sales invoice PDFs. Reusing the same library reduces learning curve. Templates can be shared between on-demand and scheduled generation.
**Alternatives considered**: HTML-to-PDF (rejected — less control over layout). CSV-only (rejected — spec requires PDF attachment).

## Decision 5: Bank Recon Chat Trigger Flow

**Decision**: Chat tool → MCP endpoint → Convex action that orchestrates Tier 1 + Tier 2 matching → returns structured results → chat displays as action cards.
**Rationale**: Reuses existing `bankReconClassifier.ts` (Tier 1) and DSPy modules (Tier 2). MCP endpoint wraps the orchestration. Action cards use existing registry pattern.
**Alternatives considered**: Calling DSPy Lambda directly from chat (rejected — MCP-first mandate, also loses Tier 1 optimization).

## Decision 6: Match Card Interactive Buttons

**Decision**: Register new action card type `bank_recon_match` in the existing action card registry. Accept/Reject buttons call Convex mutations directly (same pattern as expense approval cards).
**Rationale**: Action card registry is the established pattern. Expense approval cards already demonstrate Accept/Reject flow with journal entry creation.
**Alternatives considered**: Custom chat message component (rejected — breaks established pattern).

## Decision 7: EventBridge Schedule Frequency

**Decision**: Extend the existing `scheduled-reports` EventBridge rule to run daily at 4am UTC. The Lambda handler checks each schedule's frequency and only processes schedules that are due.
**Rationale**: A single daily EventBridge rule is simpler than managing separate daily/weekly/monthly rules. The Lambda handler does the frequency filtering in <1ms. Cost: one Lambda invocation/day (~$0.00/month).
**Alternatives considered**: Three separate EventBridge rules (rejected — unnecessary complexity, harder to maintain).

## Decision 8: Bulk Accept Pattern

**Decision**: Bulk accept implemented as a chat command ("Accept all above X%") that calls a Convex mutation accepting all pending matches above the threshold for the current recon run. Agent confirms count before executing.
**Rationale**: Reduces chat noise from individual card interactions. Confirmation step prevents accidental bulk acceptance.
**Alternatives considered**: UI-only bulk (rejected — breaks chat-first mandate). Auto-accept above threshold without confirmation (rejected — financial operations need explicit consent).
