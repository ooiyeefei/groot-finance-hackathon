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
└── system.ts                    # getBusinessesForLhdnPolling query + processLhdnReceivedDocuments mutation

src/lambda/
├── lhdn-polling/
│   └── handler.ts               # Lambda: EventBridge → Convex query → SSM → LHDN → Convex mutation
└── einvoice-form-fill/
    └── handler.ts               # Lambda: Stagehand + Browserbase form fill

src/app/api/v1/
├── expense-claims/[id]/
│   ├── request-einvoice/
│   │   └── route.ts             # User-initiated: invoke form fill Lambda
│   ├── upload-einvoice/
│   │   └── route.ts             # Manual e-invoice upload
│   └── resolve-match/
│       └── route.ts             # Admin: resolve Tier 3 fuzzy match
└── account-management/businesses/
    └── lhdn-secret/
        └── route.ts             # SSM: save/check LHDN client secret (Vercel OIDC)

src/domains/expense-claims/components/
├── einvoice-section.tsx          # E-invoice status section in expense claim detail
├── einvoice-status-badge.tsx     # Status badge component
└── einvoice-match-review.tsx     # Admin review UI for Tier 3 matches

src/lambda/document-processor-python/
└── steps/detect_qr.py           # QR code detection for auto e-invoice request

infra/lib/
└── document-processing-stack.ts  # CDK: Lambda + EventBridge rule + SSM permissions
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
| `einvoice_request_logs` | Audit log for e-invoice requests (form fill attempts) |
| `expense_claims` (fields) | `einvoiceRequestStatus`, `einvoiceAttached`, `lhdnReceivedDocumentUuid`, `lhdnReceivedStatus`, etc. |
| `merchant_einvoice_urls` | Merchant-specific config: URL, formConfig (CSS selectors), cuaHints (learned instructions), matchPatterns |

## CUA Form Fill Architecture (Self-Evolving Agent)

### Models Used
- **Gemini 2.5 Computer Use Preview**: CUA visual form filling (Tier 2). $1.25/$10 per M tokens.
- **Gemini 3.1 Flash-Lite Preview**: Recon, troubleshoot, verify, DSPy diagnosis. $0.25/$1.50 per M tokens. **Always use this for non-CUA Gemini calls.**
- **CapSolver API**: reCAPTCHA v2 ($0.80/1k) + Cloudflare Turnstile ($1.20/1k).

### Two Lambdas

| Lambda | File | Purpose | Model |
|--------|------|---------|-------|
| `finanseal-einvoice-form-fill` | `src/lambda/einvoice-form-fill-python/handler.py` | Main 3-tier form fill + troubleshooter | CUA + Flash-Lite |
| `finanseal-einvoice-form-fill-bu` | `src/lambda/einvoice-form-fill-browser-use/handler.py` | Tier 2B fallback (CUA 429 rate limit) | Flash-Lite via browser-use |

Lambda 2 exists because `browser-use` library uses asyncio internally, which conflicts with the main Lambda's `sync_playwright` + `nest_asyncio`.

### Browser Selection
- **Local Playwright Chromium** (default): Fast, free, works for 80% of merchants.
- **Browserbase** (fallback): Residential IP + real fingerprint. Required for Cloudflare managed challenge merchants (auto-detected and saved in cuaHints).

### End-to-End Flow

```
User clicks "Request E-Invoice"
  → Next.js API validates claim + composes buyerDetails
  → Invokes Lambda 1 (async)

Lambda 1:
  1. SETUP: Build buyer/receipt, fetch merchant config (cuaHints)
  2. BROWSER: Browserbase if cuaHints says so, else local Chromium
     → Runtime: detect managed Turnstile → switch to Browserbase
  3. PRE-FILL: Company toggle → Validate gate → Phone → Text → Dropdowns
  4. CAPTCHA: reCAPTCHA/Turnstile/hCaptcha → CapSolver API
  5. TIER 1: Saved formConfig (CSS selectors, ~5s)
  6. TIER 2: Gemini CUA visual fill (~120s, $0.10-0.50)
     → 429? → invoke Lambda 2 (Tier 2B)
  7. VERIFY: Flash-Lite checks screenshot for success/error
  8. TIER 3: On failure → DSPy troubleshoot → learn cuaHints
  9. COST LOG: Actual tokens + CapSolver + Browserbase

Merchant sends e-invoice email
  → SES receives at einvoice+{ref}@einv.hellogroot.com
  → Lambda 3 (email processor): match → download PDF → forward to user
```

### Self-Evolving Loop

```
merchant_einvoice_urls.formConfig:
  fields: [...CSS selectors...]     ← Tier 1 (fast path)
  cuaHints: "Click Company tab..."  ← Learned from Tier 3
  successCount: N                   ← Tier 1 confidence
  lastFailureReason: "..."          ← Tier 3 diagnosis

Each failure → troubleshoot → new cuaHints → next run smarter
Each success → save formConfig → next run uses Tier 1 (fast)
```

### Merchant-Specific Patterns

| Merchant | Type | Notes |
|----------|------|-------|
| FamilyMart | Dynamic URL (QR) | react-phone-input (+60 prefix), Company toggle, Tier 1 learned |
| Jaya Grocer | Static (invoice2e.my) | Validate gate (BRN+TIN→unlock), reCAPTCHA v2, CapSolver |
| 99 Speed Mart | Dedicated flow | DevExtreme widgets, OTP via SES email |
| TK Bakery (Zeoniq) | Zeoniq platform | Cloudflare managed → Browserbase required |
| 7-Eleven | Account-gated | Login + OTP, per-business buyer profiles, WAF blocks automation |
| MR. D.I.Y. | Static | Standard form, Tier 1 learned |
