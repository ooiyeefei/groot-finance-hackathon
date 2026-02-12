# Research: Action-Driven Rendering & SSE Streaming

**Branch**: `011-chat-streaming-actions` | **Date**: 2026-02-12

---

## R1: LangGraph Streaming Support

**Decision**: Use LangGraph's `.streamEvents()` API (v2) to emit per-node events from the StateGraph.

**Rationale**: The compiled StateGraph from `@langchain/langgraph` natively supports `.streamEvents()` which emits `on_node_start`, `on_node_end`, `on_tool_start`, `on_tool_end` events. This gives us per-node status updates (e.g., "entering callModel", "entering executeTool") without modifying the graph topology. The current `.invoke()` call in `copilotkit-adapter.ts` line 74 can be replaced with `.streamEvents()` to yield events progressively.

**Alternatives considered**:
- `.stream()` — returns state snapshots per node but not granular events; less useful for status messages
- Custom event emitter wrapper — unnecessary given native LangGraph support
- Polling — adds latency and complexity vs. native streaming

---

## R2: Modal/Qwen3 Token Streaming

**Decision**: Enable token-level streaming from the Modal/Qwen3 endpoint by adding `stream: true` to the OpenAI-compatible request payload.

**Rationale**: The current `model-node.ts` (line 463) POSTs to `${aiConfig.chat.endpointUrl}/chat/completions` using the standard OpenAI protocol. This protocol supports `stream: true` which returns SSE chunks with `data: {"choices":[{"delta":{"content":"token"}}]}` format. The response body becomes a ReadableStream instead of a single JSON blob. This is the standard approach for OpenAI-compatible endpoints.

**Alternatives considered**:
- Keep blocking `.json()` and only stream node-level events — provides status updates but no word-by-word text streaming; text still appears all at once
- WebSocket connection — overkill for request-response pattern; SSE is simpler and sufficient

---

## R3: Expense Approval Mutations (Reuse)

**Decision**: Reuse existing Convex mutations directly from action card button handlers.

**Rationale**: `convex/functions/expenseSubmissions.ts` already has:
- `approve` (line 868) — approves entire submission, creates accounting entries
- `reject` (line 1100) — rejects submission, resets claims to draft
- `approvePartial` (line 948) — approves selected claims

These mutations handle all business logic (status transitions, accounting entries, vendor activation). The action card buttons trigger `useMutation(api.functions.expenseSubmissions.approve)` with the submission ID — identical to how the existing approval page works.

**Alternatives considered**:
- Create new mutations specifically for chat-triggered approvals — unnecessary duplication; same business logic applies
- Create a service layer abstraction — over-engineering; direct mutation calls are the established pattern in this codebase

---

## R4: Deep Linking Routes

**Decision**: Use existing route patterns for navigation from action cards.

**Rationale**: Discovered route patterns:
- Expense submissions: `/[locale]/expense-claims/submissions/[id]`
- Expense claims list: `/[locale]/expense-claims`
- Duplicate report: `/[locale]/expense-claims/duplicate-report`

Action cards will use `useRouter().push()` with the locale prefix. The locale is available from `useParams()` or the layout context.

**Alternatives considered**:
- Open in new tab — breaks the in-app flow; users expect SPA navigation
- Use Convex document IDs directly — these are already the `[id]` params used in routes

---

## R5: Agent Prompt Injection Point

**Decision**: Add an "Action Card Generation Protocol" section to the system prompt in `prompts.ts`, inserted before the "Absolute Final Instruction" block (before line 229).

**Rationale**: The prompt structure has clear sections (Tool Selection → Parameter Separation → Execution Rules → Synthesis Protocol → Final Instruction). The action card instructions belong between "Answer Synthesis Protocol" (which tells the model how to format answers) and the "Absolute Final Instruction" (which reinforces critical rules). The model will see the action card schema as part of its response formatting instructions.

**Alternatives considered**:
- Add instructions per-tool — too scattered, hard to maintain, inconsistent behavior across tools
- Use a separate "action prompt" injected dynamically — adds complexity; the system prompt is the right place for response formatting rules
- Post-process agent output to detect actionable content — fragile regex/heuristic approach; better to have the model explicitly output structured data

---

## R6: Tool Metadata → Action Card Mapping

**Decision**: Extend tool `metadata` field with action-relevant fields. The adapter (`copilotkit-adapter.ts`) extracts these from the final agent state to construct the `actions` array in the API response.

**Rationale**: Tools already return a `metadata` record (e.g., `TransactionLookupTool` returns `{ queryProcessed, resultsCount, totalAmount, ... }`). Adding fields like `actionType`, `resourceId`, `resourceType` to this metadata is a minimal, backward-compatible change. The adapter then maps these to the frontend action card schema. The model also sees tool metadata in its context and can decide whether to emit an action card based on it.

**Alternatives considered**:
- Have the model generate complete action JSON in its text response — fragile; model may not consistently produce valid JSON; requires parsing text for embedded JSON
- Create a new `actions` field on `ToolResult` — breaks the existing interface; `metadata` already serves this purpose
- Frontend-side detection of actionable content from text — brittle regex approach; explicit structured data is more reliable

---

## R7: SSE Protocol for API Route

**Decision**: Use standard Server-Sent Events (SSE) protocol with `text/event-stream` content type for the `/api/copilotkit` endpoint.

**Rationale**: SSE is natively supported by browsers via `EventSource` or `fetch()` + `ReadableStream.getReader()`. The `fetch` approach is preferred because it supports POST requests (EventSource only supports GET) and allows passing the AbortController signal for cancellation. Next.js App Router supports streaming responses via `new ReadableStream()` + `new Response()`.

**Event types**:
- `status` — agent phase update (e.g., `{"phase": "Searching documents..."}`)
- `text` — incremental text token (e.g., `{"token": "The "}`)
- `action` — complete action card payload (e.g., `{"type": "anomaly_card", "data": {...}}`)
- `citation` — citation data (e.g., `{"citations": [...]}`)
- `done` — stream complete signal
- `error` — error during processing

**Alternatives considered**:
- WebSockets — bidirectional not needed; SSE is simpler for server→client streaming
- JSON Lines (NDJSON) — less standardized than SSE; no built-in retry/reconnection semantics
- Keep JSON response + add polling — high latency, many requests, poor UX
