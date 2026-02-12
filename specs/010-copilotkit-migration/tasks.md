# Tasks: CopilotKit Agent Migration

**Input**: Design documents from `/specs/010-copilotkit-migration/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in the spec. Manual integration testing with role-based personas per plan.md.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install CopilotKit dependencies and verify baseline

- [x] T001 Install CopilotKit packages: `npm install @copilotkit/runtime @copilotkit/react-core @copilotkit/react-ui @copilotkit/sdk-js`
- [x] T002 Add `NEXT_PUBLIC_COPILOTKIT_ENDPOINT=/api/copilotkit` to `.env.local` and verify existing env vars (`GEMINI_API_KEY`, `QDRANT_URL`, etc.) are present
- [ ] T003 Verify existing LangGraph agent works by running the current app and testing a chat query (baseline sanity check before migration begins)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core CopilotKit infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Create CopilotKit LangGraph adapter in `src/lib/ai/copilotkit-adapter.ts` — thin wrapper that bridges `createFinancialAgent()` from `src/lib/ai/langgraph-agent.ts` with CopilotKit's runtime action system, passing UserContext (userId, businessId, role) and returning streamed responses with citation metadata
- [x] T005 Create CopilotKit runtime endpoint in `src/app/api/copilotkit/route.ts` — configure `CopilotRuntime` with `GoogleGenerativeAIAdapter` (model: `gemini-3-flash-preview`, apiKey: `GEMINI_API_KEY`), integrate Clerk auth, rate limiting (30/hour/user), and UserContext extraction per contract in `specs/010-copilotkit-migration/contracts/copilotkit-runtime.md`
- [x] T006 Create CopilotKit provider wrapper in `src/domains/chat/components/copilot-provider.tsx` — wraps children with `<CopilotKit runtimeUrl="/api/copilotkit">`, handles auth token forwarding from Clerk
- [x] T007 Create CopilotKit ↔ Convex bridge hook in `src/domains/chat/hooks/use-copilot-chat.ts` — implements sync pattern from research.md R4: load conversation messages from Convex into CopilotKit via `setMessages`, persist new messages to Convex after completion, handle conversation switching by clearing and reloading state. Include `createConversation()`, `switchConversation(id)`, and `deleteMessage(id)` lifecycle methods
- [ ] T008 Verify foundational wiring by importing the CopilotKit provider in a test page and confirming the runtime endpoint responds to CopilotKit's handshake protocol (temporary verification, remove after Phase 3)

**Checkpoint**: CopilotKit runtime, provider, adapter, and bridge hook are all wired — user story implementation can now begin

---

## Phase 3: User Story 1 - Manager Queries Employee Expenses (Priority: P1) MVP

**Goal**: A manager can click the floating chat button on any page, ask employee expense questions, and receive streamed responses with citations through the CopilotKit-powered chat widget

**Independent Test**: Log in as a manager, click the floating chat button on any page, ask "How much did Sarah spend on meals in January 2026?" — verify streamed response with citation markers and correct expense data

### Implementation for User Story 1

- [x] T009 [US1] Create custom message renderer in `src/domains/chat/components/message-renderer.tsx` — renders markdown content with `rehype`/`remark`, parses citation superscript markers (`^1`, `^2`), attaches click handlers to open CitationOverlay, styles with FinanSEAL design tokens (`bg-card`, `text-foreground`)
- [x] T010 [US1] Create chat window component in `src/domains/chat/components/chat-window.tsx` — uses `useCopilotChat` from `@copilotkit/react-core` for `visibleMessages`, `appendMessage`, `isLoading`, `stopGeneration`; renders messages via MessageRenderer; includes input field with send button (`bg-primary hover:bg-primary/90 text-primary-foreground`), loading/typing indicator, error state display, and a header with conversation title + minimize/close buttons
- [x] T011 [US1] Create floating chat widget in `src/domains/chat/components/chat-widget.tsx` — renders a floating button anchored at bottom-right (fixed position, z-index above page content), styled with FinanSEAL design tokens; on click, toggles an expandable chat window (ChatWindow component); manages open/closed state; includes smooth open/close animation
- [x] T012 [US1] Add CopilotKit provider and ChatWidget to root layout in `src/app/[locale]/layout.tsx` — wrap the layout children with CopilotProvider; render ChatWidget as a sibling (not inside page content) so it appears globally on every page; ensure it doesn't interfere with existing layout components
- [ ] T013 [US1] Adapt `src/domains/chat/hooks/use-realtime-chat.ts` — ensure existing Convex realtime hooks (`useConversations`, `useMessages`) remain compatible with the new widget; remove any references to old `/api/v1/chat` endpoints; keep Convex subscription logic intact for cross-tab sync
- [ ] T014 [US1] Verify end-to-end: Log in as manager → click floating chat button on dashboard page → ask "How much did Sarah spend on meals in January 2026?" → confirm streamed response with expense data → confirm citations render as clickable superscripts → confirm message persists in Convex after completion → confirm follow-up question retains context → confirm chat button is visible on other pages (e.g., settings, expenses list)

**Checkpoint**: Manager can query employee expenses through the floating CopilotKit widget from any page, with streaming, citations, and Convex persistence. This is the MVP.

---

## Phase 4: User Story 2 - Finance Admin Queries Vendor Analytics (Priority: P1)

**Goal**: A finance admin can query vendor spending patterns through the floating widget and receive analytics powered by MCP tools, with graceful degradation when the MCP server is unavailable

**Independent Test**: Log in as a finance admin, click the chat button, ask "How much did we spend with Vendor B in the past 3 months?" — verify monthly breakdown response with proper citations and MCP tool usage

### Implementation for User Story 2

- [ ] T015 [US2] Verify MCP tool routing through CopilotKit — test that vendor analytics queries trigger MCP tools (analyze_vendor_risk, detect_anomalies) from within the LangGraph agent when invoked via CopilotKit runtime. No code changes expected (agent internals unchanged per SC-008); this is a validation task
- [ ] T016 [US2] Verify graceful MCP degradation — test a vendor query when MCP server is unavailable (e.g., temporarily disable MCP endpoint in env); confirm the agent falls back to basic data retrieval tools and the widget displays the limited analytics message
- [ ] T017 [US2] Verify price hike analysis — ask "Any price hikes from Vendor B in the past 6 months?" and confirm the response identifies specific items, percentage increases, and transaction references with citations

**Checkpoint**: Finance admin can query vendor analytics through the floating widget. MCP integration works transparently through the agent.

---

## Phase 5: User Story 3 - Compliance Knowledge Base Queries (Priority: P2)

**Goal**: Any user can ask cross-border compliance questions through the floating widget and receive answers with citations linking to regulatory documents stored in Qdrant

**Independent Test**: Click the chat button, ask "What are the GST rules for meal expenses in Singapore?" — verify response includes citations with source document names, page numbers, and confidence scores

### Implementation for User Story 3

- [ ] T018 [US3] Verify RAG/Qdrant integration through CopilotKit — test that compliance queries trigger `searchRegulatoryKnowledgeBase` tool from within the agent. No code changes expected (agent internals unchanged); this is a validation task confirming Qdrant queries work through the CopilotKit runtime
- [ ] T019 [US3] Verify citation overlay renders correctly in `src/domains/chat/components/citation-overlay.tsx` — test that clicking a citation superscript in a compliance response opens the overlay with source document name, country, section, page number, confidence score, and PDF link. Adapt the overlay component if the citation data format from CopilotKit messages differs from the old format
- [ ] T020 [US3] Verify PDF citation proxy — confirm that the citation-preview endpoint (`src/app/api/v1/chat/citation-preview/route.ts`) still works for proxying government PDFs, since it serves a purpose independent of the chat agent. If needed, move it to `src/app/api/v1/citations/preview/route.ts`

**Checkpoint**: Compliance queries return accurate RAG-powered answers with fully functional citation overlays in the widget.

---

## Phase 6: User Story 4 - Floating Chat Widget with Dynamic UI (Priority: P2)

**Goal**: Users interact with the floating chat widget that includes a conversation switcher, adaptive rich content rendering (charts/dashboards in expanded panel), and conversation lifecycle management

**Independent Test**: Click the chat button on any page → verify conversation switcher lists history → create new conversation → switch between conversations → ask for analytics data → verify expanded panel shows chart/dashboard visualization

### Implementation for User Story 4

- [x] T021 [US4] Create minimal conversation switcher in `src/domains/chat/components/conversation-switcher.tsx` — a dropdown or collapsible list within the chat window header showing recent conversations from Convex via `useConversations()` hook; includes "New Conversation" button (`bg-primary hover:bg-primary/90 text-primary-foreground`), delete option per conversation, and highlights the active conversation; styled as a compact picker (not a full sidebar)
- [x] T022 [US4] Create rich content panel in `src/domains/chat/components/rich-content-panel.tsx` — an expandable panel that slides out alongside the chat window when the agent returns complex visualizations; renders dynamic React components (charts via a lightweight chart library, data tables, dashboard widgets); includes close button to collapse back to chat-only view; uses FinanSEAL design tokens
- [x] T023 [US4] Integrate rich content detection in `src/domains/chat/components/chat-window.tsx` — add logic to detect when an agent response contains complex visualization data (e.g., chart data, multi-dimensional analytics); when detected, automatically expand the ChatWidget to show the RichContentPanel alongside the conversation; simple results (text, small tables) continue to render inline via MessageRenderer
- [x] T024 [US4] Wire conversation switcher into ChatWidget — integrate ConversationSwitcher into the chat window header; on conversation select, trigger the bridge hook's `switchConversation(id)` to clear CopilotKit state and load the selected conversation from Convex; on "New Conversation", trigger `createConversation()`
- [ ] T025 [US4] Verify existing conversation history loads in widget — open the chat widget with a user who has pre-migration conversations in Convex; confirm all conversations appear in the conversation switcher; confirm selecting one loads its full message history with citations (per FR-017)
- [ ] T026 [US4] Verify adaptive rich content — ask a question that returns complex analytics (e.g., "Show me team spending by category for January 2026"); confirm the widget expands to show a chart/dashboard panel; then ask a simple question and confirm the response renders inline without expanding

**Checkpoint**: Floating widget has full conversation management, adaptive rich content rendering, and preserved history.

---

## Phase 7: User Story 5 - Agent Self-Evolution via Memory (Priority: P3)

**Goal**: The agent uses Mem0 memory to provide contextual responses across sessions, recalling user preferences and prior queries

**Independent Test**: Ask a question via the widget in one session, then in a new conversation ask a related follow-up — verify the agent uses stored memories for context without re-asking for clarification

### Implementation for User Story 5

- [ ] T027 [US5] Verify Mem0 memory integration through CopilotKit — test that the agent stores and recalls conversation memories via Mem0 when invoked through the CopilotKit runtime. No code changes expected (memory system is internal to the agent per SC-008); this is a validation task
- [ ] T028 [US5] Verify memory graceful degradation — test a query when Mem0 service is unavailable; confirm the agent proceeds normally without errors and the widget displays no error messages to the user

**Checkpoint**: Memory-powered contextual responses work through CopilotKit. Agent self-evolution is functional.

---

## Phase 8: Cleanup & Polish

**Purpose**: Remove old implementation, fix build, cross-cutting concerns

- [x] T029 [P] Delete old AI assistant page: `src/app/[locale]/ai-assistant/page.tsx` and any related layout files in that directory
- [x] T030 [P] Delete old chat API routes: `src/app/api/v1/chat/route.ts`, `src/app/api/v1/chat/conversations/route.ts`, `src/app/api/v1/chat/conversations/[conversationId]/route.ts`, `src/app/api/v1/chat/warmup/route.ts`, `src/app/api/v1/chat/messages/[messageId]/route.ts`
- [x] T031 [P] Delete old chat service layer: `src/domains/chat/lib/chat.service.ts`
- [x] T032 [P] Delete old chat UI components: `src/domains/chat/components/chat-interface.tsx`, `src/domains/chat/components/chat-interface-client.tsx`, `src/domains/chat/components/conversation-sidebar.tsx`, `src/domains/chat/components/warmup-loading.tsx`
- [x] T033 Clean up imports and navigation — search codebase for any remaining imports from deleted files and any navigation links pointing to `/ai-assistant`; remove or rewire them (e.g., sidebar nav links, breadcrumbs)
- [x] T034 Remove temporary verification from T008 if still present (N/A — no temporary verification was created)
- [x] T035 Run `npm run build` and fix any TypeScript or build errors until the build passes successfully
- [ ] T036 Verify multi-language support — test the chat widget in English, Thai (th), and Indonesian (id) locales; confirm agent prompts and UI labels render in the selected language
- [ ] T037 Verify rate limiting on new endpoint — send 31 messages in rapid succession and confirm the 31st is rate-limited with an appropriate user-facing message in the widget
- [ ] T038 Verify topic guardrails — ask an off-topic question (e.g., "What is the meaning of life?") via the widget and confirm the agent redirects with a financial-topic-only response
- [ ] T039 Verify widget doesn't interfere with existing pages — navigate through 5+ different pages in the app (dashboard, expenses, invoices, settings, users); confirm the floating chat button renders correctly on each, doesn't overlap critical UI elements, and the widget state (open/closed, active conversation) persists across page navigation
- [ ] T040 Final end-to-end smoke test — test all 5 user stories sequentially with different user roles (manager, finance admin, employee) using the floating widget and confirm no regressions

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001-T003) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational (T004-T008) — this is the MVP
- **US2 (Phase 4)**: Depends on US1 (needs the chat widget to exist for testing)
- **US3 (Phase 5)**: Depends on US1 (needs MessageRenderer and chat widget)
- **US4 (Phase 6)**: Depends on US1 (extends the widget with conversation management + rich content)
- **US5 (Phase 7)**: Depends on Foundational — can run in parallel with other stories after US1
- **Cleanup (Phase 8)**: Depends on ALL user stories being verified

### User Story Dependencies

- **US1 (P1)**: Depends only on Foundational — **MVP, implement first**
- **US2 (P1)**: Depends on US1's chat widget — validation-heavy, minimal new code
- **US3 (P2)**: Depends on US1's MessageRenderer — validation + citation overlay adaptation
- **US4 (P2)**: Depends on US1 — adds conversation switcher, rich content panel
- **US5 (P3)**: Depends on Foundational — validation-only, no new code

### Within Each User Story

- Adapter/hook tasks before UI tasks
- UI component tasks before integration/wiring tasks
- Verification tasks last

### Parallel Opportunities

- **Phase 2**: T004 (adapter) and T006 (provider) can be developed in parallel (different files)
- **Phase 6**: T021 (conversation switcher) and T022 (rich content panel) are different files — can be built in parallel
- **Phase 8**: T029-T032 (deletions) can all run in parallel

---

## Parallel Example: Foundational Phase

```bash
# These can be developed in parallel (different files):
Task T004: "Create adapter in src/lib/ai/copilotkit-adapter.ts"
Task T006: "Create provider in src/domains/chat/components/copilot-provider.tsx"

# Then sequentially:
Task T005: "Create runtime endpoint in src/app/api/copilotkit/route.ts" (depends on T004)
Task T007: "Create bridge hook in src/domains/chat/hooks/use-copilot-chat.ts"
Task T008: "Verify wiring" (depends on all above)
```

## Parallel Example: User Story 4

```bash
# These can be developed in parallel (different files):
Task T021: "Create conversation switcher in src/domains/chat/components/conversation-switcher.tsx"
Task T022: "Create rich content panel in src/domains/chat/components/rich-content-panel.tsx"

# Then sequentially:
Task T023: "Integrate rich content detection in chat-window.tsx" (depends on T022)
Task T024: "Wire conversation switcher into widget" (depends on T021)
Task T025: "Verify history loads" (depends on T024)
Task T026: "Verify adaptive rich content" (depends on T023)
```

## Parallel Example: Cleanup Phase

```bash
# Launch all deletions in parallel (independent files):
Task T029: "Delete old AI assistant page"
Task T030: "Delete old chat API routes"
Task T031: "Delete old chat service layer"
Task T032: "Delete old chat UI components"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T008) — CRITICAL
3. Complete Phase 3: User Story 1 (T009-T014)
4. **STOP and VALIDATE**: Manager can query expenses via floating chat button on any page
5. Deploy/demo if ready — this proves the migration works

### Incremental Delivery

1. Setup + Foundational → CopilotKit infrastructure ready
2. Add US1 → Floating widget with manager queries → **MVP deployed**
3. Add US2 → Finance admin queries validated → Expanded coverage
4. Add US3 → Compliance queries + citations validated
5. Add US4 → Conversation switcher + rich content panel → Full widget experience
6. Add US5 → Memory/self-evolution validated
7. Cleanup → Old code removed → Build passes → **Migration complete**

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 (floating widget + chat) → US4 (conversation management + rich content)
   - Developer B: US2 (vendor analytics validation) → US3 (compliance validation)
   - Developer C: US5 (memory validation) → Cleanup phase
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US2, US3, US5 are primarily **validation tasks** — the agent internals are unchanged (SC-008), so these phases confirm the existing capabilities work through CopilotKit
- US1 and US4 are the heaviest implementation phases — US1 builds the floating widget, US4 adds conversation management and rich content
- The `/ai-assistant` page is deleted in Cleanup (T029) — the floating widget replaces it entirely
- Navigation links to `/ai-assistant` must be removed or redirected (T033)
- The Cleanup phase (Phase 8) should only run after all stories are verified to avoid losing reference code
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Run `npm run build` frequently — CLAUDE.md requires passing build before completion
