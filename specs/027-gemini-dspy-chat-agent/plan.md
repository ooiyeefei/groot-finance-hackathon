# Implementation Plan: Gemini Migration + DSPy Self-Improving Chat Agent

**Branch**: `027-gemini-dspy-chat-agent` | **Date**: 2026-03-19 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/027-gemini-dspy-chat-agent/spec.md`

## Summary

Replace Qwen3-8B (Modal) with Gemini 3.1 Flash-Lite for all chat agent LLM calls, eliminating 10-65s cold starts. Keep LangGraph orchestration unchanged. Add 5 DSPy self-improving modules (trained in Python Lambda, optimized prompts served to TypeScript nodes). Add correction collection with structured UI and wire into existing weekly optimization pipeline.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (Next.js 15.5.7 + LangGraph 0.4.5) + Python 3.11 (Lambda DSPy)
**Primary Dependencies**: @langchain/langgraph, @langchain/core, dspy>=2.6.0 (Python), Convex 1.31.3
**Storage**: Convex (corrections, model versions), S3 finanseal-bucket (model artifacts)
**Testing**: Manual UAT against production chat, `npm run build` gate
**Target Platform**: Vercel (Next.js) + AWS Lambda (DSPy) + Convex Cloud
**Project Type**: Web application (existing monorepo)
**Performance Goals**: <6s end-to-end chat response (p95), zero cold start
**Constraints**: Free Convex plan (2GB bandwidth), Gemini API rate limits, existing RBAC must be preserved
**Scale/Scope**: ~10 active businesses, 13 tools, 8 LangGraph nodes, 5 new DSPy modules

## Constitution Check

*Constitution is template-only (not project-specific). No gates to check.*

## Project Structure

### Documentation (this feature)

```text
specs/027-gemini-dspy-chat-agent/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: Research decisions
├── data-model.md        # Phase 1: Data model design
├── quickstart.md        # Phase 1: Setup guide
├── contracts/           # Phase 1: API contracts
│   └── api-contracts.md
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2: Implementation tasks (created by /speckit.tasks)
```

### Source Code (repository root)

```text
# TypeScript (Next.js + LangGraph) — modified files
src/lib/ai/
├── config/
│   └── ai-config.ts                    # MODIFY: Gemini endpoint config
├── agent/
│   ├── nodes/
│   │   ├── intent-node.ts              # MODIFY: Gemini + DSPy-optimized prompts
│   │   ├── model-node.ts               # MODIFY: Gemini API calls
│   │   └── guardrail-nodes.ts          # MODIFY: Gemini for topic guardrail
│   ├── config/
│   │   └── prompts.ts                  # MODIFY: Gemini-optimized system prompts
│   └── dspy/
│       └── model-version-loader.ts     # NEW: Load optimized prompts from Convex
└── langgraph-agent.ts                  # NO CHANGE: Graph structure preserved

src/domains/chat/
└── components/
    └── correction-feedback.tsx          # NEW: Thumbs-down + correction dropdown UI

# Convex (backend)
convex/
├── schema.ts                            # MODIFY: Add chat_agent_corrections table
├── functions/
│   └── chatOptimization.ts              # NEW: Optimization pipeline for chat modules
└── crons.ts                             # MODIFY: Add 3 new Sunday cron jobs

# Python (Lambda DSPy modules)
src/lambda/fee-classifier-python/
├── chat_intent_module.py                # NEW: DSPy Intent Classifier (ChainOfThought)
├── chat_tool_selector_module.py         # NEW: DSPy Tool Selector (ChainOfThought)
├── chat_param_extractor_module.py       # NEW: DSPy Parameter Extractor (ChainOfThought)
├── chat_response_quality_module.py      # NEW: DSPy Response Quality (MultiChainComparison)
├── chat_clarification_module.py         # NEW: DSPy Clarification Judge (Predict)
├── chat_optimizer.py                    # NEW: Optimization runner for chat modules
├── handler.py                           # MODIFY: Add chat module tool routes
└── requirements.txt                     # CHECK: DSPy version compatibility
```

**Structure Decision**: Follows existing domain-driven architecture. Chat agent TypeScript modifications stay in `src/lib/ai/`. New DSPy Python modules go in the existing Lambda directory alongside fee/bank recon modules. Convex schema and functions follow established patterns.

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Gemini API response format differs from Qwen/OpenAI | High — breaks tool calling | Use Gemini's OpenAI-compatible mode; test tool calling format thoroughly |
| DSPy 3.x upgrade breaks existing Assert-using modules | High — breaks fee/bank recon | Keep DSPy 2.x for now; use Suggest (not Refine) in new modules if needed |
| Optimized prompts too large for Convex field | Medium — exceeds 1MB doc limit | Few-shot examples are <10KB; monitor size after training |
| Intent classification regressions after Gemini swap | High — worse than current | Run side-by-side comparison with 50 test queries before swapping |
| Correction UI adds friction to chat UX | Low — optional interaction | Thumbs-down is unobtrusive; dropdown only appears on click |

## Implementation Phases

### Phase 1: Gemini Model Swap (P1 — Instant Responses + Zero Cold Start)

**Goal**: Replace all Qwen/Modal LLM calls with Gemini 3.1 Flash-Lite. No DSPy yet — just the model swap.

**Files to modify**:
1. `src/lib/ai/config/ai-config.ts` — Point chat config to Gemini OpenAI-compatible endpoint
2. `src/lib/ai/agent/nodes/model-node.ts` — Verify Gemini response format compatibility (tool_calls, content)
3. `src/lib/ai/agent/nodes/intent-node.ts` — Update LLM call to use Gemini (same fetch pattern, different endpoint)
4. `src/lib/ai/agent/nodes/guardrail-nodes.ts` — Update topic classification LLM call

**Verification**:
- Send 20 test queries covering all intent types
- Verify tool calling works (financial queries trigger correct tools)
- Verify cold start is eliminated (query after 30min idle responds <6s)
- `npm run build` passes

### Phase 2: Intent Classification Improvement (P1 — Accurate Classification)

**Goal**: Fix the known Qwen misclassification bug where financial queries get classified as "general_knowledge".

**Files to modify**:
1. `src/lib/ai/agent/nodes/intent-node.ts` — Improve system prompt for Gemini's strengths, add explicit examples
2. `src/lib/ai/agent/config/prompts.ts` — Refine intent classification prompt with Gemini-specific optimizations

**Verification**:
- Run 20 financial queries (revenue, invoices, cash flow, AP/AR) — all must classify as `personal_data`
- Run 10 general knowledge queries — all must classify as `general_knowledge`
- Run 5 ambiguous queries — should trigger clarification

### Phase 3: Correction Collection Infrastructure (P2 — Self-Improvement Foundation)

**Goal**: Add Convex table, mutation, and UI for collecting user corrections.

**Files to create/modify**:
1. `convex/schema.ts` — Add `chat_agent_corrections` table
2. `convex/functions/chatCorrections.ts` — Submit mutation + internal queries
3. `src/domains/chat/components/correction-feedback.tsx` — Thumbs-down + correction type dropdown UI
4. Wire correction UI into chat message bubbles

**Verification**:
- Submit a correction via the UI → appears in Convex table
- `npx convex deploy --yes` succeeds
- `npm run build` passes

### Phase 4: DSPy Chat Modules (P2 — Training Infrastructure)

**Goal**: Create 5 new DSPy Python modules for the Lambda.

**Files to create/modify**:
1. `src/lambda/fee-classifier-python/chat_intent_module.py` — Intent Classifier (ChainOfThought)
2. `src/lambda/fee-classifier-python/chat_tool_selector_module.py` — Tool Selector (ChainOfThought)
3. `src/lambda/fee-classifier-python/chat_param_extractor_module.py` — Parameter Extractor (ChainOfThought)
4. `src/lambda/fee-classifier-python/chat_response_quality_module.py` — Response Quality (MultiChainComparison)
5. `src/lambda/fee-classifier-python/chat_clarification_module.py` — Clarification Judge (Predict)
6. `src/lambda/fee-classifier-python/chat_optimizer.py` — Optimization runner
7. `src/lambda/fee-classifier-python/handler.py` — Add new tool routes

**Verification**:
- CDK deploy succeeds: `cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2`
- Calling `optimize_chat_module` via MCP returns optimized prompt JSON

### Phase 5: Optimization Pipeline Wiring (P2 — Self-Improvement Loop)

**Goal**: Wire corrections → weekly crons → DSPy Lambda → Convex model versions → TypeScript nodes.

**Files to create/modify**:
1. `convex/functions/chatOptimization.ts` — Weekly optimization action (mirrors `dspyOptimization.ts` pattern)
2. `convex/crons.ts` — Add 3 new Sunday cron jobs (6 AM, 7 AM, 8 AM UTC)
3. `src/lib/ai/agent/dspy/model-version-loader.ts` — Load optimized prompts from Convex
4. `src/lib/ai/agent/nodes/intent-node.ts` — Use loaded optimized prompts if available

**Verification**:
- Manual cron trigger → optimization runs → model version created
- Intent node loads optimized prompt → uses it for classification
- `npm run build` passes

### Phase 6: Response Quality + Final Polish (P3)

**Goal**: Selective response quality evaluation for data-heavy queries. End-to-end smoke test.

**Files to modify**:
1. `src/lib/ai/agent/nodes/model-node.ts` — Add selective response quality check for multi-tool queries
2. Full regression test: all existing features (RBAC, multi-language, topic guardrails, all 13 tools)

**Verification**:
- Complete UAT across all 3 roles (admin, manager, employee)
- Multi-language test (English, Malay, Chinese)
- Performance test: 10 queries, all <6s
- `npm run build` passes
- `npx convex deploy --yes` succeeds
