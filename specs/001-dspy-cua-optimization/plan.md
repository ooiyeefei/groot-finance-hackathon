# Implementation Plan: DSPy-Powered Self-Improving E-Invoice CUA System

**Branch**: `001-dspy-cua-optimization` | **Date**: 2026-03-15 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-dspy-cua-optimization/spec.md`

## Summary

Upgrade the e-invoice CUA form fill system from basic one-shot DSPy usage to a fully self-improving pipeline using MIPROv2 optimization, BootstrapFewShot recon learning, Assert/Suggest constraints, confidence-gated Tier 1, ChainOfThought buyer matching, and a comprehensive evaluation framework. All enhancements layer on top of the existing 3-tier architecture without breaking current behavior.

## Technical Context

**Language/Version**: Python 3.11 (Lambda runtime)
**Primary Dependencies**: DSPy 3.1.3, Gemini 3.1 Flash-Lite, zxingcpp, pyzbar, Playwright
**Storage**: S3 (optimized modules), Convex (request logs, merchant config)
**Testing**: Manual integration tests via receipt upload + CloudWatch log verification
**Target Platform**: AWS Lambda (Docker container, x86_64, 1024MB)
**Project Type**: Backend service (Lambda + Convex)
**Performance Goals**: <500ms additional latency from DSPy enhancements
**Constraints**: DSPy lazy-imported (10s cold start penalty if eager), Gemini 3.1 Flash-Lite for all non-CUA calls
**Scale/Scope**: ~50-100 form fill attempts/week across ~20 merchants

## Constitution Check

*No project constitution configured. Proceeding with project CLAUDE.md rules.*

- AWS-first for AWS operations: Lambda has IAM-native access - PASS
- Least privilege: S3 read for modules, S3 write for optimizer output - PASS
- Cost optimization: S3 standard (free tier), EventBridge (free tier) - PASS
- Existing stack constraints respected: No new Convex tables, extend existing - PASS

## Project Structure

### Documentation (this feature)

```text
specs/001-dspy-cua-optimization/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
src/lambda/einvoice-form-fill-python/
├── handler.py                    # Main 3-tier form fill (modify: add DSPy enhancements)
├── dspy_modules/                 # NEW: DSPy module definitions
│   ├── __init__.py
│   ├── troubleshooter.py         # MIPROv2-optimized FormDiagnosis
│   ├── recon.py                  # BootstrapFewShot recon-to-instructions
│   ├── instruction_guard.py      # Assert/Suggest CUA instruction constraints
│   ├── confidence_gate.py        # Tier 1 confidence prediction
│   ├── buyer_matcher.py          # ChainOfThought buyer profile matching
│   └── module_loader.py          # S3 module cache loading
├── optimization/                 # NEW: Offline optimization pipeline
│   ├── __init__.py
│   ├── optimizer.py              # MIPROv2 + BootstrapFewShot training
│   ├── evaluator.py              # DSPy Evaluate framework
│   └── data_collector.py         # Extract training data from Convex logs
└── requirements.txt              # Add: dspy (already present)

convex/
├── schema.ts                     # Modify: extend einvoice_request_logs
└── functions/
    └── system.ts                 # Modify: add evaluation query functions

infra/lib/
└── document-processing-stack.ts  # Modify: add optimizer Lambda + EventBridge
```

**Structure Decision**: New DSPy modules live in a `dspy_modules/` subdirectory within the form fill Lambda to keep them organized. The optimization pipeline lives in `optimization/` as a separate concern. A new optimizer Lambda is added to the CDK stack with an EventBridge rule (every 3 days).
