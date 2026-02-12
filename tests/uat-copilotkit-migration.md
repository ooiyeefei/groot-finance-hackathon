# Chat Migration - Implementation Report & UAT Test Cases

**Branch**: `011-chat-streaming-actions`
**Date**: 2026-02-12
**Spec**: `specs/010-copilotkit-migration/` (original), `specs/011-chat-streaming-actions/` (streaming + actions)

---

## 1. What Was Implemented

### Phase 0 (Branch 010): CopilotKit Migration → Floating Widget

The initial migration (branch 010) replaced the full-page AI assistant with a floating chat widget. CopilotKit runtime was found incompatible with in-process LangGraph agents and was replaced with direct API calls.

### Phase 1 (Branch 011): Dead CopilotKit Code Cleanup

| Change | Detail |
|--------|--------|
| Removed 4 npm packages | `@copilotkit/runtime`, `@copilotkit/react-core`, `@copilotkit/react-ui`, `@copilotkit/sdk-js` from `package.json` |
| Deleted `copilot-provider.tsx` | Unused CopilotKit provider wrapper |
| Cleaned imports | Zero `@copilotkit` references remain in `src/` |

### Phase 2 (Branch 011): SSE Streaming Infrastructure

| File | Purpose |
|------|---------|
| `src/domains/chat/lib/sse-parser.ts` (NEW) | SSE stream parser with typed events: `StatusEvent`, `TextEvent`, `ActionEvent`, `CitationEvent`, `DoneEvent`, `ErrorEvent` |
| `src/lib/ai/copilotkit-adapter.ts` (MODIFIED) | Added `streamLangGraphAgent()` async generator using LangGraph `.streamEvents()` v2, node-to-status mapping, word-level text chunking, `extractActionsFromContent()` for parsing `` ```actions `` blocks |
| `src/app/api/copilotkit/route.ts` (REWRITTEN) | Changed from `NextResponse.json()` to SSE `ReadableStream` with `text/event-stream` headers |
| `src/domains/chat/hooks/use-copilot-chat.ts` (REWRITTEN) | SSE consumer with `streamingText`, `streamingStatus`, `streamingActions` state, 60s inactivity timeout, abort support, single Convex write on stream completion |
| `src/domains/chat/components/chat-window.tsx` (REWRITTEN) | Dynamic status indicator, progressive text rendering, smart auto-scroll (pauses when user scrolls up), Stop button wired to AbortController |

### Phase 3 (Branch 011): Action Card Infrastructure

| File | Purpose |
|------|---------|
| `src/domains/chat/components/action-cards/index.tsx` (NEW) | Action registry: `Map<string, ComponentType>`, `registerActionCard()`, `getActionCardComponent()`, `FallbackCard` for unknown types |
| `src/lib/ai/agent/config/prompts.ts` (MODIFIED) | Added "Action Card Generation Protocol" to agent system prompt — instructs model to emit structured `` ```actions `` JSON blocks |
| `src/domains/chat/components/message-renderer.tsx` (MODIFIED) | Added action card rendering via registry, `isInline`/`isHistorical` props for streaming vs history modes |

### Phase 4 (Branch 011): Anomaly & Expense Approval Cards

| File | Purpose |
|------|---------|
| `src/domains/chat/components/action-cards/anomaly-card.tsx` (NEW) | Severity badges (high/medium/low), navigation links (`router.push`), action buttons, historical read-only mode |
| `src/domains/chat/components/action-cards/expense-approval-card.tsx` (NEW) | State machine (idle→confirm→loading→done/error), Convex mutations (`approve`/`reject`), inline confirmation, claim details list |

### Phase 5 (Branch 011): Vendor & Spending Cards

| File | Purpose |
|------|---------|
| `src/domains/chat/components/action-cards/vendor-comparison-card.tsx` (NEW) | Stacked vendor layout, metrics grid (price, on-time rate, rating, spend), "View Vendor History" navigation |
| `src/domains/chat/components/action-cards/spending-chart.tsx` (NEW) | CSS horizontal bar chart, percentage fill, 8 rotating colors, auto-calculated percentages, total footer |

### Files from Phase 0 (Preserved)

| File | Purpose |
|------|---------|
| `src/domains/chat/components/chat-widget.tsx` | Floating button (bottom-right) that toggles the chat window |
| `src/domains/chat/components/conversation-switcher.tsx` | Dropdown conversation picker with create/switch/archive |
| `src/domains/chat/components/rich-content-panel.tsx` | Expandable side panel for charts, tables, dashboards |
| `src/domains/chat/components/citation-overlay.tsx` | Citation overlay (preserved from original) |

### What Was NOT Changed (by design)

- `src/lib/ai/langgraph-agent.ts` - Agent internals unchanged
- `src/lib/ai/agent/nodes/model-node.ts` - Model node uses raw fetch (token streaming deferred)
- `src/domains/chat/hooks/use-realtime-chat.ts` - Convex hooks preserved as-is
- MCP server, Qdrant integration, Mem0 memory - All untouched
- Convex schema, functions, queries - No changes needed

---

## 2. Architecture Design

### Chat UI Architecture

```
Root Layout (layout.tsx)
  |
  +-- Page Content (existing app)
  |
  +-- ChatWidget (fixed bottom-right, z-50)
        |
        +-- Floating Button (MessageCircle icon)
        |
        +-- ChatWindow (400x600px dialog)
              |
              +-- Header
              |     +-- ConversationSwitcher (dropdown)
              |     +-- Minimize / Close buttons
              |
              +-- Messages Area
              |     +-- MessageRenderer (markdown + citations + action cards)
              |     +-- Streaming Overlay (status + progressive text + action cards)
              |     +-- EmptyState
              |
              +-- Input Area
                    +-- Textarea (Enter=send, Shift+Enter=newline)
                    +-- Send / Stop button (AbortController)
```

### Data Flow (SSE Streaming)

```
User types message
  --> ChatWindow.handleSubmit()
  --> useCopilotBridge.sendMessage()
  --> Convex mutation (persist user message immediately)
  --> fetch('/api/copilotkit', { message, history, conversationId })
      --> Clerk auth (cookies) + rate limit check
      --> streamLangGraphAgent() [async generator]
          --> financialAgent.streamEvents(state, config) [LangGraph .streamEvents() v2]
          --> Yields SSE events progressively:
              - status events (node starts: "Checking query...", "Generating response...")
              - text events (word-level chunks from completed model output)
              - action events (parsed from ```actions``` blocks)
              - citation events
              - done event
      --> ReadableStream writes SSE-formatted events
  --> useCopilotBridge consumes via parseSSEStream()
      --> Updates: streamingText, streamingStatus, streamingActions
      --> 60-second inactivity timeout
  --> ChatWindow renders progressively:
      --> Status indicator → Progressive text → Action cards
  --> On stream completion:
      --> Single Convex mutation (persist text + actions + citations as metadata)
  --> Convex real-time subscription updates UI with persisted message
```

### Action Card System

```
Agent system prompt → Instructs model to emit ```actions``` blocks
  |
  v
streamLangGraphAgent() → extractActionsFromContent() strips blocks from text
  |
  v
SSE 'action' events → useCopilotBridge → streamingActions state
  |
  v
MessageRenderer → getActionCardComponent(action.type) → Registry lookup
  |
  v
Registered Cards (self-registering via module side effects):
  - anomaly_card      → AnomalyCard      (severity badges, navigation)
  - expense_approval  → ExpenseApprovalCard (Convex mutations, confirmation)
  - vendor_comparison → VendorComparisonCard (metrics grid, navigation)
  - spending_chart    → SpendingChart     (CSS bar chart)
  - [unknown type]    → FallbackCard      (formatted JSON display)

Historical vs Active:
  - isHistorical=true  → Read-only (status badges, no action buttons)
  - isHistorical=false → Interactive (buttons trigger mutations, navigation)
```

### Conversation Persistence (Single Source)

```
  +-----------+
  | Convex DB |  (Single source of truth)
  +-----+-----+
        |
  useConversations()  -->  ConversationSwitcher
  useMessages()       -->  ChatWindow (display messages)
  createMessage()     -->  Persist user + assistant messages
        |                  (text + metadata: { citations, actions })
  Real-time subscriptions auto-update UI
```

### Cross-Component Communication (InsightCard --> ChatWidget)

```
InsightCard "Ask AI" button
  --> window.dispatchEvent(CustomEvent('finanseal:open-chat', { detail: { message } }))

ChatWidget event listener
  --> setPendingMessage(detail.message)
  --> setIsOpen(true)

ChatWindow receives initialMessage prop
  --> Pre-fills textarea
  --> User reviews and sends
```

---

## 3. Programmatic Test Results

### Build Verification
- **TypeScript compilation**: PASS (compiled successfully in 20.9s)
- **Translation validation**: PASS (992 keys, all 3 locales match)
- **Prerender**: Pre-existing error on `/onboarding/business` (circular dep, unrelated to chat changes)

### Vitest Suite
- **36 passed / 5 failed**: All failures pre-existing (Convex connection, missing types module)
- Zero test regressions from streaming + action card implementation

### Structural Validation
| Check | Result |
|-------|--------|
| CopilotKit packages removed from package.json | PASS |
| `copilot-provider.tsx` deleted | PASS |
| Zero `@copilotkit` references in `src/` | PASS |
| SSE parser created (`sse-parser.ts`) | PASS |
| `streamLangGraphAgent()` in adapter | PASS |
| Route streams SSE (text/event-stream) | PASS |
| Hook consumes SSE with streaming state | PASS |
| Chat window shows progressive rendering | PASS |
| Action card registry created | PASS |
| 4 card types registered (anomaly, expense, vendor, spending) | PASS |
| Agent prompt includes Action Card Generation Protocol | PASS |
| MessageRenderer renders action cards | PASS |
| Semantic design tokens in all new components | PASS |
| No hardcoded colors in new files | PASS |
| Convex hooks (use-realtime-chat.ts) intact | PASS |
| Convex mutations use correct arg signatures | PASS |

---

## 4. UAT Test Cases

### Pre-Requisites
- App running locally (`npm run dev`)
- Logged in with Clerk
- Convex dev server running (`npx convex dev`)
- Valid `GEMINI_API_KEY` in `.env.local`

---

### TC-01: Floating Chat Button Visibility

| # | Step | Expected |
|---|------|----------|
| 1 | Log in as any user | Chat button (blue circle, bottom-right) appears |
| 2 | Navigate to Dashboard | Button persists |
| 3 | Navigate to Expense Claims | Button persists |
| 4 | Navigate to Settings | Button persists |
| 5 | Navigate to Invoices | Button persists |
| 6 | Log out | Button disappears |

---

### TC-02: Chat Widget Open/Close

| # | Step | Expected |
|---|------|----------|
| 1 | Click floating chat button | Chat window slides up (400x600px) |
| 2 | Verify header shows "FinanSEAL Assistant" or conversation title | Green dot + conversation switcher visible |
| 3 | Click minimize button | Window collapses, button changes to blue |
| 4 | Click button again | Window re-opens |
| 5 | Press Escape key | Window closes |
| 6 | Click button to reopen | Works after Escape close |
| 7 | Click X button | Window closes |

---

### TC-03: Empty State

| # | Step | Expected |
|---|------|----------|
| 1 | Open chat widget (new user or new conversation) | Empty state shows: icon, "FinanSEAL Assistant" title, description text |
| 2 | Verify no messages are shown | Clean empty state with prompt suggestions |

---

### TC-04: Send Message (Manager - Employee Expense Query)

| # | Step | Expected |
|---|------|----------|
| 1 | Log in as manager | Chat button visible |
| 2 | Open chat widget | Empty state or conversation history |
| 3 | Type "How much did [employee name] spend on meals in January 2026?" | Text appears in input |
| 4 | Press Enter | Message appears in chat, status indicator shows ("Checking query...", "Analyzing your question...") |
| 5 | Wait for response | Text streams word-by-word with expense data |
| 6 | Verify citation markers (if any) | Clickable `[^1]` superscripts visible |
| 7 | Click a citation | Citation overlay opens with source details |

---

### TC-05: Send Message (Finance Admin - Vendor Query)

| # | Step | Expected |
|---|------|----------|
| 1 | Log in as finance admin | Chat button visible |
| 2 | Open chat, ask "How much did we spend with [vendor] in past 3 months?" | Response with vendor analytics |
| 3 | Ask "Any price hikes from [vendor] in past 6 months?" | Response identifies specific items, amounts |

---

### TC-06: Compliance Knowledge Base Query

| # | Step | Expected |
|---|------|----------|
| 1 | Open chat, ask "What are the GST rules for meal expenses in Singapore?" | Response with regulatory info |
| 2 | Verify citations | Citations reference regulatory documents from Qdrant |
| 3 | Click citation with PDF link | Citation overlay shows PDF preview via proxy |

---

### TC-07: Conversation Switcher

| # | Step | Expected |
|---|------|----------|
| 1 | Open chat widget | Conversation switcher in header |
| 2 | Click conversation switcher dropdown | List of recent conversations appears |
| 3 | Click "New Conversation" | New conversation starts, empty state shown |
| 4 | Send a message in new conversation | Message appears, response streams |
| 5 | Click dropdown, select previous conversation | Previous conversation's messages load |
| 6 | Verify messages are correct | History matches the original conversation |
| 7 | Click archive/delete on a conversation | Conversation removed from list |

---

### TC-08: Conversation Persistence

| # | Step | Expected |
|---|------|----------|
| 1 | Send a message and get a response | Messages visible in chat |
| 2 | Close the chat widget | Widget closes |
| 3 | Reopen the chat widget | Previous messages still visible (loaded from Convex) |
| 4 | Refresh the entire page (F5) | Messages persist after refresh |
| 5 | Open same conversation in a new tab | Same messages appear (Convex sync) |

---

### TC-09: Keyboard Shortcuts

| # | Step | Expected |
|---|------|----------|
| 1 | Open chat, type in textarea | Text appears |
| 2 | Press Enter | Message sends |
| 3 | Press Shift+Enter | New line inserted (message NOT sent) |
| 4 | Press Escape while chat is open | Chat closes |

---

### TC-10: Stop Generation (SSE Streaming)

| # | Step | Expected |
|---|------|----------|
| 1 | Send a message | Status indicator appears ("Checking query...", "Generating response...") |
| 2 | Wait for text to start streaming | Text appears word-by-word |
| 3 | Click the red stop button (square icon) | Stream aborts immediately |
| 4 | Check partial response | Partial text preserved with "*[Response interrupted]*" suffix |
| 5 | Check Convex | Partial message persisted to database |

---

### TC-11: Rate Limiting

| # | Step | Expected |
|---|------|----------|
| 1 | Send 30 messages in quick succession | All process normally |
| 2 | Send message #31 | Rate limit error message displayed |
| 3 | Wait for rate limit window to pass | Messages work again |

---

### TC-12: InsightCard "Ask AI" Integration

| # | Step | Expected |
|---|------|----------|
| 1 | Navigate to Dashboard (Analytics) | Action Center insights visible |
| 2 | Click "Ask AI" on an insight card | Chat widget opens |
| 3 | Verify textarea is pre-filled | Investigation prompt with insight details appears in input |
| 4 | Press Enter to send | Message sends, agent investigates the alert |

---

### TC-13: Rich Content Panel (If Agent Returns Viz Data)

| # | Step | Expected |
|---|------|----------|
| 1 | Ask "Show me team spending by category for January 2026" | Response may include visualization data |
| 2 | If chart/table data returned | Side panel expands with chart or table |
| 3 | Click close on side panel | Panel collapses back to chat-only |
| 4 | Simple text response | No panel expansion, inline rendering |

---

### TC-13A: SSE Streaming — Progressive Rendering

| # | Step | Expected |
|---|------|----------|
| 1 | Send any message | Status text appears within 2 seconds (e.g. "Checking query...", "Analyzing your question...") |
| 2 | Watch status updates | Status changes as agent progresses through nodes |
| 3 | Wait for text | Text appears word-by-word (progressive rendering), status hides once text starts |
| 4 | Wait for completion | Complete message appears, streaming overlay disappears |
| 5 | Check Convex (Convex dashboard) | Message persisted with full text content |

---

### TC-13B: SSE Streaming — Smart Auto-Scroll

| # | Step | Expected |
|---|------|----------|
| 1 | Send a message that generates a long response | Text streams progressively |
| 2 | During streaming, scroll UP in the messages area | Auto-scroll pauses (user is reading earlier content) |
| 3 | Scroll back to bottom | Auto-scroll resumes |
| 4 | Send a new message | Auto-scroll resets to enabled |

---

### TC-13C: SSE Streaming — Inactivity Timeout

| # | Step | Expected |
|---|------|----------|
| 1 | Send a message | Stream starts |
| 2 | If no SSE events received for 60 seconds | Error message: "Response timed out. Please try again." |
| 3 | Stream is aborted | Loading state cleared |

---

### TC-13D: Anomaly Card

| # | Step | Expected |
|---|------|----------|
| 1 | Ask "Are there any suspicious transactions this month?" | Agent responds with text and anomaly_card action |
| 2 | Verify card renders | Card shows: header with alert icon, anomaly count |
| 3 | Check severity badges | High=red, Medium=yellow, Low=gray color coding |
| 4 | Check anomaly details | Title, description, amount, date visible per anomaly |
| 5 | Click "View Transaction" button | Navigates to `/expense-claims/submissions/{id}` |
| 6 | Close chat, reopen | Historical card shows read-only (no interactive action buttons, only navigation links) |

---

### TC-13E: Expense Approval Card

| # | Step | Expected |
|---|------|----------|
| 1 | Ask (as manager) "Show pending expenses for approval" | Agent responds with expense_approval action card |
| 2 | Verify card renders | Shows: submitter name, amount, claim count, submitted date |
| 3 | Check claim details | First 3 claims listed with descriptions and amounts; "+N more" for additional |
| 4 | Click "Approve" | Inline confirmation: "Approve SGD X from Name? Yes / Cancel" |
| 5 | Click "Cancel" | Returns to idle state (Approve/Reject buttons) |
| 6 | Click "Approve" then "Yes" | Loading spinner, then green "Approved" badge |
| 7 | Check Convex | `expenseSubmissions.approve` mutation fired successfully |
| 8 | Click "Reject" then "Yes" | Loading spinner, then red "Rejected" badge |
| 9 | On mutation error | Error message with "Try again" link |
| 10 | Close chat, reopen | Historical card shows final status badge (no active buttons) |

---

### TC-13F: Vendor Comparison Card

| # | Step | Expected |
|---|------|----------|
| 1 | Ask "Compare my top office supply vendors" | Agent responds with vendor_comparison action card |
| 2 | Verify card renders | Header with building icon, comparison period |
| 3 | Check vendor sections | Each vendor in own section: name, star rating |
| 4 | Check metrics grid | Average price, on-time rate, transaction count, total spend (2-col grid) |
| 5 | Click "View Vendor History" | Navigates to `/expense-claims?vendor={id}` |
| 6 | Close chat, reopen | Historical card shows metrics (no action buttons) |

---

### TC-13G: Spending Chart Card

| # | Step | Expected |
|---|------|----------|
| 1 | Ask "Show team spending by category for January" | Agent responds with spending_chart action card |
| 2 | Verify card renders | Header with chart icon, title, period |
| 3 | Check bar chart | Horizontal bars with category labels, amounts, percentage bars |
| 4 | Check colors | Each category has a distinct color (8-color rotation) |
| 5 | Check percentages | Percentage labels shown to right of each bar |
| 6 | Check total | Footer shows total spending amount |

---

### TC-13H: Fallback Card (Unknown Action Type)

| # | Step | Expected |
|---|------|----------|
| 1 | Agent returns action with unknown type | FallbackCard renders |
| 2 | Verify fallback | Shows: alert icon, action type name (humanized), truncated JSON data |
| 3 | No crash | App continues to function normally |

---

### TC-13I: Action Cards — Historical vs Active

| # | Step | Expected |
|---|------|----------|
| 1 | Trigger an action card (e.g. expense approval) | Card renders with interactive buttons (isHistorical=false) |
| 2 | Complete the action or let stream finish | Message persists to Convex with actions metadata |
| 3 | Close and reopen chat | Card renders from Convex history with isHistorical=true |
| 4 | Check historical card | No Approve/Reject/action buttons; only status badges and read-only navigation |

---

### TC-14: Multi-Language Support

| # | Step | Expected |
|---|------|----------|
| 1 | Switch locale to Thai (th) | App in Thai |
| 2 | Open chat widget | Widget opens, UI renders correctly |
| 3 | Send message in Thai | Agent responds (may respond in Thai or English depending on agent config) |
| 4 | Switch to Indonesian (id) | Repeat above steps |
| 5 | Switch to English (en) | Everything works normally |

---

### TC-15: Dark Mode Compatibility

| # | Step | Expected |
|---|------|----------|
| 1 | Switch to dark mode | App theme changes |
| 2 | Open chat widget | Widget uses dark theme tokens (bg-card, text-foreground adapt) |
| 3 | Send message | Message bubbles have proper contrast |
| 4 | Check citation overlay | Dark theme renders correctly |
| 5 | Switch back to light mode | Clean light theme |

---

### TC-16: Mobile Responsiveness

| # | Step | Expected |
|---|------|----------|
| 1 | Open app on mobile (or resize to < 640px) | Floating button visible |
| 2 | No AI Assistant in bottom nav | Nav entry was removed |
| 3 | Tap floating button | Chat window opens (full width on mobile, max-w-[calc(100vw-2rem)]) |
| 4 | Send message | Works normally on mobile |
| 5 | Tap X or Escape | Chat closes |

---

### TC-17: Old Routes Removed

| # | Step | Expected |
|---|------|----------|
| 1 | Navigate to `/ai-assistant` | 404 page (route deleted) |
| 2 | Call `POST /api/v1/chat` | 404 (endpoint deleted) |
| 3 | Call `GET /api/v1/chat/conversations` | 404 (endpoint deleted) |
| 4 | Call `GET /api/v1/chat/citation-preview?url=...` | Still works (preserved) |

---

### TC-18: No UI Overlap

| # | Step | Expected |
|---|------|----------|
| 1 | Open chat widget on Dashboard | Does not overlap critical dashboard content |
| 2 | Open on Expense Claims list | Does not block expense actions |
| 3 | Open on Invoice processing page | Does not interfere with upload |
| 4 | Open on Settings page | No overlap with settings forms |
| 5 | Check sidebar collapsed state | Button doesn't overlap collapsed sidebar |

---

### TC-19: Topic Guardrails

| # | Step | Expected |
|---|------|----------|
| 1 | Open chat, ask "What is the meaning of life?" | Agent redirects to financial topics |
| 2 | Ask "Tell me a joke" | Agent politely declines, suggests financial queries |
| 3 | Ask a normal financial question | Agent responds normally |

---

### TC-20: Agent Memory (Mem0)

| # | Step | Expected |
|---|------|----------|
| 1 | Ask "I primarily deal with Singapore expenses" | Agent acknowledges |
| 2 | Start new conversation | New conversation created |
| 3 | Ask "What compliance rules should I follow?" | Agent recalls Singapore preference from memory |

---

## 5. Known Limitations & Architecture Decisions

### CopilotKit Runtime Removed & Dead Code Cleaned Up

CopilotKit v1.51.3 was incompatible with in-process LangGraph agents (required remote agent discovery). All CopilotKit packages (`@copilotkit/runtime`, `react-core`, `react-ui`, `sdk-js`) have been removed from `package.json`. The `copilot-provider.tsx` wrapper was deleted. Zero `@copilotkit` references remain.

**Current architecture**: Direct API calls via fetch → SSE streaming → Convex persistence.

### Word-Level vs Token-Level Streaming

The model node (`model-node.ts`) uses raw `fetch()` to Modal/Qwen3 (not a LangChain ChatModel), so LangGraph's `.streamEvents()` cannot capture `on_llm_stream` events at the token level. Instead:
- `.streamEvents()` v2 captures node-level events (on_chain_start/end)
- Status updates appear immediately as each node starts
- Completed text is split into words and emitted as rapid text events
- This provides equivalent UX (status + progressive text) without deep model layer refactoring

### Action Card Rendering Depends on Agent Output

Action cards only render when the LLM follows the "Action Card Generation Protocol" in the system prompt and emits properly formatted `` ```actions `` JSON blocks. If the LLM ignores the protocol or generates malformed JSON:
- Text content still renders normally (action blocks are stripped)
- Malformed blocks are logged as warnings and silently dropped
- FallbackCard handles unknown action types gracefully

### Pre-existing Build Issues

- Prerender error on `/en/onboarding/business` — circular dependency in webpack bundling, unrelated to chat changes
- 5 Vitest failures — Convex connection errors and missing types module, all pre-existing

### Other Limitations

1. **Rich content panel**: Uses simplified bar chart visualization. Full `recharts` integration can be added when specific chart requirements are defined.

2. **Expense rejection reason**: Currently hardcoded to "Rejected via chat assistant". Could be enhanced with a text input in the confirmation dialog.

3. **Vendor comparison "Request Quote" action**: Not yet wired to a backend operation (would need a new Convex mutation or external service integration).
