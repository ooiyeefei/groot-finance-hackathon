# Coding Rules & Guidelines

Instructions for AI coding agents working on Groot Finance.

## Workflow Rules

1. **Plan First**: Think through the problem, read relevant files, write plan to `tasks/todo.md`
2. **Get Approval**: Check in before implementing
3. **Track Progress**: Mark todo items complete as you go
4. **Explain Changes**: Give high-level explanation of each change
5. **Keep It Simple**: Minimal changes, avoid complexity
6. **Document Results**: Add review section to `tasks/todo.md` when done

## Project Context

**Groot Finance**: AI financial co-pilot that works, learns, and improves — for Southeast Asian SMEs.
**Vision**: See `docs/product_vision.md` for full product vision, positioning, USP, and persona definitions.
**Stack**: Next.js 15.4.6 + Convex + AWS Lambda + Gemini 3.1 Flash-Lite + DSPy + Mem0
**Docs**: See `docs/README.md` for full documentation

### What Groot IS and IS NOT (CRITICAL — read before any design decision)

**Groot is an AGENTIC AI company, not a SaaS accounting app.**
- The AI agent IS the product. Accounting, invoicing, and expense features EXIST TO SERVE the agent.
- Every feature should ask: "Can the user do this through the chat agent?" If not, build the agent capability first.
- The chat agent is the PRIMARY interface — dashboards and pages are SECONDARY.
- We compete with Xero/QuickBooks the way Tesla competes with Toyota — fundamentally different architecture.

**Three personas the agent serves:**
1. **Personal Assistant** (Employee) — snap receipt → auto-claim → track reimbursement
2. **Manager's Right-Arm** (Manager) — team spending alerts, late approval flags, budget visibility
3. **CFO Copilot** (Owner/Finance Admin) — cash flow forecasting, board reports, vendor optimization, proactive risk alerts

**The moat: Self-improving AI**
- Every user correction trains the AI (DSPy weekly retraining)
- Corrections → training → accuracy → fewer corrections → smarter system (the flywheel)
- Per-business learning via Mem0 persistent memory
- This compounding value is impossible to replicate with static LLM prompts

### Domain Structure
```
src/domains/
├── expense-claims/    # Expense submission & approval
├── invoices/         # Document processing & OCR
├── chat/             # AI assistant
├── analytics/        # Dashboards & metrics
├── users/            # Team management
└── ...               # See docs/architecture/overview.md

src/lib/
├── csv-parser/       # Shared: CSV/XLSX parsing + column mapping
├── ai/               # Shared: AI config, LangGraph agent
├── utils/            # Shared: formatters, helpers
└── hooks/            # Shared: reusable React hooks
```

### Domain-Driven Design (MANDATORY)

**`src/domains/` is for business domains only** — features that represent a real user capability (expense claims, sales invoices, accounting entries). Each domain owns its pages, components, hooks, and business logic.

**`src/lib/` is for shared capabilities** — reusable infrastructure that multiple domains consume (CSV parsing, AI services, utilities). Shared capabilities NEVER get their own route/page or sidebar entry.

**Rules when adding new features:**
1. **Ask "Is this a business domain or a shared capability?"**
   - Business domain = something users navigate to (expense claims, sales invoices, analytics)
   - Shared capability = something other features use (CSV parsing, file upload, AI mapping, export engine)
2. **Business domains** → `src/domains/<domain-name>/` with components, hooks, lib, types
3. **Shared capabilities** → `src/lib/<capability-name>/` with the same internal structure
4. **Shared UI components** that aren't domain-specific → `src/components/ui/` or `src/components/<feature>/`
5. **Never create a standalone page or sidebar entry for a shared capability** — it should be embedded within the consuming domain's UI (e.g., CSV import appears as a modal inside the sales invoices page, not as its own "Import" page)
6. **Consuming domains own the user journey** — the domain decides when to trigger the shared capability and what to do with the results
7. **Shared capabilities are parser/mapper only** — they return structured data; the consuming domain handles persistence (writing to Convex tables)

**Example flow for CSV import in AR Reconciliation (#271):**
```
src/domains/sales-invoices/         # Business domain (owns the page)
  └── components/
      └── ar-reconciliation.tsx     # Renders <CsvImportModal> from shared lib
                                    # Receives CsvImportResult
                                    # Writes to sales_orders table (domain logic)

src/lib/csv-parser/                 # Shared capability (no page, no route)
  └── components/
      └── csv-import-modal.tsx      # Reusable modal, returns structured data
```

### Product & Engineering Principles (CRITICAL)

**Groot is an Agentic AI startup, not a standard SaaS.** Every feature decision must be evaluated through this lens. See `docs/product_vision.md` for the full vision and competitive positioning.

**1. Self-Improving AI Over Static Rules**
- Standard SaaS advice says "don't use expensive AI for things a simple `if/else` can solve." That advice works for a 2022 accounting app — not for Groot.
- **The Scaling Wall**: Regex/rules work for 5 Malaysian banks. When we have 100+ merchants using 20+ banks and e-wallets across SE Asia, hardcoded patterns become an unmaintainable nightmare that breaks every time a bank changes their export format.
- **Our moat is AI that learns**: Features should self-improve, self-evolve, and learn from user behavior over time. Every user correction should make the system smarter for all users — not just memorize a mapping.
- **Don't overdo AI either**: Use AI only where it provides genuine leverage. Simple CRUD, auth, navigation — these don't need AI. But classification, matching, anomaly detection, document understanding — these are where DSPy shines.

**2. Tiered Intelligence Architecture**
All AI-powered features follow a two-tier pattern:

| Tier | Engine | Cost | When |
|------|--------|------|------|
| **Tier 1** | Rule-based (regex, exact match, heuristics) | Free, instant | Runs first, handles 60-80% of cases |
| **Tier 2** | DSPy / LLM (MIPROv2, BootstrapFewShot, Assert) | API cost, ~1-3s | Handles Tier 1 leftovers — the "long tail" |

**Existing examples of this pattern:**
- **Fee breakdown**: Tier 1 keyword rules → Tier 2 DSPy semantic classification
- **E-invoice detection**: Tier 1 field validation → Tier 2 CUA learning + troubleshooting
- **Bank reconciliation matching**: Tier 1 amount+reference+date → Tier 2 DSPy fuzzy matching + lumped sum bundling
- **AR reconciliation**: Tier 1 invoice number match → Tier 2 AI column mapping

**DSPy framework advantages:**
- `BootstrapFewShot`: User corrections become training examples that **generalize** (not just memorize)
- `MIPROv2`: Optimizes prompts for domain-specific understanding (Malaysian banking dialect, SE Asian vendor names)
- `dspy.Assert`: Enforces business constraints (e.g., split match amounts must sum to bank transaction)

**3. IFRS / Global Accounting Standards**
- All accounting features MUST follow IFRS (International Financial Reporting Standards) as the baseline
- Double-entry bookkeeping is mandatory — every transaction must have balanced debits and credits
- Journal entries must support: posting, reversal, voiding, period locking
- Chart of Accounts follows standard classification: Assets (1xxx), Liabilities (2xxx), Equity (3xxx), Revenue (4xxx), COGS (5xxx), Expenses (6xxx)
- Bank reconciliation must produce a proper reconciliation statement (bank balance vs GL balance)
- Support for multi-currency with home currency conversion per IFRS 21

**4. Build the Moat, Not Just the Feature**
When designing any new feature, ask:
- "Does this get smarter with more users?" → If yes, invest in the learning loop
- "Will this break at 100x scale?" → If yes, use DSPy over hardcoded rules
- "Does this follow accounting standards?" → If no, fix it before shipping

## Mandatory Rules

### Git Author (CRITICAL)
```bash
git config user.name "grootdev-ai"
git config user.email "dev@hellogroot.com"
```
**All commits must use this identity** - Vercel deployments require it.

**NEVER use `gh pr merge` to merge into main.** GitHub PR merges create a merge commit authored by the GitHub account that owns the token (e.g. `ooiyeefei`), NOT the local git config. This breaks Vercel deployments which require the `grootdev-ai` author. Instead:
1. Merge locally: `git merge --ff-only <branch>` (fast-forward, no merge commit)
2. Or cherry-pick: `git cherry-pick <commit>` then push directly to main
3. If a PR merge already happened with wrong author: cherry-pick the feature commit onto main and `git push --force-with-lease`

### Clerk Version Lock (CRITICAL)
- **Locked at exact `6.30.0`** — `package.json` uses `"@clerk/nextjs": "6.30.0"` (no caret)
- **DO NOT upgrade or add `^`** — v6.34.0+ breaks middleware `auth()` detection on public routes, causing infinite redirect loops between `/sign-in` and `/en/sign-in`
- **Root cause**: Clerk 6.34.0 requires middleware to call `auth()` on ALL routes (including public) for page-level `auth()` to work. Our middleware skips `auth()` on public routes and returns `NextResponse.next()` early
- **To upgrade**: See GitHub issue for migration plan — requires middleware changes + preview branch testing
- **If `npm install` resolves to a newer version**: Check `package-lock.json` diff before committing — a caret `^` would let npm auto-upgrade

### Build-Fix Loop
```bash
npm run build  # MUST pass before task completion
```
Fix errors and repeat until successful.

### Convex Deployment (CRITICAL)
- **Dev**: `npx convex dev` (auto-syncs)
- **Prod**: `npx convex deploy --yes` (manual after schema/function changes)
- **MANDATORY**: After ANY Convex-related change (schema, functions, queries, mutations, indexes), you MUST run `npx convex deploy --yes` before considering the task complete. This includes:
  - Adding/modifying tables or indexes in `convex/schema.ts`
  - Adding/modifying functions in `convex/functions/`
  - Changing query or mutation signatures
  - Adding new Convex modules
- **Common failure**: Forgetting to deploy to prod after Convex changes — causes "Could not find public function" errors in production

### Convex Bandwidth & Query Budget (CRITICAL)

**Free plan limits**: 2M function calls, **2 GB database bandwidth/month**, 1 GB storage. We are on the Free plan — every byte counts.

**Rule 1: Never use reactive `query` for heavy aggregations.**
- Convex `query` creates a reactive subscription. Every time ANY document in the queried tables changes, the query re-runs and re-reads ALL documents. Each re-read counts toward bandwidth.
- **Use `action` + `internalQuery`** for dashboard widgets, analytics, reports, or anything that scans multiple tables. The action runs once on demand; the client stores results in React state.
- Pattern: `internalQuery` does the DB reads → public `action` calls it via `ctx.runQuery` → client uses `useAction` + `useEffect` on mount.
- **Use `query`** only for small, single-document lookups or real-time data that genuinely needs live updates (e.g., a single expense claim status).

**Rule 2: Never `.collect()` entire tables without limits.**
- Always ask: "How many documents could this return at scale?" If the answer is "thousands", use `.take(N)` or add tighter index range filters.
- Prefer filtering at the index level (`.withIndex(..., q => q.eq(...).gte(...))`) over collecting everything and filtering in JS.

**Rule 3: Audit crons for bandwidth impact.**
- Every cron that reads data costs bandwidth. Hourly crons that scan multiple tables for all businesses are extremely expensive.
- Before adding a cron: calculate `(docs_read × avg_doc_size × runs_per_month)`. If it exceeds ~50 MB/month, reconsider the frequency or scope.
- **Currently disabled**: `ai-daily-digest` (was hourly, scanning multiple tables for all businesses). Re-enable only on Pro plan.

**Rule 4: Kill stray `convex dev` processes.**
- `npx convex dev` from worktrees auto-syncs to the shared deployment, consuming bandwidth and causing "Schema was overwritten" deploy conflicts.
- Before deploying: `ps aux | grep convex | grep -v grep` — kill any stray `convex dev` processes from other worktrees.

**Rule 5: NEVER run `convex dev` or `npm run dev` from worktrees.**
- All git worktrees (e.g., `einv-notif-cancel`, `doc-email-forward`) share the **same Convex production deployment** (`kindhearted-lynx-129`). Running `convex dev` from any worktree will **overwrite production functions** with that branch's older code, reverting fixes deployed from `main`.
- **What happens**: Worktree has old reactive `query` code → `convex dev` auto-deploys it → production functions revert → crashes and bandwidth burn return.
- **Only run `convex dev` from the main working directory** (`groot-finance/groot-finance`), and only when actively developing.
- **For worktree development**: Work on code without running `convex dev`. Test by rebasing onto `main` and deploying from `main`.
- **Before starting any dev session**: Run `ps aux | grep convex | grep -v grep` and kill ALL convex processes. Then run `npx convex deploy --yes` from `main` to ensure production has the latest code.
- **After finishing a worktree branch**: Remove it with `git worktree remove <name>` to prevent accidental future `convex dev` runs.

**Rule 6: EventBridge-first for scheduled jobs (CRITICAL).** ✅ IMPLEMENTED
- **For any scheduled job that reads >10 documents from Convex, use AWS EventBridge → Lambda → Convex HTTP API instead of Convex crons.**
- **Rationale**: Convex crons run inside Convex runtime, every table read counts toward 2GB/month bandwidth limit. EventBridge triggers Lambda outside Convex, Lambda makes one HTTP query to Convex, processes data locally (zero Convex bandwidth), writes back minimal result.
- **Pattern**: EventBridge schedule → Lambda (Node.js dispatcher) → Convex HTTP API → business logic in Convex action
- **Stack**: `infra/lib/scheduled-intelligence-stack.ts` (13 EventBridge rules, 1 Lambda dispatcher, SQS DLQ, CloudWatch alarms)
- **Migration complete**: 2026-03-20 (8 heavy crons migrated, 94% bandwidth reduction from ~446MB to ~25MB/month)
- **Migrated jobs**: proactive-analysis, ai-discovery, notification-digest, einvoice-monitoring, ai-daily-digest, DSPy optimizations (fee, bank-recon, PO-match, AR-match), chat-agent optimization, einvoice-dspy-digest, weekly-email-digest, scheduled-reports
- **Convex crons now ONLY for**: lightweight cleanup (delete expired records, mark overdue invoices) that touch <10 documents per run
- **See specs/030-eventbridge-migration/** for architecture, quickstart, and verification guide

**Anti-patterns that burn bandwidth:**
- `useQuery` with `.collect()` on large tables (reactive re-runs on every change)
- Crons running hourly/every-5-min that scan entire tables
- **Using Convex crons for DSPy optimization or analytics scanning** (use EventBridge → Lambda instead)
- Multiple worktrees running `convex dev` against the same deployment
- Dashboard widgets using reactive queries for aggregations (use `action` instead)
- Running `npm run dev` in old worktrees (auto-starts `convex dev` which overwrites production)

### Security — Least Privilege (CRITICAL)

**Applies to ALL layers**: application code, infrastructure, database, service-to-service auth.

**Principle**: Every component gets the minimum permissions needed — nothing more. This applies to:
- **IAM policies**: Scope actions to specific resource ARNs with conditions. Never use `*` resources or broad action wildcards.
- **Convex mutations**: Use `internalMutation` for backend-only operations. Only expose `mutation`/`query` when the frontend needs access.
- **API routes**: Authenticate every endpoint — Clerk auth for user-facing, internal service keys for backend-to-backend.
- **Secrets management**: Never store secrets in Convex (plain-text DB) or environment variables when a secure alternative exists. Use AWS SSM Parameter Store SecureString (free, encrypted at rest with KMS).
- **Service-to-service auth**: Prefer IAM-native access (Lambda → SSM, Lambda → S3) over exporting credentials. When crossing boundaries (Convex → AWS), use Vercel OIDC → IAM role assumption.
- **Database**: Don't return sensitive fields in queries. Filter out internal fields before sending to frontend.

**Anti-patterns to avoid**:
- Storing API secrets in Convex `businesses` table (use SSM SecureString instead)
- Convex actions reading AWS credentials from env vars (use Lambda with IAM role instead)
- Public mutations for backend-only operations (use `internalMutation`)
- Hardcoding secrets in code or CDK stacks (use SSM references or `.env.local`)

### AWS CDK & Infrastructure (CRITICAL)
```bash
cd infra
npx cdk deploy --profile groot-finanseal --region us-west-2
```
**Never make ad-hoc CLI changes** — all infrastructure via CDK. CDK is the single source of truth for all AWS resources.

**Add to existing stacks**: When adding/updating AWS resources, always add to an existing CDK stack in `infra/lib/`. Do not create new stacks unless the resource is logically independent and approved.

**AWS-first for AWS operations**: When a feature needs AWS services (SSM, S3, SES, LHDN API), put the logic in Lambda — not in Convex actions. Lambda has IAM-native access to AWS services (zero exported credentials). Convex should handle scheduling + real-time data layer only.

**Security — IAM authentication required on all resources**:
- **All Lambda functions** must be secured with IAM-based invocation. No public Function URLs, no unauthenticated API Gateway endpoints.
- **Vercel invocation**: Always use the existing OIDC role `arn:aws:iam::837224017779:role/FinanSEAL-Vercel-S3-Role`. Add `addPermission()` on the Lambda alias with this role as principal.
- **New IAM permissions**: If a feature requires new permissions on the Vercel OIDC role (e.g., invoking a new Lambda, accessing a new S3 bucket), do NOT modify the role directly. Instead, report back to the user with the exact policy statement needed so they can update the role manually.
- **Lambda execution role**: Use least-privilege — scope IAM actions to specific resource ARNs and add conditions where possible (e.g., `cloudwatch:namespace` condition for `PutMetricData`).

**MCP as Single Intelligence Engine (CRITICAL)**:
- **MCP is the single source of truth** for all financial intelligence AND all chat agent tools. Do NOT build parallel tool implementations in the LangGraph tool factory.
- **MCP-first tool development**: ALL new agent capabilities (bank recon trigger, scheduled reports, receipt OCR, PDF generation, etc.) MUST be built as MCP server endpoints first, then consumed by the chat agent via `convex/lib/mcp-client.ts`. This ensures Slack bots, API partners, and mobile apps can also use them. See issue #354 for migration plan.
- **Existing tool factory tools** are being migrated to MCP. Do NOT add new tools to `src/lib/ai/tools/tool-factory.ts` — add them to `finanseal-mcp-server` instead.
- **Layer 1 (hard-coded detection)** in Convex crons is for triggering — it runs fast, cheap statistical checks. But when Layer 2 (LLM enrichment/discovery) needs structured analysis, it MUST call MCP tools — not re-query the DB with separate logic.
- **Internal service-to-service calls** (Convex → MCP Lambda): Use the internal service key (`MCP_INTERNAL_SERVICE_KEY` stored in SSM + Convex env). Pass `X-Internal-Key` header and `_businessId` in params. No per-business API key needed.
- **App → AWS Lambda direct calls** (Next.js API routes, Vercel serverless → Lambda): Use IAM auth via the Vercel OIDC role (`FinanSEAL-Vercel-S3-Role`). Never hardcode credentials or use API keys when IAM-native access is available.
- **Convex → AWS services**: Convex actions cannot use AWS SDK/IAM natively. Use shared secrets stored in Convex env vars (set via `npx convex env set --prod`). For Lambda invocation, call via API Gateway HTTP endpoint with internal service key.
- **Any new analysis capability** (e.g., tax compliance checks, fraud detection) should be added as an MCP tool first, then consumed by both the chat agent and the Action Center cron pipeline.
- **MCP client helper**: `convex/lib/mcp-client.ts` — reusable `callMCPTool()` and `callMCPToolsBatch()` for Convex actions calling MCP.

**Cost optimization — free tier first**:
- Always prefer AWS free tier and cost-optimized options when architecting solutions, balanced with performance requirements.
- Examples: SSM Parameter Store SecureString (free) over Secrets Manager ($0.40/secret/month), CloudWatch Logs with retention limits, ARM_64 Lambda architecture (cheaper than x86_64).
- When multiple AWS services can solve a problem, choose the cheapest option that meets performance requirements and document the cost trade-off.
- Mark `@aws-sdk/*` as `externalModules` in Lambda bundling — use the runtime-provided SDK to reduce bundle size and cold start time.

### Current CDK Stacks & AWS Resources

All AWS infrastructure is defined in `infra/lib/`. Any new AWS resource MUST be added to an existing stack here.

| Stack | File | Resources |
|-------|------|-----------|
| **DocumentProcessing** | `document-processing-stack.ts` | `finanseal-document-processor` (Python Docker, 1024MB, x86_64), `finanseal-einvoice-form-fill` (Python Docker, 2048MB, x86_64), `finanseal-lhdn-polling` (Node.js 20, 256MB, ARM_64), `finanseal-dspy-optimizer` (Python Docker, 1024MB, x86_64, EventBridge every 3 days), `finanseal-einvoice-email-processor` (Node.js 20) |
| **ScheduledIntelligence** | `scheduled-intelligence-stack.ts` | `finanseal-scheduled-intelligence` (Node.js 20, 512MB, ARM_64, 5 min timeout), 13 EventBridge rules (proactive-analysis, ai-discovery, DSPy optimizations, digests), SQS DLQ (14-day retention), CloudWatch alarms (errors, DLQ depth), SNS alarm topic |
| **CDN** | `cdn-stack.ts` | CloudFront distribution (OAC → `finanseal-bucket`), signed URL key pair, SSM params for key-pair-id/domain |
| **SystemEmail** | `system-email-stack.ts` | `finanseal-welcome-workflow` (Node.js 22, Durable Function), SES domain identity (`notifications.hellogroot.com`), SES config set, SNS topics, CloudWatch alarms (bounce/complaint rates) |
| **MCPServer** | `mcp-server-stack.ts` | `finanseal-mcp-server` (Node.js 20, 512MB, ARM_64), API Gateway REST `/mcp` endpoint |
| **DigitalSignature** | `digital-signature-stack.ts` | `finanseal-digital-signature` (Node.js 20, 256MB, ARM_64), SSM params for cert/keys, cert expiry CloudWatch alarm + SNS |
| **APNs** | `apns-stack.ts` | SSM parameters for APNs push notification keys (P8 format) |
| **PublicAssets** | `public-assets-stack.ts` | `finanseal-public` S3 bucket (public read with referer check), Vercel OIDC upload permission |

**Shared resources** (referenced but not created by CDK):
- S3 bucket: `finanseal-bucket` (private documents — created outside CDK)
- Vercel OIDC role: `arn:aws:iam::837224017779:role/FinanSEAL-Vercel-S3-Role`
- Convex: `https://kindhearted-lynx-129.convex.cloud`

### No Screenshots or Binary Files in Git
- **Never commit** `.png`, `.jpg`, `.gif`, or other screenshot/image files to the repo
- UAT evidence, test screenshots, and debug images belong in external tools (e.g., GitHub issues, Notion), not in source control

### UAT Testing Credentials
- **Always refer to `.env.local`** for test account credentials
- Three roles available: `TEST_USER_ADMIN`, `TEST_USER_MANAGER`, `TEST_USER_EMPLOYEE` (each with `_PW` suffix for password)
- Production URL: `https://finance.hellogroot.com`

### Page Layout Pattern (MANDATORY)
- **All pages under `src/app/[locale]/`** must include `<Sidebar />` and `<HeaderWithUser />` — follow the pattern in `expense-claims/page.tsx`
- Pages must be **server components** (no `'use client'`) that wrap client content components
- Pattern: `export const dynamic = 'force-dynamic'` → `auth()` check → `<ClientProviders>` → `<Sidebar />` + `<HeaderWithUser>` + `<main>` → `<ClientComponent />`
- **Never create standalone client-only pages** that render without the app shell (sidebar + header)

### Prefer Modification Over Creation
- Do not create new files without approval
- Check if existing files can be modified first

## Code Style

### Design System
- **Use semantic tokens**: `bg-card`, `text-foreground`, `bg-primary`
- **Never hardcode colors**: No `bg-gray-700`, `text-white`
- **Layer hierarchy**: `bg-background` → `bg-surface` → `bg-card` → `bg-muted`
- **Check first**: `src/components/ui/`, `src/app/globals.css`

### Button Styling (MANDATORY)
- **Action buttons** (Save, Submit, Confirm, Create, Post, etc.): `bg-primary hover:bg-primary/90 text-primary-foreground` (blue bg, white text)
- **Destructive buttons** (Delete, Remove, Reverse, etc.): `bg-destructive hover:bg-destructive/90 text-destructive-foreground` (red bg, white text)
- **Cancel/Neutral buttons** (Cancel, Close, Draft, secondary actions): `bg-secondary hover:bg-secondary/80 text-secondary-foreground` (gray bg, white text)
- **Never use `variant="outline"` or `variant="ghost"` for visible action/cancel buttons** — only use ghost for small inline icon-only buttons (e.g., table row actions). All user-facing text buttons must use explicit bg classes above.
- Never use gray/secondary styling for action buttons

### Feature Info Drawer Pattern (MANDATORY)
Every new feature page/tab MUST include a "How It Works" info drawer:
- **Trigger**: Ghost `Info` icon button (ⓘ) in the page header or top-right area
- **Component**: `Sheet` from `@/components/ui/sheet` (slides from right)
- **Content structure**: Title → Description → Numbered steps (use `Step` component pattern) → Status badges/legend (if applicable) → Tips/Good to Know → Settings link
- **Reference implementations**:
  - Documents Inbox: `src/app/[locale]/documents-inbox/documents-inbox-client.tsx` → `HowItWorksDrawer`
  - AP Incoming Invoices: `src/domains/invoices/components/documents-container.tsx` → `EInvoiceHowItWorksDrawer`
- **Goal**: Every feature should be self-explanatory to a first-time user without external documentation

### Number Formatting
```typescript
import { formatNumber, formatCurrency } from '@/lib/utils/format-number'
formatCurrency(1234.56, 'USD')  // "$1,234.56"
```

### Date Handling
```typescript
import { formatBusinessDate } from '@/lib/utils'
formatBusinessDate('2025-10-31')  // "Oct 31, 2025" (no timezone shift)
```

### AI Model
**Gemini 3.1 Flash-Lite** (OpenAI-compatible endpoint):
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/openai` (hardcoded in ai-config.ts)
- Model ID: `gemini-3.1-flash-lite-preview`
- API Key: `GEMINI_API_KEY` (shared with DSPy features)
- Temperature: 0.3, Max tokens: 1000
- Tool calling: OpenAI-compatible function calling format
- Zero cold start (replaced Modal/Qwen which had 10-65s cold starts)
- Self-improving: DSPy modules train weekly, optimized prompts loaded at inference time
- Correction collection: `chat_agent_corrections` Convex table, corrections pooled globally

### Gemini Model Selection (MANDATORY)
- **CUA (Computer Use Agent)**: `gemini-2.5-computer-use-preview-10-2025` — only model available for browser automation
- **All other Gemini calls** (recon, verify, troubleshoot, DSPy, browser-use Tier 2B, Doc AI, classification): **Always use `gemini-3.1-flash-lite-preview`** — best price/performance ($0.25/$1.50 per M tokens). This is the **single standard model** across ALL DSPy features (AR matching, bank recon, fee classification, document processing, e-invoice).
- **Never use `gemini-2.0-flash`** or `gemini-3-flash-preview` — both are deprecated. `gemini-2.0-flash` shuts down June 1, 2026.
- **Model review cadence**: When Google releases new Gemini models, evaluate whether a newer Flash-Lite variant offers better cost/performance. Always prefer the latest Flash-Lite for non-CUA tasks. Check [ai.google.dev/gemini-api/docs/models](https://ai.google.dev/gemini-api/docs/models) for the latest model IDs and deprecation timelines.
- **Chat agent exception**: The chat assistant uses Qwen3-8B on Modal (not Gemini). All other AI features use Gemini.

### Documentation Update Rule (MANDATORY)
After making changes to any system (e-invoice, expense claims, chat, etc.), **always update the relevant CLAUDE.md docs** to reflect the latest architecture, flow, and decisions. Docs must stay in sync with code. Key docs:
- `src/domains/expense-claims/einvoice/CLAUDE.md` — E-invoice form fill architecture
- `src/domains/expense-claims/CLAUDE.md` — Expense claims module
- `CLAUDE.md` (root) — Project-wide rules and context

## Quick References

| Resource | Location |
|----------|----------|
| Full Documentation | `docs/README.md` |
| UI Components | `src/components/ui/CLAUDE.md` |
| API Reference | `src/app/api/v1/CLAUDE.md` |
| Expense Claims | `src/domains/expense-claims/CLAUDE.md` |
| LHDN E-Invoice | `src/domains/expense-claims/einvoice/CLAUDE.md` |
| App Patterns | `src/app/CLAUDE.md` |

## Accounting System Architecture (2026-03-14 Migration)

**CRITICAL:** The accounting system has been migrated to proper double-entry bookkeeping. Follow these rules:

### Current System (USE THIS)
- **Tables**: `journal_entries` (header) + `journal_entry_lines` (line items)
- **Structure**: Double-entry bookkeeping — every transaction has balanced debits and credits
- **Creation**: Use helper functions from `convex/lib/journal-entry-helpers.ts` + `journal-entries/createInternal.ts`
- **Querying**: Query `journal_entry_lines` with account code filters (e.g., `accountCode: "1200"` for AR)

**Helper Functions** (`convex/lib/journal-entry-helpers.ts`):
```typescript
// Expense claim: Debit expense account, Credit cash/payables
createExpenseJournalEntry({ amount, expenseAccountCode, description })

// Purchase invoice (AP): Debit expense/inventory, Credit AP
createInvoiceJournalEntry({ amount, expenseAccountCode, vendorId, description })

// Sales invoice (AR): Debit AR, Credit revenue
createSalesInvoiceJournalEntry({ amount, customerId, description })

// Payment: Debit/Credit cash + opposite for AR/AP
createPaymentJournalEntry({ amount, accountCode, isCashIn, description })
```

**Example: Create a journal entry**
```typescript
import { internal } from "./_generated/api";
import { createExpenseJournalEntry } from "./lib/journal-entry-helpers";

// In your mutation/action:
const lines = createExpenseJournalEntry({
  amount: 100.50,
  expenseAccountCode: "5100",
  description: "Office supplies"
});

await ctx.runMutation(internal.journal-entries.createInternal, {
  businessId,
  entryDate: "2026-03-14",
  description: "Office supplies purchase",
  referenceType: "expense_claim",
  referenceId: claimId,
  lines
});
```

**Example: Query journal entries**
```typescript
// Get AR balance (all debits to AR account)
const arLines = await ctx.db
  .query("journal_entry_lines")
  .withIndex("by_account_business", (q) =>
    q.eq("accountCode", "1200").eq("businessId", businessId)
  )
  .collect();

const arBalance = arLines.reduce((sum, line) =>
  sum + line.debitAmount - line.creditAmount, 0
);
```

### Deprecated System (DO NOT USE)
- `accounting_entries` table was dropped — use `journal_entries` + `journal_entry_lines` only
- Currency types moved to `src/lib/types/currency.ts`

### AP Subledger (Payment Tracking)
- **Invoices table** = AP subledger with `paidAmount`, `paymentStatus`, `dueDate`, `paymentHistory[]`
- **Payment recording**: `invoices.recordPayment` mutation creates double-entry journal entry (Debit AP 2100, Credit Cash 1000)
- **AP aging**: Queries `invoices` table directly (not accounting_entries)
- **AR aging**: Queries `sales_invoices` table directly (has its own payment system)

**When adding new accounting features:**
1. Always use `journal_entries` + `journal_entry_lines` for GL entries
2. Use helper functions for common patterns (expense, invoice, payment)
3. AP payment recording: Use `invoices.recordPayment` (creates journal entry + updates invoice)
4. AP queries: Query `invoices` table with `paymentStatus` and `accountingStatus` filters
5. AR queries: Query `sales_invoices` table directly
6. Never write to `accounting_entries` — all write mutations are deleted

---

## DSPy Self-Improvement System (2026-03-20 Activation)

**Overview**: Corrections from thumbs-down feedback train the AI agent weekly, creating a self-improving flywheel.

**Architecture**:
- **Flywheel**: Correction → training → quality gate → promotion → inference → better accuracy → fewer corrections
- **Readiness gate**: 20+ corrections, 10+ unique intents (lowered from 100 to enable faster iteration)
- **Train/validation split**: 80/20, stratified by intent category to ensure balanced representation
- **Optimization**: BootstrapFewShot (max_bootstrapped_demos=4, max_labeled_demos=8, max_rounds=3)
- **Quality gate**: Compare candidate accuracy vs previous on held-out eval set
- **Promotion**: candidate → promoted (active), previous → superseded
- **Schedule**: EventBridge weekly (Sunday 2am UTC)

**Key Files**:
- `convex/functions/chatOptimizationNew.ts` - Complete pipeline (readiness → split → train → gate → promote → consume)
- `src/lib/ai/dspy/model-version-loader.ts` - Load active model from S3 with 5min cache
- `src/lib/ai/dspy/types.ts` - ModelVersion, OptimizedPromptArtifact types
- `src/lambda/einvoice-form-fill-python/optimization/quality_gate.py` - Eval set evaluation

**Tables**:
- `dspy_model_versions` - Model lifecycle: candidate → promoted → superseded
- `chat_agent_corrections` - User corrections with consumed flag
- `dspy_optimization_logs` - Audit trail of training runs

**First Run**: Auto-passes quality gate (no eval set yet). Subsequent runs require candidate > previous accuracy.

---

## Mem0 Persistent Memory System (2026-03-20 Activation)

**Overview**: Long-term memory across sessions with semantic search, contradiction detection, and LRU eviction.

**Architecture**:
- **Storage**: Qdrant Cloud (vector embeddings) + Convex (metadata: accessCount, lastAccessedAt, topicTags)
- **Auto-recall**: Before generation, semantic search for top-5 relevant memories (0.7 cosine similarity threshold)
- **Auto-save**: Heuristic candidate detection after user messages (keywords: "always/never/prefer", amounts, dates, people)
- **Contradiction detection**: Topic-based classification (<10ms), 6 financial domain topics (currency, team roles, business facts, approval, payment, compliance)
- **LRU eviction**: 200-memory limit per user per business, oldest unused memory deleted
- **Confirmation UX**: Dark gray toast with Yes/No buttons (conflicts), 5s auto-dismiss toast (auto-save candidates)

**Tools** (registered in tool-factory.ts):
- `memory_store` - Explicit storage with contradiction detection
- `memory_search` - Semantic search (user-facing)
- `memory_recall` - Top-K recall (agent-facing, synonym for search)
- `memory_forget` - Soft delete (sets archivedAt)

**Key Files**:
- `src/lib/ai/agent/memory/mem0-service.ts` - Mem0 API wrapper with 0.7 threshold filter
- `src/lib/ai/agent/auto-recall.ts` - Semantic search before generation, context injection
- `src/lib/ai/agent/memory-candidate-detector.ts` - Heuristic detection (keywords, amounts, dates)
- `convex/functions/memoryTools.ts` - Contradiction detection, LRU eviction
- `src/domains/chat/components/memory-confirmation-toast.tsx` - Replace/Keep Both/Cancel UI
- `src/domains/chat/components/memory-auto-save-toast.tsx` - Yes/No confirmation UI

**Tables**:
- `mem0_memories` - Metadata (businessId, userId, content, embeddings, topicTags, accessCount, lastAccessedAt, archivedAt)

**Topic Classification**:
- currency_preference: ["currency", "sgd", "myr", "prefer", "always"]
- team_roles: ["handles", "responsible", "reports to", "manages", "approves"]
- business_facts: ["our company", "we use", "our process", "fiscal year"]
- approval_workflow: ["approval", "threshold", "requires", "must", "need"]
- payment_terms: ["payment", "terms", "net", "days", "due"]
- compliance_rules: ["must not", "prohibited", "required", "regulation", "compliance"]

**Performance**: <100ms auto-recall (cached), <10ms contradiction detection, <50ms memory storage

---

## Active Technologies
- **Core**: TypeScript 5.9.3, Next.js 15.5.7, Convex 1.31.3, React 19.1.2, Clerk 6.30.0, Zod 3.23.8
- **AI**: Gemini 3.1 Flash-Lite (chat + all AI), DSPy 2.6+ (self-improving modules), LangGraph 0.4.5
- **Infrastructure**: AWS Lambda (Node.js 20 / Python 3.11), CDK v2, S3, CloudFront, SES, SSM
- **Frontend**: Radix UI, Tailwind CSS, Recharts, lucide-react, @react-pdf/renderer, sonner
- **Other**: Stripe SDK 20.1.0, papaparse, xlsx/SheetJS, Capacitor (iOS), Qdrant Cloud (RAG), Mem0
- TypeScript 5.9.3, Next.js 15.5.7 + LangGraph 0.4.5, Convex 1.31.3, Qwen3-8B (Modal), Zod 3.23.8 (026-agent-rbac-hardening)
- Convex (tables: invoices, sales_invoices, journal_entry_lines, business_memberships, users) (026-agent-rbac-hardening)
- TypeScript 5.9.3 (Next.js 15.5.7 + LangGraph 0.4.5) + Python 3.11 (Lambda DSPy) + @langchain/langgraph, @langchain/core, dspy>=2.6.0 (Python), Convex 1.31.3 (027-gemini-dspy-chat-agent)
- Convex (corrections, model versions), S3 finanseal-bucket (model artifacts) (027-gemini-dspy-chat-agent)
- TypeScript 5.9.3 (frontend + Convex), Python 3.11 (Lambda instrumentation) + Next.js 15.5.7, Convex 1.31.3, Recharts (existing), Radix UI (existing) (027-dspy-dash)
- Convex (`dspy_metrics_daily` aggregate table + existing correction tables) (027-dspy-dash)
- TypeScript 5.9.3 (Node.js 20), Python 3.11 (DSPy optimizer, already exists) (030-eventbridge-migration)
- TypeScript 5.9.3 + Next.js 15.5.7, Convex 1.31.3, LangGraph 0.4.5 (031-multi-curr-history-analysis)
- Convex (journal_entries, journal_entry_lines, manual_exchange_rates) (031-multi-curr-history-analysis)
- TypeScript 5.9.3 (Next.js 15.5.7 + Convex 1.31.3) + Convex (DB + real-time), LangGraph (chat agent), SES (email), APNs (push) (031-action-center-push-chat)
- Convex tables (messages, conversations, proactive_alert_delivery) (031-action-center-push-chat)
- TypeScript 5.9.3 (Next.js 15.5.7 + Convex 1.31.3) + LangGraph 0.4.5, Zod 3.23.8, Recharts, Radix UI, Tailwind CSS (031-budget-track-manager-team)
- Convex (businesses table for budget config, actionCenterInsights for alerts, expense_submissions for spending data) (031-budget-track-manager-team)
- TypeScript 5.9.3 (Node.js 20 for Lambda) + PDFKit (new — PDF generation in Lambda), existing: Convex, Qdrant, AWS S3 (031-cfo-copilot-tools)
- S3 `finanseal-bucket` (PDF storage), Qdrant Cloud (tax KB embeddings), Convex (transaction data) (031-cfo-copilot-tools)
- TypeScript 5.9.3, Next.js 15.5.7, React 19.1.2 + Convex 1.31.3, LangGraph 0.4.5, @aws-sdk/client-s3, @aws-sdk/client-lambda (031-chat-receipt-process)
- S3 (finanseal-bucket, `chat-attachments/` prefix), Convex (messages, expense_claims tables) (031-chat-receipt-process)
- TypeScript 5.9.3 (Next.js 15.5.7, Convex 1.31.3), Node.js 20 (Lambda) + Convex, LangGraph 0.4.5, @react-pdf/renderer, AWS SES, MCP client (031-chat-sched-report-bank-recon)
- Convex (report_schedules, report_runs, bank_recon_runs tables) (031-chat-sched-report-bank-recon)


## Recent Changes
- 026-agent-rbac-hardening: Added TypeScript 5.9.3, Next.js 15.5.7 + LangGraph 0.4.5, Convex 1.31.3, Qwen3-8B (Modal), Zod 3.23.8
