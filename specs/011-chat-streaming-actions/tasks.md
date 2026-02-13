# Tasks: Action-Driven Rendering & SSE Streaming

**Input**: Design documents from `/specs/011-chat-streaming-actions/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/chat-api-sse.md, research.md, quickstart.md

**Tests**: Not explicitly requested — test tasks omitted. Manual UAT covered in Phase 6 (Polish).

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Setup/Foundational/Polish phases have no story label

---

## Phase 1: Setup — Dead Code Cleanup (P0)

**Purpose**: Remove unused CopilotKit packages and dead code before building new features. Maps to spec User Story 4 (Priority P0).

- [x] T001 [P] Remove `@copilotkit/runtime`, `@copilotkit/react-core`, `@copilotkit/react-ui`, `@copilotkit/sdk-js` from `package.json`
- [x] T002 [P] Delete unused CopilotKit provider wrapper at `src/domains/chat/components/copilot-provider.tsx`
- [x] T003 Remove all dead CopilotKit imports across the codebase (search `src/` for `@copilotkit` references)
- [x] T004 Run `npm install` to update lockfile, then `npm run build` — must pass with zero new errors

**Checkpoint**: `grep -r '@copilotkit' src/` returns zero results. Build passes. Bundle no longer includes CopilotKit runtime code.

---

## Phase 2: User Story 1 — Real-Time Response Streaming (Priority: P1)

**Goal**: Replace synchronous JSON response with SSE streaming for progressive rendering. Users see status updates within 2 seconds, text streams word-by-word, Stop button works.

**Independent Test**: Send any message in the chat widget → see status indicator immediately → text streams progressively → Stop button halts stream and preserves partial text → completed message persists to Convex.

### Implementation for User Story 1

- [x] T005 [P] [US1] Create SSE stream parser utility with typed event interfaces (`StatusEvent`, `TextEvent`, `ActionEvent`, `CitationEvent`, `DoneEvent`, `ErrorEvent`) in `src/domains/chat/lib/sse-parser.ts`
- [~] T006 [P] [US1] Enable token-level streaming from Modal/Qwen3 — SKIPPED: model-node uses raw fetch() not LangChain ChatModel, word-level chunking in adapter provides equivalent UX
- [x] T007 [US1] Add `streamLangGraphAgent()` function using LangGraph `.streamEvents()` v2 API with node-to-status mapping (topicGuardrail→"Checking query...", callModel→"Generating response...", executeTool→"Searching [tool]...") in `src/lib/ai/copilotkit-adapter.ts`
- [x] T008 [US1] Convert POST handler from `NextResponse.json()` to SSE streaming `Response` with `text/event-stream` headers, abort signal handling, and SSE-formatted event writing in `src/app/api/copilotkit/route.ts`
- [x] T009 [US1] Update `useCopilotBridge` hook to consume SSE stream: replace `await response.json()` with stream reader using parser from T005, add state (`streamingText`, `streamingStatus`, `streamingActions`), handle all event types, persist final message to Convex on `done`, 60-second inactivity timeout with retry in `src/domains/chat/hooks/use-copilot-chat.ts`
- [x] T010 [US1] Add streaming UI: replace static "Thinking..." with dynamic status from `streamingStatus`, show progressive text from `streamingText`, implement smart auto-scroll (pause when user scrolls up, resume at bottom), wire Stop button to AbortController in `src/domains/chat/components/chat-window.tsx`
- [x] T011 [US1] Build verification: TypeScript compilation passes. Prerender error on /onboarding/business is pre-existing (unrelated).

**Checkpoint**: User Story 1 fully functional. Any chat message streams progressively. First feedback within 2 seconds. Stop button works. Messages persist after completion.

---

## Phase 3: Foundational — Action Card Infrastructure

**Purpose**: Core infrastructure that US2 and US3 depend on. Creates the extensible action registry, updates the agent prompt to emit structured actions, and integrates card rendering into the message pipeline.

**CRITICAL**: US2 and US3 cannot begin until this phase is complete.

- [x] T012 [P] Create action card registry: export `ActionCardProps` interface, `Map<string, React.ComponentType>` registry, `registerActionCard()`, `getActionCardComponent()` with `FallbackCard` for unknown types, `isHistorical` flag support in `src/domains/chat/components/action-cards/index.tsx`
- [x] T013 [P] Add "Action Card Generation Protocol" section to agent system prompt: define when to emit action cards, JSON schema for each card type (`anomaly_card`, `expense_approval`, `vendor_comparison`, `spending_chart`), rules for resource IDs and navigation URLs — insert before "Absolute Final Instruction" block in `src/lib/ai/agent/config/prompts.ts`
- [x] T014 Integrate action card rendering into MessageRenderer: after markdown text, check message metadata for `actions` array, render each via registry's `getActionCardComponent()`, pass `isHistorical` flag based on whether message is from history vs active stream, handle malformed data gracefully in `src/domains/chat/components/message-renderer.tsx`

**Checkpoint**: Foundation ready. Sending a message that triggers action data → FallbackCard renders (before specific card components exist). Agent prompt instructs model to emit structured actions.

---

## Phase 4: User Story 2 — Interactive Anomaly & Expense Cards (Priority: P2)

**Goal**: Anomaly detection renders as severity-coded interactive cards with navigation links. Expense approvals render with working Approve/Reject buttons that trigger Convex mutations.

**Independent Test**: Ask "Any suspicious transactions this month?" → anomaly card with severity badges and "View Transaction" links. Ask "Show pending expenses for approval" → expense card with working Approve/Reject → inline confirmation → status update in Convex.

### Implementation for User Story 2

- [x] T015 [P] [US2] Implement anomaly card: severity badges (high=`bg-destructive/10`, medium=`bg-yellow-500/10`, low=`bg-muted`), anomaly list (title, description, amount, date), "View Transaction" button (`router.push(url)`), action buttons, historical read-only mode, semantic tokens, single-column 400px layout in `src/domains/chat/components/action-cards/anomaly-card.tsx`
- [x] T016 [P] [US2] Implement expense approval card: submission details (submitter, amount, category, date, claim count), Approve (`primary` variant) and Reject (`destructive` variant) buttons, inline confirmation, `useMutation(api.functions.expenseSubmissions.approve/reject)`, success→status badge, error→retry, loading spinner, historical mode with final status badge in `src/domains/chat/components/action-cards/expense-approval-card.tsx`
- [x] T017 [US2] Cards self-register via `registerActionCard()` at module scope; side-effect imports added in `src/domains/chat/components/action-cards/index.tsx`
- [x] T018 [US2] Build verification: TypeScript compilation passes.

**Checkpoint**: User Story 2 fully functional. Anomaly and expense approval cards render inline with working action buttons. Historical cards show final-state badges.

---

## Phase 5: User Story 3 — Vendor Comparison & Spending Visualizations (Priority: P3)

**Goal**: Vendor comparisons render as metric cards with action buttons. Spending data renders as horizontal bar charts within the chat widget.

**Independent Test**: Ask "Compare my top office supply vendors" → vendor comparison card with metrics and action buttons. Ask "Show team spending by category for January" → chart with labeled bars, amounts, and totals.

### Implementation for User Story 3

- [x] T019 [P] [US3] Implement vendor comparison card: stacked single-column layout (one section per vendor), metrics (average price, on-time rate, rating, transaction count, total spend), "View Vendor History" button (navigation), semantic tokens, responsive 400px layout in `src/domains/chat/components/action-cards/vendor-comparison-card.tsx`
- [x] T020 [P] [US3] Implement spending chart card: CSS-based horizontal bar chart, category labels, amounts, percentage bars, title + period header, total footer, semantic tokens, responsive 400px layout in `src/domains/chat/components/action-cards/spending-chart.tsx`
- [x] T021 [US3] Cards self-register via `registerActionCard()` at module scope; side-effect imports added in `src/domains/chat/components/action-cards/index.tsx`
- [x] T022 [US3] Build verification: TypeScript compilation passes.

**Checkpoint**: User Story 3 fully functional. All 4 card types render correctly within 400px chat widget.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify all quality attributes across the complete feature set.

- [x] T023 [P] Dark mode: all 4 cards use semantic tokens (bg-card, text-foreground, bg-primary/5, bg-destructive/10, etc.) — verified in code review
- [x] T024 [P] Mobile responsiveness: all cards use text-xs, max-w-[85%] bubble, and percentage-based bar widths — no fixed-pixel widths that would overflow 400px widget
- [x] T025 Conversation persistence: messages persist to Convex after stream completes (single write with text + actions + citations metadata); historical messages render action cards with `isHistorical=true` (no active buttons)
- [x] T026 Vitest suite: 36 passed / 5 failed — all failures pre-existing (Convex connection, missing types module). Zero new regressions.
- [x] T027 TypeScript compilation passes. Pre-existing prerender error on /onboarding/business (unrelated). UAT doc updated.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **US1 Streaming (Phase 2)**: Depends on Setup completion — delivers MVP independently
- **Foundational (Phase 3)**: Depends on US1 streaming infrastructure (Phase 2) for action event delivery
- **US2 Anomaly & Expense (Phase 4)**: Depends on Foundational (Phase 3) — can start as soon as registry + prompt are ready
- **US3 Vendor & Spending (Phase 5)**: Depends on Foundational (Phase 3) — can run in parallel with US2
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1 — Streaming)**: Can start after Setup (Phase 1) — No dependencies on other stories. **This is the MVP.**
- **US2 (P2 — Anomaly & Expense)**: Depends on Foundational phase (action registry). Independent of US3.
- **US3 (P3 — Vendor & Spending)**: Depends on Foundational phase (action registry). Independent of US2.
- **US2 and US3 can proceed in parallel** after Phase 3 is complete.

### Within Each Phase

- Tasks marked [P] within a phase can run in parallel
- Non-[P] tasks must wait for their dependencies (sequenced by task ID within the phase)
- Each phase ends with a build verification checkpoint

### Task Dependency Graph

```
T001, T002 ──┐
             ├──→ T003 → T004 (Setup complete)
             │
             ├──→ T005, T006 ──→ T007 → T008 → T009 → T010 → T011 (US1 complete / MVP)
             │
             ├──→ T012, T013 ──→ T014 (Foundational complete)
             │                          │
             │              ┌───────────┴────────────┐
             │              ▼                        ▼
             │    T015, T016 → T017 → T018    T019, T020 → T021 → T022
             │    (US2 complete)               (US3 complete)
             │              │                        │
             │              └────────────┬───────────┘
             │                           ▼
             └────────────────→ T023, T024 → T025 → T026 → T027 (Polish complete)
```

---

## Parallel Opportunities

### Phase 1 (Setup)
```
Parallel: T001 (remove packages) + T002 (delete provider file)
Then sequential: T003 (remove imports) → T004 (build verify)
```

### Phase 2 (US1 Streaming)
```
Parallel: T005 (SSE parser) + T006 (model streaming)
Then sequential: T007 (adapter) → T008 (route) → T009 (hook) → T010 (UI) → T011 (verify)
```

### Phase 3 (Foundational)
```
Parallel: T012 (action registry) + T013 (agent prompt)
Then sequential: T014 (MessageRenderer integration)
```

### Phase 4 + Phase 5 (US2 + US3 — can run in parallel)
```
US2 parallel: T015 (anomaly card) + T016 (expense card) → T017 (register) → T018 (verify)
US3 parallel: T019 (vendor card) + T020 (spending chart) → T021 (register) → T022 (verify)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (Dead Code Cleanup)
2. Complete Phase 2: US1 (SSE Streaming)
3. **STOP and VALIDATE**: Send messages, verify streaming works end-to-end
4. Deploy/demo — streaming alone is high-impact for all users

### Incremental Delivery

1. Setup + US1 → Streaming works for every user on every message (MVP!)
2. Add Foundational → Action registry + agent prompt ready
3. Add US2 → Anomaly + expense approval cards work (managers can approve from chat)
4. Add US3 → Vendor comparison + spending charts work (analytics in chat)
5. Polish → Dark mode, mobile, persistence, full UAT

### Parallel Team Strategy

With multiple developers after Foundational is complete:
- Developer A: US2 (anomaly + expense cards)
- Developer B: US3 (vendor comparison + spending chart)
- Stories complete and integrate independently via the shared action registry

---

## Summary

| Phase | Tasks | Parallel Opportunities |
|-------|-------|----------------------|
| Phase 1: Setup | T001–T004 (4) | T001 + T002 |
| Phase 2: US1 Streaming | T005–T011 (7) | T005 + T006 |
| Phase 3: Foundational | T012–T014 (3) | T012 + T013 |
| Phase 4: US2 Anomaly & Expense | T015–T018 (4) | T015 + T016; Phase 4 ∥ Phase 5 |
| Phase 5: US3 Vendor & Spending | T019–T022 (4) | T019 + T020; Phase 5 ∥ Phase 4 |
| Phase 6: Polish | T023–T027 (5) | T023 + T024 |
| **Total** | **27 tasks** | |

## Notes

- [P] tasks = different files, no dependencies — safe to run in parallel
- [Story] labels map to spec user stories for traceability (US1=P1, US2=P2, US3=P3)
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate the story independently
- MVP is achievable after just Phase 1 + Phase 2 (11 tasks)
