# Implementation Plan: DSPy Self-Improving E-Invoice CUA Pipeline

**Branch**: `001-dspy-cua-integration` | **Date**: 2026-03-15 | **Spec**: [spec.md](spec.md)

## Summary

Integrate 5 scaffolded DSPy modules into the E-Invoice CUA runtime handler (`handler.py`). The modules exist but are dead code — `handler.py` only uses inline `dspy.Predict(FormDiagnosis)`. This plan wires the modules into the runtime, implements the training data collection pipeline, and validates the optimization loop end-to-end.

## Technical Context

**Language/Version**: Python 3.11 (Lambda Docker), TypeScript 5.9.3 (Convex)
**Primary Dependencies**: DSPy 2.6+, litellm, Playwright, Gemini Flash-Lite (`gemini-3.1-flash-lite-preview`), boto3
**Storage**: S3 (`finanseal-bucket/dspy-modules/`) for optimized module state, Convex for training data logs
**Testing**: pytest (Python modules), manual Lambda invocation for integration
**Target Platform**: AWS Lambda (Docker, x86_64), EventBridge scheduler
**Project Type**: Backend Lambda pipeline (no frontend changes)
**Performance Goals**: Tier 1 <10s (unchanged), Tier 2 <130s (from ~120s, +10s for DSPy), Tier 3 <15s
**Constraints**: Lazy imports mandatory (DSPy cold start ~10s), S3 module cache in /tmp/, fallback-to-baseline on any failure
**Scale/Scope**: ~50 merchants, ~100 form fills/month, optimization runs every 3 days

## Constitution Check

*No constitution defined — proceeding without gates.*

## Project Structure

### Documentation (this feature)

```text
specs/001-dspy-cua-integration/
├── plan.md              # This file
├── research.md          # Phase 0 — no unknowns to research
├── data-model.md        # Phase 1 — training data schemas
├── contracts/           # Phase 1 — Convex query contracts
├── quickstart.md        # Phase 1 — how to test locally
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/lambda/einvoice-form-fill-python/
├── handler.py                          # Runtime — MODIFY (wire modules)
├── optimization_handler.py             # EventBridge entry — EXISTS (verify)
├── dspy_modules/
│   ├── __init__.py                     # EXISTS
│   ├── troubleshooter.py               # EXISTS — MIPROv2 module
│   ├── recon.py                        # EXISTS — BootstrapFewShot module
│   ├── buyer_matcher.py                # EXISTS — ChainOfThought
│   ├── confidence_gate.py              # EXISTS — Tier 1 confidence
│   ├── instruction_guard.py            # EXISTS — Assert/Suggest
│   └── module_loader.py               # EXISTS — S3 cache loader
├── optimization/
│   ├── __init__.py                     # EXISTS
│   ├── optimizer.py                    # EXISTS — MIPROv2 + BootstrapFewShot
│   ├── data_collector.py              # EXISTS — MODIFY (implement queries)
│   └── evaluator.py                   # EXISTS — per-merchant scorecards

convex/
├── schema.ts                           # EXISTS — einvoice_request_logs fields present
└── functions/
    └── system.ts                       # MODIFY — add raw training data query

infra/lib/
└── document-processing-stack.ts        # EXISTS — optimizer Lambda already provisioned
```

**Structure Decision**: All files already exist. This is a wiring/integration task, not a greenfield build. The only new code is the Convex query for raw training data (FR-012) and the integration points in handler.py.

## Integration Points (5 changes to handler.py)

### 1. Troubleshooter Integration (MIPROv2 + ChainOfThought)
- **Location**: `handler.py:2168-2304` — `troubleshoot()` function
- **Current**: Inline `FormDiagnosis` signature + `dspy.Predict(FormDiagnosis)`
- **Target**: Import `create_troubleshooter()` from `dspy_modules.troubleshooter`, load optimized state via `module_loader`, call `module.forward()`
- **Signature change**: Add `previous_hints` and `tier_reached` input fields (module's signature has them, inline doesn't)
- **Fallback**: If module loading fails, create baseline `OptimizedTroubleshooter()` (equivalent behavior)

### 2. Instruction Guard Integration (Assert + Suggest)
- **Location**: `handler.py:1906-1967` — CUA instruction building in `run_tier2()`
- **Current**: Hardcoded instruction string template
- **Target**: After building the base instruction, pass through `generate_guarded_instructions()` to validate required fields
- **Note**: The guard validates the instruction TEXT, not replaces it — it ensures email/company/TIN are mentioned
- **Fallback**: If guard fails after 3 retries, use the original hardcoded template (current behavior)

### 3. Recon Module Integration (BootstrapFewShot + ChainOfThought)
- **Location**: `handler.py:1892-1902` — Gemini Flash recon call in `run_tier2()`
- **Current**: Plain `gemini_flash()` call that returns a text description
- **Target**: After getting the Gemini Flash recon text, pass it through `create_recon_module()` to generate structured CUA instructions using ChainOfThought + few-shot examples
- **Fallback**: If recon module fails, use the raw recon text as before

### 4. Training Data Logging
- **Location**: `handler.py` — throughout (wherever `_dspy_state` dict is populated)
- **Current**: `_dspy_state` captures `generatedHint`, `failureCategory` — already saved to Convex logs
- **Target**: Also capture `reconDescription`, `dspyModuleVersion`, `confidenceGateScore`
- **Note**: The Convex schema fields already exist — just need to populate them

### 5. Data Collection Pipeline
- **Location**: `optimization/data_collector.py` — `collect_hint_effectiveness_pairs()` and `collect_recon_success_pairs()`
- **Current**: Return empty arrays (placeholder)
- **Target**: Call new Convex query (`getEinvoiceRawTrainingData`) to get resolved hint-effectiveness pairs and successful recon patterns
