# Tasks: Gemini Migration + DSPy Self-Improving Chat Agent

**Input**: Design documents from `/specs/027-gemini-dspy-chat-agent/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested — no test tasks included.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Environment configuration and schema changes needed before any feature work.

- [x] T001 Update chat model config to use Gemini OpenAI-compatible endpoint in `src/lib/ai/config/ai-config.ts` — change `chat.endpointUrl` to `https://generativelanguage.googleapis.com/v1beta/openai`, `chat.modelId` to `gemini-3.1-flash-lite-preview`, `chat.apiKey` to `process.env.GEMINI_API_KEY`. Remove `CHAT_MODEL_ENDPOINT_URL`, `CHAT_MODEL_MODEL_ID`, `CHAT_MODEL_API_KEY` from `validateConfig()` required list.
- [x] T002 Add `chat_agent_corrections` table to `convex/schema.ts` per data-model.md — fields: businessId, messageId, conversationId, correctionType, originalQuery, originalIntent, originalToolName, originalParameters, correctedIntent, correctedToolName, correctedParameters, createdBy, createdAt, consumed, consumedAt. Indexes: by_correctionType, by_createdAt, by_consumed, by_businessId.
- [x] T003 Add `optimizedPrompt` optional field to existing `dspy_model_versions` table in `convex/schema.ts` — `v.optional(v.string())` for storing JSON-serialized optimized prompts loaded by TypeScript nodes.
- [ ] T004 Run `npx convex deploy --yes` to deploy schema changes to production.

**Checkpoint**: Schema deployed, Gemini endpoint configured. Chat is NOT yet functional (model calls still use old format).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core model swap that makes chat functional with Gemini. BLOCKS all user stories.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T005 Update `handleOpenAIResponse()` in `src/lib/ai/agent/nodes/model-node.ts` — verify Gemini OpenAI-compatible response format: `result.choices[0].message.tool_calls` and `result.choices[0].message.content` are structurally identical to Qwen's output. Adjust any parsing differences. Keep all existing logic (tool_choice forcing, DONE command detection, anti-hallucination safeguard) unchanged.
- [x] T006 Update LLM call in `performLLMIntentAnalysis()` in `src/lib/ai/agent/nodes/intent-node.ts` — the function already uses `aiConfig.chat.endpointUrl` and `aiConfig.chat.modelId` which now point to Gemini (from T001). Verify the JSON response parsing still works with Gemini's output. No prompt changes yet (that's Phase 3).
- [x] T007 Update topic guardrail LLM call in `src/lib/ai/agent/nodes/guardrail-nodes.ts` — same pattern: verify the fetch call to `aiConfig.chat.endpointUrl` works with Gemini and the ALLOWED/BLOCKED/CLARIFICATION classification still parses correctly.
- [x] T008 Add Gemini-specific error handling with retry and backoff in `src/lib/ai/agent/nodes/model-node.ts` — handle Gemini rate limiting (429), quota exceeded (403), and model not found (404) errors with exponential backoff (max 3 retries). Preserve existing error handling for network failures.
- [x] T009 Run `npm run build` to verify the build passes with Gemini config changes.
- [ ] T010 Manually test chat: send "Hello", "Show me my invoices", "What is GST?" — verify responses arrive within 6 seconds and content is sensible.

**Checkpoint**: Chat is functional with Gemini. Cold start eliminated. Response format verified. Ready for intent improvement.

---

## Phase 3: User Story 1 - Instant Chat Responses (Priority: P1) 🎯 MVP

**Goal**: Eliminate 10-65s cold start by using Gemini instead of Modal/Qwen. Zero cold start for all queries.

**Independent Test**: Send a financial query after 30+ min of chat inactivity. Response arrives within 6 seconds.

### Implementation for User Story 1

- [ ] T011 [US1] Verify zero cold start by testing after extended idle period — send "What are my outstanding invoices?" after 30+ minutes of chat inactivity. Confirm response arrives within 6 seconds. If not, check if `aiConfig.chat` is correctly pointing to Gemini (not Modal).
- [ ] T012 [US1] Verify concurrent user support — open 2 browser tabs with different test accounts, send queries simultaneously. Both should respond within 6 seconds independently.
- [ ] T013 [US1] Verify all 13 tool calls work with Gemini — test each tool type (search_documents, get_transactions, get_vendors, get_invoices, get_sales_invoices, searchRegulatoryKnowledgeBase, detect_anomalies, analyze_cash_flow, analyze_vendor_risk, get_action_center_insight, get_employee_expenses, get_team_summary, get_ar_summary) by sending appropriate queries. Ensure tool_calls JSON format from Gemini is correctly parsed in model-node.ts.

**Checkpoint**: US1 complete — Gemini responding within 6s with zero cold start. All tools functional.

---

## Phase 4: User Story 2 - Accurate Intent Classification (Priority: P1)

**Goal**: Fix financial query misclassification (revenue/invoices/cash flow incorrectly classified as "general_knowledge" instead of "personal_data").

**Independent Test**: Send 20 financial queries — all must classify as personal_data with correct tool invoked.

### Implementation for User Story 2

- [x] T014 [US2] Rewrite intent classification system prompt in `src/lib/ai/agent/nodes/intent-node.ts` — optimize the `performLLMIntentAnalysis()` prompt for Gemini 3.1 Flash-Lite's strengths: (1) Add 10+ explicit few-shot examples of personal_data vs general_knowledge queries in the system prompt, (2) Strengthen the queryCategory rules section with Malaysian/SE Asian financial examples (RM amounts, GST, SST, MyInvois), (3) Add explicit negative examples ("What is accounts receivable?" → general_knowledge). Keep the Tier 1 deterministic regex fast-path unchanged.
- [x] T015 [US2] Update system prompt in `src/lib/ai/agent/config/prompts.ts` — refine the main chat system prompt for Gemini: (1) Tighten anti-hallucination instructions, (2) Add financial data response formatting guidelines (tables for multi-row data, currency formatting), (3) Strengthen tool_choice=required enforcement for financial queries.
- [ ] T016 [US2] Test 20 financial queries for correct personal_data classification — queries: "What's my revenue this month?", "Show me outstanding invoices", "Cash flow analysis", "How much do I owe vendors?", "AP aging report", "AR summary", "Team spending this quarter", "Last month expenses", "Revenue trend", "Vendor payments", "Overdue invoices", "Balance sheet", "What transactions happened today?", "Show me income", "Spending summary", "Financial overview", "How much has the team spent?", "Invoice status", "Pending payments", "Budget vs actual". All MUST classify as personal_data.
- [ ] T017 [US2] Test 10 general knowledge queries for correct classification — queries: "What is GST?", "How to register SST?", "What are IFRS standards?", "Explain double-entry bookkeeping", "What is accounts receivable?", "How does MyInvois work?", "Tax filing deadlines in Malaysia", "OVR rules for Singapore", "Difference between FIFO and LIFO", "What is a chart of accounts?". All MUST classify as general_knowledge.
- [ ] T018 [US2] Test 5 ambiguous queries for clarification — queries: "invoices", "taxes", "payments", "compliance", "expenses". System should ask targeted clarification questions (e.g., "Are you asking about your invoices or about invoice processing in general?").
- [x] T019 [US2] Run `npm run build` after intent prompt changes.

**Checkpoint**: US2 complete — Financial queries correctly classified. Known Qwen misclassification bug fixed.

---

## Phase 5: User Story 3 - Self-Improving Accuracy from Corrections (Priority: P2)

**Goal**: Collect user corrections for intent/tool/parameter errors and wire into weekly optimization pipeline.

**Independent Test**: Submit 5 corrections via UI → appear in Convex table → optimization pipeline can query them.

### Implementation for User Story 3

- [x] T020 [P] [US3] Create correction submission mutation in `convex/functions/chatCorrections.ts` — public mutation `submit` that validates Clerk auth, resolves businessId from user's membership, and inserts into `chat_agent_corrections` table. Include internal queries: `getCorrectionsReadyForTraining` (filters by correctionType, checks min count + diversity), `getActiveModelVersion` (returns latest active version for a domain).
- [x] T021 [P] [US3] Create correction feedback UI component in `src/domains/chat/components/correction-feedback.tsx` — thumbs-down button on AI message bubbles. On click: show dropdown with 3 correction types (Intent: "Should have shown my data" / "Should have been general knowledge"; Tool: list of available tools as options; Parameters: text fields for date range, name, category). On submit: call `chatCorrections.submit` mutation. Use semantic tokens (`bg-card`, `text-foreground`) per design system rules.
- [x] T022 [US3] Wire correction feedback component into chat message display — find the chat message bubble component (in `src/domains/chat/` hooks/components), add `<CorrectionFeedback>` to AI message bubbles only. Pass messageId, conversationId, originalQuery, originalIntent, originalToolName from the message state.
- [x] T023 [P] [US3] Create DSPy Intent Classifier module in `src/lambda/fee-classifier-python/chat_intent_module.py` — define `ClassifyIntent` signature (inputs: query, conversation_context; outputs: intent_category, query_type, confidence, reasoning). Create `IntentClassifier(dspy.Module)` using `dspy.ChainOfThought(ClassifyIntent)`. Use `dspy.Suggest` for soft constraints (confidence must be 0-1). Create `create_intent_training_examples()` and `intent_classification_metric()` functions following fee_module.py pattern.
- [x] T024 [P] [US3] Create DSPy Tool Selector module in `src/lambda/fee-classifier-python/chat_tool_selector_module.py` — define `SelectTool` signature (inputs: query, intent_category, available_tools_json, user_role; outputs: tool_name, reasoning, confidence). Create `ToolSelector(dspy.Module)` using `dspy.ChainOfThought(SelectTool)`. Use `dspy.Suggest` to constrain tool_name to valid tool names. Create training examples and metric functions.
- [x] T025 [P] [US3] Create DSPy Parameter Extractor module in `src/lambda/fee-classifier-python/chat_param_extractor_module.py` — define `ExtractParameters` signature (inputs: query, tool_name, tool_schema_json; outputs: parameters_json, reasoning, confidence). Create `ParameterExtractor(dspy.Module)` using `dspy.ChainOfThought(ExtractParameters)`. Create training examples and metric functions.
- [x] T026 [P] [US3] Create DSPy Response Quality module in `src/lambda/fee-classifier-python/chat_response_quality_module.py` — define `EvaluateResponse` signature (inputs: query, tool_result, candidate_responses_json; outputs: best_response_index, reasoning). Create `ResponseQualityEvaluator(dspy.Module)` using `dspy.ChainOfThought(EvaluateResponse)` (simplified from MultiChainComparison to avoid DSPy version issues). Create training examples and metric functions.
- [x] T027 [P] [US3] Create DSPy Clarification Judge module in `src/lambda/fee-classifier-python/chat_clarification_module.py` — define `JudgeClarification` signature (inputs: query, conversation_context; outputs: needs_clarification, clarification_question, reasoning). Create `ClarificationJudge(dspy.Module)` using `dspy.Predict(JudgeClarification)`. Create training examples and metric functions.
- [x] T028 [US3] Create chat module optimization runner in `src/lambda/fee-classifier-python/chat_optimizer.py` — `run_chat_module_optimization(params)` function that: (1) loads corrections from params, (2) splits into train/validation sets (80/20), (3) selects optimizer by type (MIPROv2 default, BootstrapFewShot, etc.), (4) compiles module, (5) evaluates on validation set, (6) compares accuracy against previous model, (7) rejects if worse (automatic quality gating), (8) saves to S3 if better, (9) returns optimized prompt JSON + accuracy metrics.
- [x] T029 [US3] Add chat module tool routes to Lambda handler in `src/lambda/fee-classifier-python/handler.py` — add `optimize_chat_module` tool route that dispatches to `chat_optimizer.run_chat_module_optimization()`. Route based on `moduleType` parameter: intent, tool_selector, param_extractor, response_quality, clarification.
- [x] T030 [US3] Create Convex optimization pipeline in `convex/functions/chatOptimization.ts` — mirror `dspyOptimization.ts` pattern: (1) `getCorrectionsReadyForOptimization` internal query with safeguards (min 100 corrections, min 10 unique queries, new-data-only), (2) `weeklyOptimization` internal action that calls MCP tool `optimize_chat_module` for each ready module type, (3) `recordTrainingResult` internal mutation to store results in `dspy_model_versions` and `dspy_optimization_runs`.
- [x] T031 [US3] Add 3 new Sunday cron jobs in `convex/crons.ts` — (1) `chat-intent-optimization` at Sunday 6 AM UTC calls `chatOptimization.weeklyOptimization` with moduleType="intent", (2) `chat-tool-param-optimization` at Sunday 7 AM UTC with moduleType="tool_selector,param_extractor", (3) `chat-quality-clarification-optimization` at Sunday 8 AM UTC with moduleType="response_quality,clarification".
- [ ] T032 [US3] Deploy Convex changes: `npx convex deploy --yes`
- [ ] T033 [US3] Deploy Lambda changes: `cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2` (if DSPy modules require Lambda redeploy)
- [x] T034 [US3] Run `npm run build` to verify all TypeScript changes compile.

**Checkpoint**: US3 complete — Corrections collected via UI, stored in Convex, optimization pipeline wired with crons. DSPy modules deployed to Lambda.

---

## Phase 6: User Story 4 - Correct Tool Selection and Parameter Extraction (Priority: P2)

**Goal**: Load optimized DSPy prompts at inference time to improve tool selection and parameter extraction accuracy.

**Independent Test**: Send 15 queries across different tool categories — correct tool and parameters selected on first attempt for 90%+.

### Implementation for User Story 4

- [x] T035 [P] [US4] Create model version loader in `src/lib/ai/agent/dspy/model-version-loader.ts` — `loadOptimizedConfig(domain: string)` function that queries Convex `dspy_model_versions` for the latest `active` version with matching domain. Returns `{ systemPrompt, fewShotExamples, version, trainedAt }` or null if no optimized version exists. Cache loaded config for 5 minutes to avoid repeated DB queries.
- [x] T036 [US4] Integrate model version loader into intent-node.ts in `src/lib/ai/agent/nodes/intent-node.ts` — in `performLLMIntentAnalysis()`, call `loadOptimizedConfig("chat_intent")`. If an optimized prompt exists, prepend the few-shot examples to the system prompt and use the optimized prompt as the classification instruction. Fall back to the default prompt if no optimized version exists.
- [x] T037 [US4] Integrate model version loader into model-node.ts in `src/lib/ai/agent/nodes/model-node.ts` — in `callModel()`, call `loadOptimizedConfig("chat_tool_selector")` and `loadOptimizedConfig("chat_param_extractor")`. If available, inject few-shot examples into the tool selection prompt context. This helps Gemini select the right tool and extract correct parameters.
- [ ] T038 [US4] Test 15 queries for correct tool selection — test across all tool categories: (1) "Show me invoices from March" → get_invoices with date filter, (2) "How much do I owe vendors?" → get_ap_aging, (3) "Search for receipt from Grab" → search_documents, (4) "What transactions happened today?" → get_transactions with today's date, (5) "What's the GST rate?" → searchRegulatoryKnowledgeBase, (6) "Cash flow forecast" → analyze_cash_flow, (7) "Any anomalies?" → detect_anomalies, (8) "Sarah's expenses" → get_employee_expenses, (9) "Team spending" → get_team_summary, (10) "AR aging" → get_ar_summary, (11) "Vendor risk analysis" → analyze_vendor_risk, (12) "Action center alerts" → get_action_center_insight, (13) "Sales invoices status" → get_sales_invoices, (14) "Revenue this month" → get_business_transactions, (15) "What is double-entry bookkeeping?" → no tool (direct response).
- [x] T039 [US4] Run `npm run build` to verify model version loader integrates correctly.

**Checkpoint**: US4 complete — DSPy-optimized prompts loaded at inference time. Tool selection accuracy improved.

---

## Phase 7: User Story 5 - High-Quality Response Generation (Priority: P3)

**Goal**: Selective response quality evaluation for data-heavy queries. Ensure no hallucination and well-formatted output.

**Independent Test**: Send 10 data-retrieval queries — all responses include actual numbers, are well-formatted, no fabricated data.

### Implementation for User Story 5

- [x] T040 [US5] Add selective response quality check in `src/lib/ai/agent/nodes/model-node.ts` — after `handleOpenAIResponse()` returns a text response (not tool call), check if the query was data-heavy (involved tool results with >3 data points). If so, call `loadOptimizedConfig("chat_response_quality")` and run a second Gemini call to evaluate/improve the response. For simple responses, skip this step to preserve latency.
- [ ] T041 [US5] Test 10 data-retrieval queries for response quality — verify: (1) responses include exact numbers from tool results (not rounded/fabricated), (2) multi-row data uses tables or bullet points, (3) empty results clearly state "no data found", (4) currency formatted correctly (RM, SGD), (5) dates formatted consistently.
- [x] T042 [US5] Run `npm run build` to verify response quality changes compile.

**Checkpoint**: US5 complete — Data-heavy responses are evaluated for quality. No hallucination.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Full regression test, multi-language verification, RBAC check, final build.

- [ ] T043 Test RBAC enforcement across all 3 roles — Admin (all 13 tools), Manager (7 tools), Employee (5 tools). Send tool-requiring queries with each role and verify only authorized tools are available.
- [ ] T044 Test multi-language support — send queries in Malay ("Tunjukkan invois saya") and Chinese ("显示我的发票"), verify responses are in the same language with correct financial terminology.
- [ ] T045 Test error handling — disable GEMINI_API_KEY temporarily and verify user sees "AI service is temporarily unavailable" (not raw error), then re-enable.
- [ ] T046 Test edge case: rapid 10+ messages — send 10 queries quickly in succession, verify no mixed-up responses or errors.
- [x] T047 Final `npm run build` — must pass cleanly with zero warnings related to this feature.
- [ ] T048 Final `npx convex deploy --yes` — deploy all Convex changes to production.
- [x] T049 Update documentation in `CLAUDE.md` — update "AI Model" section to reflect Gemini 3.1 Flash-Lite replacing Qwen3-8B for chat. Update "Active Technologies" section. Add note about chat_agent_corrections table and optimization pipeline.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (T001-T004) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — verification only, no code changes
- **US2 (Phase 4)**: Depends on Phase 2 — prompt improvements
- **US3 (Phase 5)**: Depends on Phase 2 — can run in parallel with US2
- **US4 (Phase 6)**: Depends on US3 (needs model version loader + DSPy modules deployed)
- **US5 (Phase 7)**: Depends on Phase 2 — can run in parallel with US3/US4
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Independent — verification of Phase 2 work
- **US2 (P1)**: Independent — prompt tuning for Gemini
- **US3 (P2)**: Independent — correction infrastructure + DSPy modules
- **US4 (P2)**: Depends on US3 (needs model version loader from T035 and DSPy modules from T023-T029)
- **US5 (P3)**: Independent — response quality logic in model-node.ts

### Parallel Opportunities

Within Phase 5 (US3):
```
T020 (Convex mutations)  |  T023 (intent module)   |  T021 (correction UI)
                         |  T024 (tool selector)    |
                         |  T025 (param extractor)  |
                         |  T026 (response quality) |
                         |  T027 (clarification)    |
```

Across phases (after Phase 2):
```
US2 (intent prompts)  |  US3 (corrections + DSPy)  |  US5 (response quality)
```

---

## Implementation Strategy

### MVP First (US1 + US2 = Phase 1-4)

1. Complete Phase 1: Setup (config + schema)
2. Complete Phase 2: Foundational (model swap + error handling)
3. Complete Phase 3: US1 (verify zero cold start)
4. Complete Phase 4: US2 (fix intent classification)
5. **STOP and VALIDATE**: Chat should be 10-15x faster with correct intent classification
6. Deploy to production — immediate user value

### Incremental Delivery

1. MVP (Phases 1-4) → Gemini live, intent fixed
2. Add US3 (Phase 5) → Corrections collecting
3. Add US4 (Phase 6) → DSPy-optimized prompts serving
4. Add US5 (Phase 7) → Response quality evaluation
5. Polish (Phase 8) → Full regression + docs

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Each user story is independently testable after its phase completes
- `npm run build` is run after each phase as a gate
- `npx convex deploy --yes` after any Convex schema/function changes
- `cd infra && npx cdk deploy` only after Lambda code changes
- DSPy version compatibility: new modules use dspy.Suggest (not Assert) to stay compatible with current dspy>=2.6.0
