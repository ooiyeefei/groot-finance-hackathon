# Research: Cross-Business Benchmarking, Email Integration & Voice Input

**Date**: 2026-03-21 | **Branch**: `031-chat-cross-biz-voice`

## Decision 1: Email Sending Architecture

**Decision**: New MCP tool `send_email_report` on the existing `finanseal-mcp-server` Lambda, using the existing `sendEmail()` from `lambda/shared/email-service.ts`.

**Rationale**: MCP-first architecture (CLAUDE.md mandate). SES infrastructure is production-ready — domain verified (`notifications.hellogroot.com`), DKIM configured, config set `finanseal-transactional` with delivery tracking. The Lambda already has SES permissions via the durable workflow construct pattern.

**Alternatives Considered**:
- Tool-factory tool (rejected — CLAUDE.md says no new tool-factory tools)
- Convex action calling SES directly (rejected — Convex can't use AWS SDK natively; Lambda has IAM-native access)
- New standalone Lambda (rejected — MCP server already exists and handles tool dispatch)

## Decision 2: Email HTML Template Generation

**Decision**: Create a `financial_report` template in `lambda/shared/templates/index.ts` using the existing `{{variable}}` placeholder system. The MCP tool receives report data from the agent, renders it into the template, and sends via SES.

**Rationale**: Existing template system is simple and battle-tested (welcome, digest, notification templates). Financial report emails need tables and formatted numbers — standard HTML, no complex rendering needed.

**Alternatives Considered**:
- React Email / @react-email/components (rejected — over-engineering for inlined HTML templates)
- PDF attachment (rejected — spec says formatted email, not attachment)

## Decision 3: Voice Input — Transcription Engine

**Decision**: Web Speech API (`webkitSpeechRecognition` / `SpeechRecognition`) for web browsers. Capacitor `@capacitor-community/speech-recognition` plugin for native iOS/Android.

**Rationale**: Both are client-side only (zero server cost, zero latency). Web Speech API is supported in Chrome/Edge (90%+ of users). The Capacitor community plugin wraps native iOS/Android speech recognition. English-only requirement simplifies this — no need for multilingual cloud transcription.

**Alternatives Considered**:
- Google Cloud Speech-to-Text (rejected — adds API cost, server roundtrip, and complexity for English-only use case)
- Deepgram (rejected — same cost/complexity concerns)
- Whisper via browser WASM (rejected — large model download, battery drain on mobile)

## Decision 4: Voice Input — UI Integration Point

**Decision**: Add a microphone icon button inside the chat input form in `src/domains/chat/components/chat-window.tsx`, between the textarea and the send button. Create a `useVoiceInput` hook in `src/domains/chat/hooks/`.

**Rationale**: The chat-window.tsx already has `input` state, `inputRef`, and `handleSubmit`. Voice transcription writes to `setInput()` — user reviews and taps Send. Minimal integration surface.

## Decision 5: Benchmarking — Data Aggregation Architecture

**Decision**: New MCP tool `compare_to_industry` on the existing `finanseal-mcp-server`. New Convex table `benchmarking_opt_ins` for opt-in status. New EventBridge-triggered Lambda module for weekly aggregation into a `benchmarking_aggregates` Convex table.

**Rationale**:
- MCP tool for real-time query (reads pre-computed aggregates, <5s response)
- EventBridge weekly aggregation follows the established pattern (30 existing rules in scheduled-intelligence stack)
- Pre-computed aggregates avoid scanning all businesses on every query (bandwidth optimization per CLAUDE.md)
- Separate opt-in table keeps business table clean

**Alternatives Considered**:
- Real-time aggregation on query (rejected — would scan all opted-in businesses per request, burning Convex bandwidth)
- External analytics DB (rejected — over-engineering; Convex tables with pre-computed aggregates are sufficient for <1000 businesses)

## Decision 6: Benchmarking — Industry Categorization

**Decision**: Use existing `msicCode` field on businesses table for industry grouping. MSIC (Malaysian Standard Industrial Classification) codes have 5-digit hierarchical structure. Group at 2-digit level (e.g., "46" = Wholesale trade) for sufficient peer pool size.

**Rationale**: Already captured during business onboarding. 2-digit grouping provides ~20 industry categories, likely enough peers per group. No new data collection needed.

**Alternatives Considered**:
- Custom industry taxonomy (rejected — MSIC already exists, adding another would confuse users)
- Self-reported industry dropdown (rejected — msicCode is more precise and already captured)

## Decision 7: Benchmarking — Metrics Computation

**Decision**: Compute 5 metrics from existing Convex tables using the P&L generator pattern:
1. **Gross margin** = (Revenue - COGS) / Revenue → from `journal_entry_lines` (4xxx, 5100)
2. **COGS ratio** = COGS / Revenue → from `journal_entry_lines` (5100, 4xxx)
3. **Operating expense ratio** = OpEx / Revenue → from `journal_entry_lines` (5200-5800, 4xxx)
4. **AR days outstanding** = avg `daysOutstanding` from `sales_invoices`
5. **AP days outstanding** = avg days between invoice date and payment from `invoices`

**Rationale**: All data already exists in Convex. The P&L generator (`convex/lib/statement_generators/profit_loss_generator.ts`) already computes revenue, COGS, and OpEx. AR/AP aging is computed from sales_invoices and invoices tables respectively.

## Decision 8: Email Rate Limiting

**Decision**: Track daily email count in a Convex table `email_send_logs` (one row per send). MCP tool queries count before sending, rejects if >= 50 per business per day.

**Rationale**: Simple, auditable, and the table doubles as the audit log required by FR-007. No need for Redis counters when Convex queries are cheap for single-business lookups.

## Decision 9: Email Confirmation UX

**Decision**: The agent returns a confirmation message with recipient(s) and report type. The user must explicitly confirm (type "yes" or click a confirmation button in the chat). Only then does the agent call the `send_email_report` tool with `confirmed: true`.

**Rationale**: Two-phase tool call pattern — first call generates preview/confirmation, second call executes. This is a standard agentic pattern that works within LangGraph's tool-calling loop without requiring custom UI components.
