# Research: Gemini Migration + DSPy Self-Improving Chat Agent

**Branch**: `027-gemini-dspy-chat-agent` | **Date**: 2026-03-19

## Decision 1: LLM Integration Pattern (Gemini replacing Qwen)

**Decision**: Use Google Gemini API directly via `fetch()` (OpenAI-compatible endpoint), not through DSPy at inference time.

**Rationale**:
- The current model-node.ts uses `fetch()` to `{endpoint}/chat/completions` with OpenAI-compatible format. Gemini supports OpenAI-compatible mode via `generativelanguage.googleapis.com/v1beta/openai/`.
- DSPy modules run in Python Lambda — calling Lambda for every real-time chat query would add 200-500ms latency, blowing the 6-second budget.
- DSPy is used for **training/optimization only** (weekly crons). The optimized prompts and few-shot examples are extracted and baked into the TypeScript nodes.

**Alternatives considered**:
- Vercel AI SDK with `@ai-sdk/google` — adds dependency; current pattern is simpler and works.
- LangChain's `ChatGoogleGenerativeAI` — already using LangGraph but model calls are raw fetch; keeping consistent.
- DSPy at inference time via Lambda — too slow for real-time chat (~500ms per hop).

## Decision 2: DSPy Module Execution Architecture

**Decision**: DSPy modules serve two roles:
1. **Training-time (Python Lambda)**: Full DSPy modules with Refine, ChainOfThought, optimizers — run weekly via cron.
2. **Inference-time (TypeScript)**: Optimized prompts/few-shot examples extracted from trained DSPy modules and embedded in TypeScript LangGraph nodes — run per query via Gemini API.

**Rationale**:
- This matches the existing pattern: `fee_module.py` trains with DSPy, the optimized model state (JSON) is saved to S3, then loaded at inference time.
- For chat, the "model state" = optimized system prompts + few-shot examples, which can be serialized and loaded into TypeScript nodes.
- Keeps real-time latency under control while still benefiting from DSPy's optimization.

**Alternatives considered**:
- Run DSPy Python modules via Lambda for every chat query — 200-500ms overhead per call, unacceptable.
- Port DSPy to TypeScript — no TypeScript DSPy equivalent exists.
- Use LangChain tools to call DSPy Lambda — still adds latency, defeats purpose.

## Decision 3: Gemini API Configuration

**Decision**: Use Gemini's OpenAI-compatible endpoint with `gemini-3.1-flash-lite-preview` model.

**Rationale**:
- Per CLAUDE.md: "All other Gemini calls: Always use `gemini-3.1-flash-lite-preview`"
- Cheapest option ($0.25/$1.50 per M tokens), fast enough for chat
- OpenAI-compatible mode means minimal code changes — same `fetch()` pattern, same tool calling format
- The `configure_lm()` function in existing DSPy modules already uses `dspy.LM(model="gemini/gemini-3.1-flash-lite-preview")` — proven to work

**Configuration**:
```
Endpoint: https://generativelanguage.googleapis.com/v1beta/openai
Model: gemini-3.1-flash-lite-preview
API Key: GEMINI_API_KEY (already in env)
Temperature: 0.3 (same as current)
Max tokens: 1000 (same as current)
```

## Decision 4: DSPy 3.x Compatibility

**Decision**: New modules use `dspy.Refine` instead of deprecated `dspy.Assert`. Keep `dspy.Suggest` (still supported).

**Rationale**:
- DSPy 3.x deprecates `dspy.Assert` in favor of `dspy.Refine` module.
- `dspy.Suggest` remains supported for soft constraints.
- Existing modules (fee, bank recon, PO, AR, vendor) keep `dspy.Assert` for now — separate migration branch.
- Current Lambda uses `dspy>=2.6.0` — needs upgrade to 3.x for new modules.

**Migration impact**:
- New chat modules: Use `dspy.Refine` from day 1.
- Lambda `requirements.txt`: Upgrade to `dspy>=3.0.0` — but this may break existing modules that use Assert. Need to either pin version per module or migrate Assert→Refine first.
- **Risk**: Upgrading DSPy in the Lambda to 3.x could break existing Assert-using modules. Mitigation: Either (a) keep DSPy 2.x and don't use Refine in new modules, or (b) do the Assert→Refine migration in all modules first.

## Decision 5: Correction Table Design

**Decision**: Single new Convex table `chat_agent_corrections` following existing correction table patterns.

**Rationale**:
- Existing pattern: `fee_classification_corrections`, `bank_recon_corrections`, `po_match_corrections`, `order_matching_corrections`, `vendor_item_matching_corrections` — each domain has its own table.
- Chat agent corrections are a new domain, so new table.
- Global pooling (per clarification Q1): corrections from all businesses feed one global model.
- Fields follow existing pattern: businessId, original values, corrected values, correctionType, createdBy, createdAt.

## Decision 6: Optimization Pipeline Extension

**Decision**: Add 3 new cron jobs (not 5) to the weekly Sunday schedule.

**Rationale**:
- The 5 DSPy modules (intent, tool selector, parameter extractor, response quality, clarification judge) can be grouped:
  1. **Intent + Clarification** — both deal with query understanding, trained on intent corrections.
  2. **Tool Selector + Parameter Extractor** — both deal with tool usage, trained on tool/param corrections.
  3. **Response Quality** — trained on response quality corrections.
- This keeps the cron schedule manageable (existing 4 + new 3 = 7 total, still fits in Sunday window).
- Each cron calls the DSPy Lambda with the appropriate module type and corrections.

**Schedule**: Sunday 6 AM, 7 AM, 8 AM UTC (after existing 4 jobs at 2-5 AM).

## Decision 7: Optimized Prompt Delivery to TypeScript

**Decision**: Store optimized prompts/few-shot examples in Convex `dspy_model_versions` table (new `domain` values), loaded at inference time.

**Rationale**:
- Existing pattern: DSPy model state → S3 JSON file → loaded in Python Lambda at inference.
- For chat agent: the "model state" is the optimized system prompt + few-shot examples. These are small (< 10KB) and can be stored in Convex directly (no S3 needed).
- TypeScript nodes load the latest active model version from Convex at startup / periodically.
- Avoids S3 read latency on every chat query.

**Flow**:
1. Weekly cron → Convex action → calls DSPy Lambda `optimize_chat_module`
2. Lambda trains module → extracts optimized prompt + few-shot examples → returns JSON
3. Convex action → stores in `dspy_model_versions` with `domain: "chat_intent"` etc.
4. TypeScript intent-node.ts → on init, loads latest active model version from Convex
5. Uses optimized prompt + few-shot examples in the Gemini API call
