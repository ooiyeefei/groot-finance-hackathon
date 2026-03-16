# Research: Self-Improving AI AP 3-Way Matching

## Decision 1: Lambda Reuse vs New Lambda

**Decision**: Extend existing `fee-classifier-python` Lambda with a new `/match_po_invoice` route.

**Rationale**: The existing Lambda already has DSPy 2.6+, litellm, boto3, and Gemini integration. Adding a route is ~200 lines of Python. A new Lambda would require a new CDK stack, Docker build, IAM roles, and API Gateway route — significant infrastructure overhead for minimal isolation benefit.

**Alternatives Considered**:
- New dedicated Lambda: Rejected — infrastructure duplication, same Python runtime, same S3 bucket access needed.
- Convex action with direct Gemini call: Rejected — Convex actions can't use AWS SDK natively, and DSPy requires Python runtime.

## Decision 2: DSPy Module Architecture

**Decision**: Single `POMatchingModule` with `dspy.ChainOfThought` signature, following the `BankTransactionClassifier` pattern.

**Rationale**: The bank recon module (`bank_recon_module.py`) is the proven pattern — ChainOfThought for reasoning, Assert for constraints, single forward() method. PO matching has similar I/O: structured inputs (descriptions, quantities, prices) → structured output (pairings with confidence + reasoning).

**Alternatives Considered**:
- Multi-step pipeline (separate modules for matching, variance, diagnosis): Rejected — adds latency and complexity. Single module with rich output fields is simpler.
- dspy.Predict (no reasoning): Rejected — ChainOfThought reasoning traces are a core P2 requirement.

## Decision 3: Correction Storage Pattern

**Decision**: New `po_match_corrections` Convex table, mirroring `bank_recon_corrections` and `fee_classification_corrections` pattern.

**Rationale**: Consistent with existing correction tables. Stores: business ID, vendor name, original pairing (descriptions + confidence), corrected pairing, correction type, user, timestamp. Indexed by business for efficient training data retrieval.

**Alternatives Considered**:
- Embed corrections in `po_matches` record: Rejected — makes training data queries expensive (must scan all matches to find corrections).
- Shared corrections table: Rejected — different correction schemas per domain (fee classification has account codes, PO matching has line-item pairings).

## Decision 4: Optimization Frequency

**Decision**: Weekly cron (Sunday 4AM UTC), staggered 1 hour after bank recon (3AM) and 2 hours after fee classification (2AM).

**Rationale**: Matches the proven weekly cadence. PO matching corrections accumulate slower than bank transactions (fewer invoices than bank transactions), so weekly is sufficient. Daily would waste compute on businesses with <5 new corrections.

## Decision 5: Cross-Tenant Aggregation

**Decision**: Anonymized read-only aggregation query. A Convex query scans all `po_match_corrections` and `po_matches` tables, groups by vendor name (normalized), and outputs failure rates. No line-item details or business IDs in the output.

**Rationale**: PDPA-compliant (clarification Q1). Vendor names are not PII. Failure rates are statistical aggregates. This enables "problem vendor" detection (SC-007) without data sharing.

## Decision 6: AI Call Metering

**Decision**: New field `aiMatchCallsThisMonth` on the `businesses` table (or a lightweight `ai_usage` table). Incremented on each Tier 2 invocation. Checked before invoking Lambda. Reset by a monthly cron on the 1st.

**Rationale**: Simple counter approach. Plan limits (Starter 150, Pro 500, Enterprise unlimited) checked against the counter. No need for a separate billing service — this piggybacks on the existing Stripe subscription plan detection.
