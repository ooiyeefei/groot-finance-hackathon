# CopilotKit Migration - Implementation Report & UAT Test Cases

**Branch**: `copilotkit`
**Date**: 2026-02-11
**Spec**: `specs/010-copilotkit-migration/`

---

## 1. What Was Implemented

### New Files Created (9 files)

| File | Purpose |
|------|---------|
| `src/lib/ai/copilotkit-adapter.ts` | Bridges `createFinancialAgent()` with CopilotKit runtime; converts messages to LangChain format, passes UserContext, parses citations |
| `src/app/api/copilotkit/route.ts` | CopilotKit runtime endpoint with Clerk auth, rate limiting (30/hr/user), GoogleGenerativeAIAdapter for Gemini 3 Flash Preview |
| `src/domains/chat/components/copilot-provider.tsx` | CopilotKit provider wrapper with Clerk auth token forwarding |
| `src/domains/chat/hooks/use-copilot-chat.ts` | Bridge hook syncing CopilotKit active session with Convex persistence |
| `src/domains/chat/components/message-renderer.tsx` | Markdown renderer with citation superscript parsing, code blocks, tables |
| `src/domains/chat/components/chat-window.tsx` | Main chat UI: message list, input, loading state, empty state |
| `src/domains/chat/components/chat-widget.tsx` | Floating button (bottom-right) that toggles the chat window |
| `src/domains/chat/components/conversation-switcher.tsx` | Dropdown conversation picker with create/switch/archive |
| `src/domains/chat/components/rich-content-panel.tsx` | Expandable side panel for charts, tables, dashboards |

### Files Modified (6 files)

| File | Change |
|------|--------|
| `src/app/[locale]/layout.tsx` | Wrapped content with `<CopilotProvider>`, added `<ChatWidget />` |
| `src/components/ui/sidebar.tsx` | Removed `/ai-assistant` nav entry |
| `src/components/ui/mobile-app-shell.tsx` | Removed `/ai-assistant` bottom nav item |
| `src/domains/analytics/components/action-center/InsightCard.tsx` | Changed "Ask AI" from `router.push('/ai-assistant')` to `CustomEvent('finanseal:open-chat')` |
| `src/app/api/v1/chat/citation-preview/route.ts` | Inlined `proxyCitationDocument` (was importing from deleted `chat.service.ts`) |
| `package.json` | Added `@copilotkit/runtime`, `@copilotkit/react-core`, `@copilotkit/react-ui`, `@copilotkit/sdk-js` |

### Files Deleted (9 files, ~2,560 lines removed)

| File | What It Was |
|------|-------------|
| `src/app/[locale]/ai-assistant/page.tsx` | Full-page AI assistant (replaced by floating widget) |
| `src/app/api/v1/chat/route.ts` | Old SSE streaming chat endpoint |
| `src/app/api/v1/chat/conversations/route.ts` | Old conversation CRUD endpoint |
| `src/app/api/v1/chat/conversations/[conversationId]/route.ts` | Old single-conversation endpoint |
| `src/app/api/v1/chat/warmup/route.ts` | Old agent warmup endpoint |
| `src/app/api/v1/chat/messages/[messageId]/route.ts` | Old message edit/delete endpoint |
| `src/domains/chat/lib/chat.service.ts` | Old chat service layer (679 lines) |
| `src/domains/chat/components/chat-interface.tsx` | Old full-page chat UI |
| `src/domains/chat/components/chat-interface-client.tsx` | Old client-side chat logic |
| `src/domains/chat/components/conversation-sidebar.tsx` | Old full sidebar conversation list |
| `src/domains/chat/components/warmup-loading.tsx` | Old loading skeleton |

### What Was NOT Changed (by design)

- `src/lib/ai/langgraph-agent.ts` - Agent internals unchanged
- `src/domains/chat/hooks/use-realtime-chat.ts` - Convex hooks preserved as-is
- `src/domains/chat/components/citation-overlay.tsx` - Citation overlay preserved
- MCP server, Qdrant integration, Mem0 memory - All untouched
- Convex schema, functions, queries - No changes needed

---

## 2. Architecture Design

### Chat UI Architecture

```
Root Layout (layout.tsx)
  |
  +-- CopilotProvider (auth token forwarding to CopilotKit)
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
                    |     +-- MessageRenderer (markdown + citations)
                    |     +-- Loading indicator
                    |     +-- EmptyState
                    |
                    +-- Input Area
                          +-- Textarea (Enter=send, Shift+Enter=newline)
                          +-- Send / Stop button
```

### Data Flow

```
User types message
  --> ChatWindow.handleSubmit()
  --> useCopilotBridge.sendMessage()
  --> Convex mutation (persist user message immediately)
  --> fetch('/api/copilotkit', { message, history, conversationId })
      --> Clerk auth (cookies) + rate limit check
      --> invokeLangGraphAgent()
          --> createFinancialAgent().invoke() [LangGraph 8-node StateGraph]
          --> Qdrant RAG, MCP tools, Mem0 memory (all internal)
      --> JSON response { content, citations }
  --> Convex mutation (persist assistant response)
  --> Convex real-time subscription updates UI
  --> MessageRenderer displays response with citations
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
        |
  Real-time subscriptions auto-update UI
```

### Dynamic Rich Content

```
Agent response metadata contains:
  - chartData     --> RichContentPanel (type: 'chart')
  - tableData     --> RichContentPanel (type: 'table')
  - dashboardData --> RichContentPanel (type: 'dashboard')

detectRichContent(metadata) checks for these keys.

Simple text/small results --> inline MessageRenderer
Complex visualizations    --> expanded side panel (480x600px)

Panel renderers:
  - RichTable: HTML table with semantic design tokens
  - RichChart: Horizontal bar visualization (percentage-based)
  - RichDashboard: 2-column metric grid with change indicators
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
- **`npm run build`**: PASS (compiled with only pre-existing warnings)
- **Translation validation**: PASS (992 keys, all 3 locales match)

### TypeScript Type-Check
- **`tsc --noEmit`**: All errors are pre-existing (middleware.ts, test files) -- zero new type errors

### Vitest Suite
- **36 passed / 5 failed**: All failures pre-existing (Convex connection, missing types module)
- Zero test regressions from migration

### Structural Validation
| Check | Result |
|-------|--------|
| All 9 new files exist | PASS |
| All 9 deleted files removed | PASS |
| No broken imports to deleted modules | PASS |
| No references to `/ai-assistant` route | PASS |
| CopilotKit packages installed | PASS |
| CopilotProvider in root layout | PASS |
| ChatWidget in root layout | PASS |
| No hardcoded colors in new files | PASS |
| Semantic design tokens used in UI components | PASS |
| NEXT_PUBLIC_COPILOTKIT_ENDPOINT in .env.local | PASS |
| Custom event wiring (InsightCard -> ChatWidget) | PASS |
| Convex hooks (use-realtime-chat.ts) intact | PASS |
| Citation-preview route self-contained | PASS |

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
| 4 | Press Enter | Message appears in chat, "Thinking..." indicator shows |
| 5 | Wait for response | Streamed response with expense data appears |
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

### TC-10: Stop Generation

| # | Step | Expected |
|---|------|----------|
| 1 | Send a message | "Thinking..." indicator appears |
| 2 | Click the red stop button (square icon) | Generation stops |
| 3 | Partial response may appear | No error shown |

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

### CopilotKit Runtime Removed (Post-UAT Fix)

CopilotKit v1.51.3's `CopilotListeners` component requires a registered remote agent named `"default"` (via `LangGraphAgent` or `LangGraphHttpAgent`). Our LangGraph agent runs **in-process** (not as a remote deployment), making it incompatible with CopilotKit's agent discovery protocol.

**Root cause**: The `<CopilotKit>` provider crashed on every page load with:
```
useAgent: Agent 'default' not found after runtime sync (runtimeUrl=/api/copilotkit)
```

**Fix applied**: Replaced CopilotKit runtime with direct API calls:
- `/api/copilotkit` POST endpoint calls `invokeLangGraphAgent()` directly
- Bridge hook uses `fetch()` instead of `useCopilotChat()`
- Convex is the single source of truth (no dual-source deduplication needed)
- Removed `<CopilotKit>` provider from layout
- CopilotKit npm packages remain installed but are not actively used at runtime

### Other Limitations

1. **Rich content panel**: Uses simplified bar chart visualization. Full `recharts` integration can be added when specific chart requirements are defined.

2. **No streaming**: Current implementation waits for the full agent response before displaying. Streaming can be added by changing the API to SSE (Server-Sent Events).

3. **Validation tasks (T003, T008, T013-T028, T036-T040)**: These require a running app with test data and are left for manual UAT execution per above test cases.
