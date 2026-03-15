# Research: DSPy CUA Integration

**Date**: 2026-03-15

## No Unknowns

All technical decisions were resolved during spec analysis:

- **DSPy version**: 2.6+ (already in requirements.txt)
- **LLM for DSPy**: Gemini Flash-Lite via litellm (per project conventions)
- **Module storage**: S3 `finanseal-bucket/dspy-modules/` (already used by module_loader.py)
- **Optimization schedule**: EventBridge every 3 days (CDK stack already provisions this)
- **Training data source**: Convex `einvoice_request_logs` (schema fields already exist)

## Key Decisions

| Decision | Rationale | Alternatives Rejected |
|----------|-----------|----------------------|
| Wire existing modules (not rewrite) | Modules are well-designed, just not integrated | Rewriting from scratch — unnecessary, modules follow DSPy best practices |
| Lazy-load DSPy in troubleshoot/recon only | Avoids 10s cold start on Tier 1 fast path | Eager loading — would penalize every invocation |
| Fallback to baseline on any failure | Reliability over optimization | Hard failure — would break form fills when S3 is unavailable |
| Assert with 3 backtracks before fallback | Balances retry cost (~3s each) vs. field coverage | No retries — defeats the purpose; unlimited retries — too expensive |
| BootstrapFewShot max 4 demos | DSPy recommendation for few-shot; 4 examples sufficient for form pattern generalization | More demos — increases prompt length and cost without proportional benefit |
