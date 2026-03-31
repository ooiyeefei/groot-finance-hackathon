---
paths:
  - "src/lib/ai/**"
  - "convex/functions/*Optimization*"
  - "convex/functions/memoryTools*"
  - "convex/functions/chatOptimization*"
  - "src/lambda/*python*"
  - "src/lambda/fee-classifier*"
  - "src/lambda/einvoice-form-fill*"
---
# AI Systems: DSPy, Mem0, Model Selection

## Gemini Model Selection (MANDATORY)

- **CUA (Computer Use Agent)**: `gemini-2.5-computer-use-preview-10-2025` -- only model for browser automation
- **All other Gemini calls**: **Always use `gemini-3.1-flash-lite-preview`** -- best price/performance ($0.25/$1.50 per M tokens). Single standard model across ALL DSPy features.
- **Never use `gemini-2.0-flash`** or `gemini-3-flash-preview` -- both deprecated. `gemini-2.0-flash` shuts down June 1, 2026.
- **Chat agent exception**: Chat assistant uses Qwen3-8B on Modal (not Gemini).

## DSPy Self-Improvement System (2026-03-20)

**Flywheel**: Correction -> training -> quality gate -> promotion -> inference -> better accuracy -> fewer corrections

**Architecture**:
- Readiness gate: 20+ corrections, 10+ unique intents
- Train/validation split: 80/20, stratified by intent category
- Optimization: BootstrapFewShot (max_bootstrapped_demos=4, max_labeled_demos=8, max_rounds=3)
- Quality gate: candidate accuracy vs previous on held-out eval set
- Promotion: candidate -> promoted (active), previous -> superseded
- Schedule: EventBridge weekly (Sunday 2am UTC)

**Key Files**:
- `convex/functions/chatOptimizationNew.ts` - Full pipeline
- `src/lib/ai/dspy/model-version-loader.ts` - Load active model from S3 (5min cache)
- `src/lib/ai/dspy/types.ts` - ModelVersion, OptimizedPromptArtifact types
- `src/lambda/einvoice-form-fill-python/optimization/quality_gate.py` - Eval set evaluation

**Tables**: `dspy_model_versions`, `chat_agent_corrections`, `dspy_optimization_logs`

## Action Center DSPy (2026-03-24)

User feedback trains a unified relevance classifier per business.

- **Post-filter**: Algorithms generate candidates -> DSPy classifier filters by business preference
- **Unified classifier**: Single `action-center-relevance` module across all 7 algorithms
- **Per-business models**: Corrections + models isolated by businessId
- **6-month rolling window** for training data
- **Readiness/quality gates**: Same pattern as chat DSPy

**Key Files**:
- `convex/functions/actionCenterOptimization.ts` -- Full pipeline
- `convex/functions/actionCenterInsights.ts` -- Corrections capture in `updateStatus`
- `src/lambda/fee-classifier-python/action_center_relevance.py` -- DSPy module

**Tables**: `action_center_corrections`, `dspy_model_versions` (module="action-center-relevance"), `actionCenterInsights`

## Mem0 Persistent Memory System (2026-03-20)

Long-term memory with semantic search, contradiction detection, and LRU eviction.

**Architecture**:
- Storage: Qdrant Cloud (vectors) + Convex (metadata)
- Auto-recall: top-5 relevant memories (0.7 cosine threshold) before generation
- Auto-save: Heuristic detection (keywords: "always/never/prefer", amounts, dates, people)
- Contradiction detection: Topic-based (<10ms), 6 financial topics
- LRU eviction: 200-memory limit per user per business

**Tools**: `memory_store`, `memory_search`, `memory_recall`, `memory_forget`

**Key Files**:
- `src/lib/ai/agent/memory/mem0-service.ts` - Mem0 API wrapper
- `src/lib/ai/agent/auto-recall.ts` - Semantic search before generation
- `src/lib/ai/agent/memory-candidate-detector.ts` - Heuristic detection
- `convex/functions/memoryTools.ts` - Contradiction detection, LRU eviction

**Topic Classification**: currency_preference, team_roles, business_facts, approval_workflow, payment_terms, compliance_rules
