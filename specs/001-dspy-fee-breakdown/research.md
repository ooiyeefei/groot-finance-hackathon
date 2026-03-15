# Research: Hybrid Fee Breakdown Detection (Rules + DSPy)

**Date**: 2026-03-15
**Branch**: `001-dspy-fee-breakdown`

## Decision 1: DSPy Module Architecture

**Decision**: Use `dspy.ChainOfThought` with a `ClassifyFee` signature that takes fee_name + platform_name as inputs and returns account_code + confidence as outputs.

**Rationale**: ChainOfThought adds step-by-step reasoning which improves classification accuracy for ambiguous fee names (e.g., "Seller Subsidy Type B"). The signature approach is DSPy-native and works cleanly with BootstrapFewShot and MIPROv2 optimizers.

**Alternatives considered**:
- `dspy.Predict` (simpler, no reasoning trace) — rejected because fee classification benefits from the LM explaining its reasoning for ambiguous cases
- `dspy.ReAct` (tool-using agent) — overkill for a classification task
- Custom module with multi-sample voting — rejected as initial approach due to cost (N API calls per classification); can add later if self-reported confidence proves unreliable

## Decision 2: Confidence Scoring Strategy

**Decision**: Use explicit confidence output field in the DSPy signature (Pattern A — self-assessed confidence). Cap fallback (non-DSPy) classifications at 0.80 confidence.

**Rationale**: Zero-overhead, works well for routing to human review. DSPy doesn't support native logprob confidence. Self-assessed confidence is "calibrated enough" for the green/yellow/red UI — we're not making financial decisions based on the score, just routing review attention.

**Alternatives considered**:
- Multi-sample voting (Pattern B) — 5x cost per classification, deferred to future optimization
- Calibration layer trained on historical accuracy — premature without enough production data

## Decision 3: DSPy Hosting — Python Lambda (Docker)

**Decision**: Deploy DSPy module as a Docker-based Python Lambda, following the existing `document-processor-python` pattern. New CDK stack: `FeeClassifierStack`.

**Rationale**:
- DSPy requires Python runtime — cannot run in Node.js Lambda
- Docker-based Lambda matches the existing pattern (`document-processor-python` uses Docker)
- Lambda is cheaper than Modal for infrequent batch calls (fee classification runs on import, not continuously)
- Gemini API key stored as Lambda env var (same pattern as document processor)
- ARM_64 architecture for cost optimization (DSPy is pure Python, no native dependencies requiring x86)

**Alternatives considered**:
- Modal serverless — more expensive for low-frequency calls, adds another vendor dependency
- Adding to existing `document-processor-python` Lambda — violates single-responsibility, different scaling profile
- API Gateway + Lambda — unnecessary; Convex calls Lambda directly via MCP pattern

## Decision 4: Invocation Pattern — Convex → Lambda

**Decision**: Add a new endpoint to the existing MCP Server API Gateway (`/mcp` route) or create a lightweight HTTP endpoint. Convex calls via `callMCPTool()` pattern with internal service key auth.

**Rationale**:
- Reuses the existing `convex/lib/mcpClient.ts` infrastructure
- Internal service key auth avoids IAM complexity from Convex
- MCP pattern already proven in the codebase

**Alternatives considered**:
- Direct Lambda invocation via AWS SDK from Convex — Convex actions can't use AWS SDK natively
- New API Gateway — unnecessary proliferation; can add route to existing MCP API GW
- Vercel API route as proxy — adds unnecessary hop, Convex → Vercel → Lambda

## Decision 5: Model Versioning & Storage

**Decision**: Store optimized DSPy state as JSON files in S3 (`finanseal-bucket`). Key pattern: `dspy-models/{platform}/v{N}.json`. Active version tracked in Convex table `dspy_model_versions`.

**Rationale**:
- JSON state files are portable, readable, and version-safe (DSPy recommendation)
- S3 is free-tier for small JSON files
- Convex table tracks which version is active per platform, enabling instant rollback
- Lambda loads model JSON from S3 on cold start (or from bundled default)

**Alternatives considered**:
- Bundle model in Lambda deployment package — requires redeployment to update model
- Store in SSM Parameter Store — 4KB limit too small for model state
- Convex file storage — adds latency for Lambda cold start; S3 is native

## Decision 6: Hybrid Model Architecture (Per-Platform + Per-Business)

**Decision**:
- **Shared base model per platform**: Trained on pooled corrections from ALL businesses for that platform. Learns fee name → fee category patterns.
- **Per-business overlay**: Business-specific corrections override the base model's account code mapping. Stored in `fee_classification_corrections` table with businessId.
- **Implementation**: At inference time, fetch base model for platform + business-specific corrections. Merge corrections into few-shot examples prioritizing business-specific over shared.

**Rationale**: Fee naming patterns are platform-specific ("Seller Subsidy Type B" is Shopee-only), but account code assignments differ by business. Pooling corrections across businesses for the base model means even new businesses benefit from existing training data. Per-business overlay ensures each business's chart of accounts is respected.

**Alternatives considered**:
- Fully per-business models — cold start problem for new businesses with zero corrections
- Fully shared model — would map to wrong account codes for businesses with custom CoA
- Fine-tuning (actual model weights) — overkill; DSPy prompt optimization is sufficient

## Decision 7: Activation Threshold & Fallback

**Decision**:
- DSPy activates per-platform after ≥20 corrections for that platform
- Below threshold: Gemini 3.1 Flash-Lite direct prompting (non-DSPy) with confidence capped at 0.80
- If DSPy Lambda is unavailable (timeout/error): same Gemini fallback

**Rationale**: 20 corrections gives BootstrapFewShot enough diversity to learn meaningful patterns. Below that, raw prompting with corrections as context is equally effective. The 0.80 confidence cap signals to users that these classifications are less reliable than DSPy-optimized ones.

## Decision 8: LM Selection

**Decision**: Gemini 3.1 Flash-Lite (`gemini/gemini-3.1-flash-lite-preview`) for all fee classification — both DSPy and fallback.

**Rationale**:
- Per CLAUDE.md: "All other Gemini calls (recon, verify, troubleshoot, DSPy, browser-use Tier 2B): Always use gemini-3.1-flash-lite-preview"
- Best price/performance: $0.25/$1.50 per M tokens
- DSPy supports Gemini natively via litellm (`dspy.LM("gemini/...")`)
- Qwen3-8B is reserved for the chat agent only

## Decision 9: MIPROv2 Optimization Schedule

**Decision**: Weekly batch optimization triggered by Convex cron → Lambda invocation. Uses `auto="medium"` preset (~15-25 trials). Requires ≥100 corrections to run.

**Rationale**:
- Weekly is frequent enough to capture new fee patterns without excessive cost
- 100 correction minimum ensures enough data for meaningful optimization
- `auto="medium"` balances optimization quality with Gemini API cost
- Cron triggers from Convex, optimization runs on Lambda with extended timeout (15 min)

## Decision 10: Custom Platform Support

**Decision**: The 5 default platforms (Shopee, Lazada, TikTok Shop, Stripe, GrabPay) are seeded automatically. Admins can add custom platforms via the fee rules manager UI. Custom platforms get their own Tier 1 rules and DSPy training pool.

**Rationale**: Southeast Asian SMEs use many platforms. Locking to 5 means unsupported platforms get no classification. Custom platforms follow the exact same architecture — just a different `platform` string in the rules and corrections tables.
