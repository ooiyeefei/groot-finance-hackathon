# Implementation Plan: Action-Driven Rendering & SSE Streaming

**Branch**: `011-chat-streaming-actions` | **Date**: 2026-02-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-chat-streaming-actions/spec.md`

## Summary

Replace the current synchronous JSON response pattern in the FinanSEAL chat widget with Server-Sent Events (SSE) streaming for progressive rendering, and add an extensible action card system that renders interactive React components (anomaly cards, expense approval cards, vendor comparison, spending charts) inline in chat messages. Also clean up unused CopilotKit packages. The LangGraph agent's system prompt will be extended to emit structured action metadata, and the frontend MessageRenderer will use an extensible type-to-component registry to render cards with working action buttons (navigation, Convex mutations).

## Technical Context

**Language/Version**: TypeScript 5.9.3 / Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, @langchain/langgraph 0.4.5, Convex 1.31.3, React 19.1.2, Clerk 6.30.0
**Storage**: Convex (conversations, messages with metadata), Qdrant Cloud (RAG), Mem0 (memory)
**Testing**: Vitest (existing 36 tests), manual UAT
**Target Platform**: Web (Vercel), mobile-responsive (400px chat widget)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: First feedback within 2 seconds of message send (SC-001), streaming interruption within 500ms (SC-011)
**Constraints**: 400px widget width, semantic design tokens only, dark mode support, 30 req/hr/user rate limit
**Scale/Scope**: Single-user streaming (one active stream per chat session)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution is a blank template (no project-specific gates defined). Proceeding with standard engineering best practices from CLAUDE.md:
- Semantic design tokens only (no hardcoded colors) ✅ Addressed in FR-029, FR-030
- Build must pass ✅ Addressed in FR-004, SC-010
- Prefer modification over creation ✅ Plan modifies existing files where possible
- Git author: grootdev-ai ✅ Will use configured identity

## Project Structure

### Documentation (this feature)

```text
specs/011-chat-streaming-actions/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 research decisions
├── data-model.md        # Entity schemas (ChatAction, StreamEvent, card data)
├── quickstart.md        # Testing guide
├── contracts/
│   └── chat-api-sse.md  # SSE endpoint contract
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── app/api/copilotkit/
│   └── route.ts                          # MODIFY: JSON response → SSE stream
├── lib/ai/
│   ├── copilotkit-adapter.ts             # MODIFY: add streaming invocation method
│   └── agent/config/
│       └── prompts.ts                    # MODIFY: add action card generation protocol
├── domains/chat/
│   ├── hooks/
│   │   └── use-copilot-chat.ts           # MODIFY: fetch + .json() → SSE stream consumer
│   ├── components/
│   │   ├── message-renderer.tsx          # MODIFY: add action card rendering after text
│   │   ├── chat-window.tsx               # MODIFY: streaming state, smart auto-scroll
│   │   ├── rich-content-panel.tsx        # KEEP: existing side panel (no changes)
│   │   └── action-cards/                 # NEW directory
│   │       ├── index.ts                  # Action registry (type → component map)
│   │       ├── anomaly-card.tsx          # NEW: anomaly detection card
│   │       ├── expense-approval-card.tsx # NEW: expense approval with confirm
│   │       ├── vendor-comparison-card.tsx# NEW: vendor metrics comparison
│   │       └── spending-chart.tsx        # NEW: spending visualization
│   └── lib/
│       └── sse-parser.ts                 # NEW: SSE stream parser utility
└── domains/chat/components/
    └── copilot-provider.tsx              # DELETE: unused CopilotKit provider

package.json                              # MODIFY: remove @copilotkit/* packages
```

**Structure Decision**: Follows existing domain-based structure (`src/domains/chat/`). New action card components go in a dedicated `action-cards/` subdirectory to keep the components directory organized. The SSE parser is a utility in `lib/` since it's reusable.

## Implementation Phases

### Phase 0: Dead Code Cleanup (P0)
**FR**: FR-001, FR-002, FR-003, FR-004
**Files**: package.json, copilot-provider.tsx, any files with CopilotKit imports

1. Remove `@copilotkit/runtime`, `@copilotkit/react-core`, `@copilotkit/react-ui`, `@copilotkit/sdk-js` from `package.json`
2. Delete `src/domains/chat/components/copilot-provider.tsx`
3. Search for and remove any remaining CopilotKit imports across the codebase
4. Run `npm install` to update lockfile
5. Run `npm run build` — must pass

**Verification**: `grep -r '@copilotkit' src/` returns zero results. Build passes.

---

### Phase 1: SSE Streaming Infrastructure (P1)
**FR**: FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-016
**Dependencies**: Phase 0 complete

#### Step 1.1: SSE Stream Parser Utility
**File**: `src/domains/chat/lib/sse-parser.ts` (NEW)

Create a reusable SSE parser that reads a `ReadableStream` from `fetch()` response and yields parsed events. Handles:
- Parsing `event:` and `data:` lines from the stream
- Yielding typed event objects (`StatusEvent`, `TextEvent`, `ActionEvent`, `CitationEvent`, `DoneEvent`, `ErrorEvent`)
- Handling incomplete chunks (buffering partial lines)

#### Step 1.2: Streaming Agent Invocation
**File**: `src/lib/ai/copilotkit-adapter.ts` (MODIFY)

Add a new `streamLangGraphAgent()` function alongside the existing `invokeLangGraphAgent()`:
- Uses LangGraph's `.streamEvents()` API (v2) instead of `.invoke()`
- Yields `StreamEvent` objects as the agent processes through nodes
- Maps LangGraph node names to human-readable status messages:
  - `topicGuardrail` → "Checking query..."
  - `validate` → "Validating request..."
  - `analyzeIntent` → "Analyzing your question..."
  - `callModel` → "Generating response..."
  - `executeTool` → "Searching [tool name]..."
- For text streaming: when `callModel` node emits LLM tokens, yield `text` events
- For action cards: extract action metadata from final state, yield `action` events
- Yield `done` event when graph completes

#### Step 1.3: SSE Streaming API Route
**File**: `src/app/api/copilotkit/route.ts` (MODIFY)

Change the POST handler from returning `NextResponse.json()` to returning a streaming `Response`:
- Keep existing auth (Clerk), rate limiting, user context resolution
- Create a `ReadableStream` that uses `streamLangGraphAgent()` as the source
- Write SSE-formatted events to the stream
- Handle abort signal for cancellation
- Return `new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } })`

#### Step 1.4: Stream Consumer Hook
**File**: `src/domains/chat/hooks/use-copilot-chat.ts` (MODIFY)

Update `handleSendMessage()` in the `useCopilotBridge` hook:
- Replace `await response.json()` with SSE stream consumption using the parser from Step 1.1
- Add streaming state: `streamingText` (accumulates text tokens), `streamingStatus` (current phase), `streamingActions` (action cards received)
- On `status` event → update `streamingStatus`
- On `text` event → append to `streamingText`
- On `action` event → add to `streamingActions`
- On `citation` event → store citations
- On `done` event → persist final message to Convex (single write with full content + actions + citations)
- On `error` event → show error, preserve partial content
- On abort → persist partial content to Convex
- Add 60-second inactivity timeout (no events received) → show timeout error with retry

#### Step 1.5: Streaming UI in ChatWindow
**File**: `src/domains/chat/components/chat-window.tsx` (MODIFY)

- Replace static "Thinking..." indicator with dynamic status from `streamingStatus`
- Show streaming text progressively (from `streamingText` state)
- Implement smart auto-scroll: track if user has scrolled up, pause auto-scroll if so, resume when user scrolls back to bottom
- Stop button aborts the stream via AbortController
- After stream completes, the Convex real-time subscription picks up the persisted message

**Verification**: Send a message → see status updates within 2s → text streams progressively → Stop button works → message persisted after completion.

---

### Phase 2: Action Card Registry & Base Components (P2)
**FR**: FR-020, FR-029, FR-030, FR-031, FR-032, FR-033, FR-034, FR-035
**Dependencies**: Phase 1 Step 1.4 complete (streaming delivers action events)

#### Step 2.1: Action Registry
**File**: `src/domains/chat/components/action-cards/index.ts` (NEW)

Create the extensible type-to-component registry:
- Export a `Map<string, React.ComponentType<ActionCardProps>>` registry
- Export a `registerActionCard(type, component)` function
- Export a `renderActionCard(action, options)` function that looks up the type, renders the component, or falls back to a `FallbackCard` (renders action data as formatted text)
- Define `ActionCardProps` interface: `{ action: ChatAction, isHistorical: boolean, onActionComplete?: (result) => void }`
- `isHistorical` flag determines whether to show active buttons or final-state badges

#### Step 2.2: MessageRenderer Action Integration
**File**: `src/domains/chat/components/message-renderer.tsx` (MODIFY)

After rendering markdown text content, check for `actions` in the message:
- If `actions` array exists in message metadata, render each action via the registry's `renderActionCard()`
- Pass `isHistorical: true` for messages loaded from Convex history
- Pass `isHistorical: false` for the actively streaming message
- Handle malformed action data gracefully (try/catch, log warning, skip rendering)

#### Step 2.3: Agent Prompt Update
**File**: `src/lib/ai/agent/config/prompts.ts` (MODIFY)

Add "Action Card Generation Protocol" section to the system prompt:
- Define when to emit action cards (anomalies detected, pending approvals found, vendor comparison requested, spending data available)
- Define the JSON schema the model should produce for each card type
- Rules: one action per actionable item, include resource IDs, include navigation URLs
- Insert before the "Absolute Final Instruction" block

**Verification**: Ask about suspicious transactions → agent response includes action metadata → MessageRenderer renders the fallback card (before specific card components are built).

---

### Phase 3: Anomaly Card (P2)
**FR**: FR-021, FR-022, FR-023
**Dependencies**: Phase 2 complete

**File**: `src/domains/chat/components/action-cards/anomaly-card.tsx` (NEW)

- Renders a card with color-coded severity badges (high=destructive, medium=warning, low=muted)
- Lists anomalies with title, description, amount, date
- "View Transaction" button → `router.push(anomaly.url)` using Next.js router
- "Send Reminder" button → triggers appropriate backend operation
- Historical mode: shows anomalies as read-only list without action buttons
- Semantic tokens: `bg-card`, `text-foreground`, `border-border`, severity colors via `bg-destructive/10`, `bg-warning/10`, `bg-muted`
- Responsive: single-column layout fits 400px width

**Verification**: Ask "Any suspicious transactions this month?" → anomaly card renders with severity badges → "View Transaction" navigates correctly.

---

### Phase 4: Expense Approval Card (P2)
**FR**: FR-024, FR-025
**Dependencies**: Phase 2 complete

**File**: `src/domains/chat/components/action-cards/expense-approval-card.tsx` (NEW)

- Renders submission details: submitter name, total amount, category, date, claim count
- Approve button (primary variant) and Reject button (destructive variant)
- On click → inline confirmation prompt: "Approve $X from Y? Yes / Cancel"
- On confirm → calls `useMutation(api.functions.expenseSubmissions.approve)` or `.reject()`
- On success → card transitions to showing "Approved" or "Rejected" badge
- On error → card shows error message with retry
- Historical mode: renders with final status badge, no active buttons
- Loading state while mutation is in progress (button disabled, spinner)

**Verification**: Ask "Show pending expenses for approval" → approval card renders → click Approve → confirmation prompt → confirm → card shows "Approved" badge → expense status updated in Convex.

---

### Phase 5: Vendor Comparison Card (P3)
**FR**: FR-026, FR-027
**Dependencies**: Phase 2 complete

**File**: `src/domains/chat/components/action-cards/vendor-comparison-card.tsx` (NEW)

- Renders vendor metrics in a stacked single-column layout (each vendor as a section with metrics)
- Metrics: average price, on-time delivery rate, rating (stars or numeric), transaction count, total spend
- "View Vendor History" button → navigates to vendor page
- "Request Quote" button → placeholder action (logs intent, shows toast)
- Responsive: stacks naturally in 400px width
- Semantic tokens for all styling

**Verification**: Ask "Compare my top office supply vendors" → comparison card renders → "View Vendor History" navigates correctly.

---

### Phase 6: Spending Chart (P3)
**FR**: FR-028
**Dependencies**: Phase 2 complete

**File**: `src/domains/chat/components/action-cards/spending-chart.tsx` (NEW)

- Renders horizontal bar chart for category breakdowns (CSS-based, extending existing `RichChart` pattern from `rich-content-panel.tsx`)
- Shows category labels, amounts, percentage bars
- Title and period header
- Total at bottom
- Responsive within 400px width
- If a more capable charting library is needed later, the component can be swapped in the registry without changing the rendering pipeline

**Verification**: Ask "Show team spending by category for January" → chart renders with labeled bars and amounts.

---

### Phase 7: Integration Testing & Build Verification
**Dependencies**: All phases complete

1. Run `npm run build` — must pass with zero new errors
2. Run existing Vitest suite — zero regressions (36 pass / 5 pre-existing fail)
3. Manual UAT: walk through all 12 success criteria (SC-001 through SC-012)
4. Test dark mode rendering for all card types
5. Test mobile responsiveness (resize to < 640px)
6. Test conversation persistence (close widget, reopen, verify historical cards render)

---

## Complexity Tracking

No constitution violations to justify. The implementation follows existing patterns:
- New components in `domains/chat/components/` (established pattern)
- Convex mutations reused, not duplicated
- SSE is a standard web protocol, no new dependencies required
- Action registry is a simple Map, not an over-engineered framework
