# LHDN E-Invoice Architecture (019-lhdn-einv-flow-2)

## Overview

LHDN MyInvois e-invoice integration for Malaysian businesses. Handles requesting e-invoices from merchants, polling LHDN for received documents, and matching them to expense claims.

## Architecture Decisions & Reasoning

### Why Lambda for LHDN polling (not Convex actions)

**Decision**: Lambda reads LHDN credentials from SSM and calls LHDN API. Convex only handles real-time data and matching.

**Reasoning**:
- Lambda has IAM-native access to AWS SSM — zero exported credentials
- Convex actions would require AWS access keys in env vars (security risk)
- Lambda execution role scoped to `ssm:GetParameter` on specific path pattern
- Keeps the blast radius small: if Lambda is compromised, attacker gets SSM read-only (not full AWS access)
- Convex is the wrong place for AWS integrations — it's a data layer, not an infrastructure layer

**Anti-pattern to avoid**: Never put AWS SDK calls in Convex `"use node"` actions. If you need AWS services, create a Lambda and invoke it via Vercel API route or EventBridge.

### Why EventBridge for scheduling (not Convex cron)

**Decision**: EventBridge rule triggers Lambda every 5 minutes. Lambda self-discovers businesses with pending requests by querying Convex.

**Reasoning**:
- **Zero env vars**: EventBridge → Lambda is purely IAM-based (no shared secrets, no URLs to configure)
- **AWS-native**: Lambda already needs AWS for SSM — scheduling via EventBridge keeps everything in one plane
- **Self-healing**: Lambda queries Convex for businesses with pending requests each time. If no businesses need polling, Lambda exits in <1 second (minimal cost)
- **Cost**: EventBridge rules are free tier (14M invocations/month). Lambda costs ~$0 when no businesses need polling

**Previous approach (removed)**: Convex cron → Vercel API route → Lambda. Required `LHDN_POLL_LAMBDA_URL`, `INTERNAL_SERVICE_KEY`, `LHDN_POLL_LAMBDA_ARN` env vars and a Vercel middleware route. Unnecessary complexity.

**Anti-pattern to avoid**: Don't route AWS-to-AWS via Vercel/Convex. If Lambda is the destination, trigger it directly from EventBridge or another AWS service.

### Why SSM Parameter Store for LHDN client secrets (not Convex or Secrets Manager)

**Decision**: Per-business LHDN `clientSecret` stored in SSM SecureString at `/groot-finance/businesses/{businessId}/lhdn-client-secret`.

**Reasoning**:
- Convex is a plain-text database — never store secrets there
- SSM SecureString is free (standard tier), encrypted at rest with KMS
- AWS Secrets Manager costs $0.40/secret/month — unnecessary for static credentials
- Lambda reads SSM via IAM role (no credentials exported)
- Vercel API route writes to SSM via OIDC role assumption (for the admin settings form)

**Anti-pattern to avoid**: Never add a `lhdnClientSecret` field to Convex schema. Client ID is fine (not sensitive), but secrets always go to SSM.

### Polling Flow

```
EventBridge (every 5 min)
        │
        └── Lambda finanseal-lhdn-polling
              │
              ├── Convex query: getBusinessesForLhdnPolling
              │   (returns businesses with pending e-invoice requests)
              │
              ├── For each business:
              │     ├── SSM.getParameter (LHDN secret)
              │     ├── LHDN /connect/token (auth)
              │     ├── LHDN /api/v1.0/documents/recent
              │     ├── LHDN /api/v1.0/documents/{uuid}/raw (buyer email)
              │     │
              │     └── Convex mutation: processLhdnReceivedDocuments
              │           ├── 4-tier matching
              │           ├── Store document
              │           ├── Update expense claim
              │           └── Create notification
              │
              └── Convex real-time subscription fires → frontend updates
```

### 4-Tier Matching Algorithm

When LHDN returns received documents, the system matches them to expense claims:

| Tier | Method | Confidence | Auto-resolve? |
|------|--------|-----------|---------------|
| Tier 1 | Buyer email `+suffix` (e.g., `einvoice+ABC123@hellogroot.com`) | 1.0 | Yes |
| Tier 1.5 | Merchant's invoice reference number (`internalId`) | 0.95 | Yes |
| Tier 2 | Supplier TIN + total amount + date (±1 day) | 0.85 | Yes (if unique match) |
| Tier 3 | Amount + date fuzzy match | 0.5 | No — flagged for manual review |

Matching runs inside `processLhdnReceivedDocuments` mutation (direct DB access, not cross-function calls).

### Multi-tenant credential management

Each business has its own LHDN MyInvois credentials:
- **Client ID**: Stored in Convex `businesses.lhdnClientId` (not sensitive)
- **Client Secret**: Stored in SSM at `/groot-finance/businesses/{businessId}/lhdn-client-secret`
- **TIN**: Stored in Convex `businesses.lhdnTin`

Admin sets credentials via Business Settings → E-Invoice tab:
1. Client ID → saved to Convex via normal business profile update
2. Client Secret → saved to SSM via separate API call (`POST /api/v1/account-management/businesses/lhdn-secret`)

## File Structure

```
convex/functions/
├── einvoiceJobs.ts              # Internal mutation: email ref matching (for email processing)
├── einvoiceJobsNode.ts          # "use node" action: incoming email processing
├── einvoiceReceivedDocuments.ts  # Query: list unmatched documents for admin review
└── system.ts                    # reportEinvoiceFormFillResult, getEinvoiceMetricsByMerchant,
                                 # updateHintEffectiveness, getBusinessesForLhdnPolling,
                                 # processLhdnReceivedDocuments, saveMerchantFormConfig

src/lambda/einvoice-form-fill-python/
├── handler.py                   # Main 3-tier form fill (3136+ lines) with DSPy integration
├── dspy_modules/                # DSPy module definitions (001-dspy-cua-optimization)
│   ├── module_loader.py         # S3 cache: download optimized modules from finanseal-bucket
│   ├── troubleshooter.py        # MIPROv2-optimized FormDiagnosis
│   ├── recon.py                 # BootstrapFewShot recon-to-instructions
│   ├── instruction_guard.py     # Assert/Suggest CUA instruction constraints
│   ├── confidence_gate.py       # Tier 1 confidence prediction (threshold 0.7)
│   └── buyer_matcher.py         # ChainOfThought buyer profile matching
├── optimization/                # Offline optimization pipeline
│   ├── data_collector.py        # Extract training data from Convex logs
│   ├── optimizer.py             # MIPROv2 + BootstrapFewShot training
│   └── evaluator.py             # Per-merchant scorecards
└── optimization_handler.py      # Optimizer Lambda entry point (EventBridge every 3 days)

src/lambda/einvoice-form-fill-browser-use/
└── handler.py                   # Tier 2B fallback (browser-use, for CUA 429 rate limits)

src/lambda/lhdn-polling/
└── handler.ts                   # Lambda: EventBridge (5min) → Convex query → SSM → LHDN → Convex

src/lambda/document-processor-python/
└── steps/detect_qr.py           # Multi-tier QR detection (zxingcpp → pyzbar → vision localize+crop)

src/app/api/v1/expense-claims/[id]/
├── request-einvoice/route.ts    # User-initiated: invoke form fill Lambda
├── upload-einvoice/route.ts     # Manual e-invoice upload
└── resolve-match/route.ts       # Admin: resolve Tier 3 fuzzy match

src/domains/expense-claims/components/
├── einvoice-section.tsx         # E-invoice status section in expense claim detail
├── einvoice-status-badge.tsx    # Status badge component
└── einvoice-match-review.tsx    # Admin review UI for Tier 3 matches

infra/lib/
└── document-processing-stack.ts # CDK: All Lambdas + EventBridge rules + SSM permissions
                                 # Includes: document-processor, form-fill, lhdn-polling,
                                 # email-processor, dspy-optimizer (every 3 days)
```

## Env Vars Required

| Variable | Service | Description |
|----------|---------|-------------|
| `EINVOICE_FORM_FILL_LAMBDA_ARN` | Vercel | ARN from CDK deploy output |
| `LHDN_API_BASE_URL` | Lambda (CDK) | `https://preprod-api.myinvois.hasil.gov.my` (preprod) or `https://api.myinvois.hasil.gov.my` (prod) |
| `NEXT_PUBLIC_CONVEX_URL` | Lambda (CDK) | Convex deployment URL (hardcoded in CDK) |

**Removed** (no longer needed after EventBridge migration):
- ~~`LHDN_POLL_LAMBDA_URL`~~ — was Vercel route URL for Convex→Lambda bridge
- ~~`INTERNAL_SERVICE_KEY`~~ — was shared secret for service-to-service auth
- ~~`LHDN_POLL_LAMBDA_ARN`~~ — was for Vercel to invoke Lambda

## Convex Tables

| Table | Purpose |
|-------|---------|
| `einvoice_received_documents` | Stores LHDN received documents with match status |
| `einvoice_request_logs` | Audit log for e-invoice requests + DSPy self-learning fields (reconDescription, generatedHint, hintEffectivenessOutcome, confidenceGateScore, failureCategory, perFieldResults, buyerProfileMatchResult, dspyModuleVersion) |
| `expense_claims` (fields) | `einvoiceRequestStatus`, `einvoiceAttached`, `lhdnReceivedDocumentUuid`, `lhdnReceivedStatus`, `merchantFormUrl`, etc. |
| `merchant_einvoice` | Merchant-specific config: URL, formConfig (fields, cuaHints, successCount, tier1FailureCount, lastReconDescription, lastOptimizedAt, formChangeDetectedAt), matchPatterns |

## CUA Form Fill Architecture (Self-Evolving Agent)

### Models Used
- **Gemini 2.5 Computer Use Preview**: CUA visual form filling (Tier 2). $1.25/$10 per M tokens.
- **Gemini 3.1 Flash-Lite Preview**: Recon, troubleshoot, verify, DSPy diagnosis. $0.25/$1.50 per M tokens. **Always use this for non-CUA Gemini calls.**
- **CapSolver API**: reCAPTCHA v2 ($0.80/1k) + Cloudflare Turnstile ($1.20/1k).

### E-Invoice Lambdas

| Lambda | File | Purpose | Trigger |
|--------|------|---------|---------|
| `finanseal-einvoice-form-fill` | `src/lambda/einvoice-form-fill-python/handler.py` | Main 3-tier form fill + DSPy self-learning | Vercel API (OIDC) |
| `finanseal-einvoice-form-fill-bu` | `src/lambda/einvoice-form-fill-browser-use/handler.py` | Tier 2B fallback (CUA 429 rate limit) | Invoked by form-fill Lambda |
| `finanseal-dspy-optimizer` | `src/lambda/einvoice-form-fill-python/optimization_handler.py` | MIPROv2 + BootstrapFewShot optimization | EventBridge (every 3 days) |
| `finanseal-lhdn-polling` | `src/lambda/lhdn-polling/handler.ts` | Poll LHDN API for received documents | EventBridge (every 5 min) |
| `finanseal-einvoice-email-processor` | (Node.js) | Process incoming e-invoice emails from SES | SES receipt rule |

Lambda 2 (browser-use) exists because `browser-use` library uses asyncio internally, which conflicts with the main Lambda's `sync_playwright` + `nest_asyncio`.

Lambda 3 (dspy-optimizer) shares the same Docker image as form-fill but uses `optimization_handler.handler` as entry point. Runs offline every 3 days — frequency is tuneable.

### Browser Selection
- **Local Playwright Chromium** (default): Fast, free, works for 80% of merchants.
- **Browserbase** (fallback): Residential IP + real fingerprint. Required for Cloudflare managed challenge merchants (auto-detected and saved in cuaHints).

### End-to-End Flow

```
User clicks "Request E-Invoice"
  → Next.js API validates claim + composes buyerDetails
  → Invokes Lambda 1 (async)

Lambda 1 (with DSPy enhancements):
  1. SETUP: Build buyer/receipt, fetch merchant config (cuaHints)
  2. BROWSER: Browserbase if cuaHints says so, else local Chromium
     → Runtime: detect managed Turnstile → switch to Browserbase
  3. PRE-FILL: Company toggle → Validate gate → Phone → Text → Dropdowns
  4. CAPTCHA: reCAPTCHA/Turnstile/hCaptcha → CapSolver API
  5. DSPy CONFIDENCE GATE: Predict Tier 1 success (skip if <0.7)
  6. TIER 1: Saved formConfig (CSS selectors, ~5s) — skipped if gate says no
  7. DSPy INSTRUCTION GUARD: Assert required fields + Suggest selectors
  8. TIER 2: Gemini CUA visual fill (~120s, $0.10-0.50)
     → 429? → invoke Lambda 2 (Tier 2B)
  9. VERIFY: Flash-Lite checks screenshot for success/error
  10. TIER 3: On failure → DSPy troubleshoot → learn cuaHints → save generatedHint
  11. DSPy FEEDBACK: Update previous hint's effectiveness (helped/not_helped)
  12. COST LOG: Actual tokens + CapSolver + Browserbase + DSPy fields

Merchant sends e-invoice email
  → SES receives at einvoice+{ref}@einv.hellogroot.com
  → Lambda (email processor): match → download PDF → forward to user

Every 3 days (EventBridge):
  → Lambda (dspy-optimizer):
    1. Collect training data from einvoice_request_logs
    2. MIPROv2: optimize troubleshooter prompts (hint effectiveness metric)
    3. BootstrapFewShot: learn recon patterns from successful fills
    4. Evaluate: compare optimized vs baseline scores
    5. If better: upload to S3 (finanseal-bucket/dspy-modules/)
    6. Form fill Lambda picks up new module on next cold start
```

### Self-Evolving Loop (Enhanced with DSPy — 001-dspy-cua-optimization)

```
merchant_einvoice.formConfig:
  fields: [...CSS selectors...]     ← Tier 1 (fast path)
  cuaHints: "Click Company tab..."  ← Learned from Tier 3
  successCount: N                   ← Tier 1 confidence
  lastFailureReason: "..."          ← Tier 3 diagnosis
  tier1FailureCount: N              ← Consecutive Tier 1 failures
  lastReconDescription: "..."       ← Most recent successful recon
  lastOptimizedAt: timestamp        ← Last MIPROv2 run
  formChangeDetectedAt: timestamp   ← When confidence gate detected change

Each failure → troubleshoot → new cuaHints → next run smarter
Each success → save formConfig → next run uses Tier 1 (fast)
Hint effectiveness tracked: did the hint actually help on the next attempt?
```

### DSPy Self-Improving Pipeline (001-dspy-cua-optimization)

**Architecture**: 6 DSPy enhancements layered on top of the existing 3-tier form fill system. All enhancements have fallback to non-optimized behavior.

**Design Decision**: DSPy modules are lazily imported (not at Lambda cold start) to avoid 10s penalty. Optimized modules cached in S3, downloaded on first use per container.

#### 6 Features

| # | Feature | DSPy Primitive | Priority | Status |
|---|---------|---------------|----------|--------|
| 1 | Troubleshooter optimization | MIPROv2 | P0 | Deployed |
| 2 | Cross-merchant recon intelligence | BootstrapFewShot | P1 | Deployed |
| 3 | Performance measurement | dspy.Evaluate | P1 | Deployed |
| 4 | Self-healing CUA instructions | dspy.Assert + dspy.Suggest | P2 | Deployed |
| 5 | Smart Tier 1 skip | Confidence prediction | P2 | Deployed |
| 6 | Intelligent buyer profile matching | dspy.ChainOfThought | P3 | Deployed |

#### How It Works

```
Form Fill Attempt:
  1. Confidence gate predicts Tier 1 success (skip if <0.7)
  2. CUA instructions guarded by Assert (required fields) + Suggest (selectors)
  3. Recon includes BootstrapFewShot examples from successful merchants
  4. On failure: troubleshooter generates hint → saved with "pending" effectiveness
  5. On next attempt: previous hint's effectiveness updated ("helped"/"not_helped")
  6. Every 3 days: optimizer retrains troubleshooter + recon from accumulated data

Data Flow:
  einvoice_request_logs (extended with DSPy fields)
    → Training data for MIPROv2 (hint effectiveness pairs)
    → Training data for BootstrapFewShot (recon-success pairs)
    → Per-merchant evaluation scorecards (computed on-demand)
```

#### Key Design Decisions

1. **Optimization runs offline every 3 days** (not during form fill). EventBridge triggers `finanseal-dspy-optimizer` Lambda. Frequency stored as tuneable parameter.
2. **Optimized modules stored in S3** (`finanseal-bucket/dspy-modules/{module_name}/latest.json`). Downloaded by form fill Lambda on cold start (~200ms). Decoupled from Lambda deployment.
3. **Schema consolidation** — extended existing `einvoice_request_logs` table with DSPy fields (reconDescription, generatedHint, hintEffectivenessOutcome, confidenceGateScore, failureCategory, etc.) instead of creating new tables.
4. **Evaluation reports are computed queries** — `getEinvoiceMetricsByMerchant` aggregates logs on-the-fly. No separate storage needed.
5. **All DSPy modules have fallback** — if S3 module missing, optimization not run, or DSPy import fails, system falls back to baseline behavior. Zero risk of breaking existing flow.
6. **Gemini 3.1 Flash-Lite** used for all DSPy calls (troubleshooter, recon, confidence gate, buyer matcher). CUA model only for Tier 2 visual form fill.

#### DSPy Module Files

```
src/lambda/einvoice-form-fill-python/
├── dspy_modules/
│   ├── __init__.py
│   ├── module_loader.py          # S3 module cache: download, /tmp/ cache, fallback
│   ├── troubleshooter.py         # MIPROv2-optimized FormDiagnosis signature
│   ├── recon.py                  # BootstrapFewShot ReconToInstructions
│   ├── instruction_guard.py      # Assert (required fields) + Suggest (CSS selectors)
│   ├── confidence_gate.py        # Tier 1 success prediction (threshold: 0.7)
│   └── buyer_matcher.py          # ChainOfThought: TIN match → fuzzy name → recency
├── optimization/
│   ├── __init__.py
│   ├── data_collector.py         # Extract training data from Convex logs
│   ├── optimizer.py              # MIPROv2 + BootstrapFewShot training
│   └── evaluator.py              # Per-merchant scorecards
└── optimization_handler.py       # Optimizer Lambda entry point (EventBridge)
```

#### Checking Evaluation Scorecards

**Convex Dashboard**: Functions → `system:getEinvoiceMetricsByMerchant` → Run with `{"minAttempts": 1}`

**CLI**: `aws lambda invoke --function-name finanseal-dspy-optimizer --payload '{"source":"manual"}' --profile groot-finanseal --region us-west-2 /tmp/result.json && cat /tmp/result.json | python3 -m json.tool`

#### DSPy Fields on einvoice_request_logs

| Field | Type | Purpose |
|-------|------|---------|
| `reconDescription` | string | Recon step output (form field descriptions) |
| `generatedHint` | string | cuaHint text generated by troubleshooter |
| `hintEffectivenessOutcome` | "helped"\|"not_helped"\|"pending" | Feedback loop: did the hint help? |
| `confidenceGateScore` | number (0-1) | Tier 1 confidence prediction |
| `confidenceGateDecision` | "proceed"\|"skip" | Tier 1 gate outcome |
| `failureCategory` | "connectivity"\|"form_validation"\|"session"\|"captcha"\|"unknown" | Classified failure type |
| `perFieldResults` | array | Per-field fill outcomes [{fieldName, filled, selector, error}] |
| `buyerProfileMatchResult` | object | Buyer profile selection {profileSelected, reasoning, matchType} |
| `dspyModuleVersion` | string | Version ID of optimized module used |

### QR Code Detection (Multi-Tier with Vision Localization)

**Problem solved**: zxingcpp missed dense QR codes on dark backgrounds (e.g., Sterling Station receipts with 2 QR codes but only 1 detected).

**Architecture**: Smart fast-path with progressive fallback.

```
Tier 1: zxingcpp on original image (fast path, ~100ms)
  ↓ if <2 QRs found
Tier 2: Image preprocessing (contrast, brightness, sharpen, grayscale)
  + zxingcpp + pyzbar on 5 variants (~400ms)
  ↓ if still <2 QRs
Tier 3: Gemini Vision localization → crop → decode (~2s)
  Vision returns bounding boxes → crop to QR region → run decoders on crop
```

**Key design decision**: Use Gemini Vision to LOCATE QR codes (bounding boxes), then crop and decode. Vision is good at spatial localization but bad at QR decoding. Decoders are good at decoding but need focused input. Combining both is 200x more efficient than brute-force scanning.

**Performance**: 80% of receipts use fast path (Tier 1 only, ~2s total). Only difficult cases activate Tier 2/3.

**Files**: `src/lambda/document-processor-python/steps/detect_qr.py`, `Dockerfile` (added pyzbar + libzbar)

### Merchant-Specific Patterns

| Merchant | Type | Notes |
|----------|------|-------|
| FamilyMart | Dynamic URL (QR) | react-phone-input (+60 prefix), Company toggle, Tier 1 learned |
| Jaya Grocer | Static (invoice2e.my) | Validate gate (BRN+TIN→unlock), reCAPTCHA v2, CapSolver |
| 99 Speed Mart | Dedicated flow | DevExtreme widgets, OTP via SES email |
| TK Bakery (Zeoniq) | Zeoniq platform | Cloudflare managed → Browserbase required |
| 7-Eleven | Account-gated | Login + OTP, per-business buyer profiles, WAF blocks automation |
| MR. D.I.Y. | Static | Standard form, Tier 1 learned |
