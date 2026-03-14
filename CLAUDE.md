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

**Groot Finance**: Financial co-pilot for Southeast Asian SMEs
**Stack**: Next.js 15.4.6 + Convex + AWS Lambda + Qwen3 (Modal)
**Docs**: See `docs/README.md` for full documentation

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
- **MCP is the single source of truth** for all financial intelligence (anomaly detection, cash flow forecasting, vendor risk analysis). Do NOT duplicate MCP tool logic in Convex queries or other services.
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
| **DocumentProcessing** | `document-processing-stack.ts` | `finanseal-document-processor` (Python Docker, 1024MB, x86_64), `finanseal-einvoice-form-fill` (Node.js 20, 512MB, ARM_64), `finanseal-lhdn-polling` (Node.js 20, 256MB, ARM_64) |
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
**Qwen3-8B on Modal** (OpenAI-compatible endpoint):
- Endpoint: `CHAT_MODEL_ENDPOINT_URL` (Modal serverless)
- Model ID: `CHAT_MODEL_MODEL_ID` (e.g. `qwen3-8b`)
- Temperature: 0.3, Timeout: 60s+
- Tool calling: OpenAI-compatible function calling format

### Gemini Model Selection (MANDATORY)
- **CUA (Computer Use Agent)**: `gemini-2.5-computer-use-preview-10-2025` — only model available for browser automation
- **All other Gemini calls** (recon, verify, troubleshoot, DSPy, browser-use Tier 2B): **Always use `gemini-3.1-flash-lite-preview`** — best price/performance for vision tasks ($0.25/$1.50 per M tokens)
- **Never use `gemini-2.0-flash`** for new code — it's deprecated in our codebase in favor of 3.1 Flash-Lite

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

## Active Technologies
- TypeScript 5.9.3, Next.js 15.5.7 + Convex 1.31.3, React 19.1.2, Clerk 6.30.0, Zod 3.23.8
- Convex (document database with real-time sync)
- TypeScript 5.3+ / Node.js 20.x (Lambda runtime for MCP Server)
- TypeScript 5.9.3, Node.js 20.x + Next.js 15.5.7, React 19.1.2, Convex 1.31.3, Clerk 6.30.0, React Query 5.90.7, Zod 3.23.8 (001-leave-management)
- Convex (real-time document database with subscriptions) (001-leave-management)
- TypeScript 5.9.3, Node.js 20.x + Next.js 15.5.7, Convex 1.31.3, React 19.1.2, React Query 5.90.7, Zod 3.23.8, Clerk 6.30.0 (002-csv-template-builder)
- Convex (document database with real-time subscriptions), Convex File Storage for CSV files (002-csv-template-builder)
- TypeScript 5.9.3, Node.js 20.x + Next.js 15.5.7, Convex 1.31.3, LangGraph/LangChain, Zod 3.23.8, AWS CDK (008-manager-agent-queries)
- TypeScript 5.9.3, Node.js 20.x + Next.js 15.5.7, Convex 1.31.3, React 19.1.2, Clerk 6.30.0, TanStack Query 5.90.7, Zod 3.23.8 (009-batch-receipt-submission)
- Convex (document database with real-time sync), AWS S3 (file storage), CloudFront (signed URL delivery) (009-batch-receipt-submission)
- TypeScript 5.9.3, Node.js 20.x + Next.js 15.5.7, Convex 1.31.3, React 19.1.2, Clerk 6.30.0, Zod 3.23.8, React Query 5.90.7 (009-sales-invoice-generation)
- Convex (document database with real-time subscriptions), Convex File Storage (logo uploads) (009-sales-invoice-generation)
- TypeScript 5.9.3, Node.js 20.x + Next.js 15.5.7, Convex 1.31.3, React 19.1.2, Radix UI Tabs, html2pdf.js, lucide-reac (010-ar-debtor-management)
- TypeScript 5.9.3, Node.js 20.x + Next.js 15.5.7, React 19.1.2, Convex 1.31.3, @react-pdf/renderer, Clerk 6.30.0, Zod 3.23.8, Tailwind CSS, Radix UI (012-stripe-invoice-ux)
- Convex (document database with real-time subscriptions), Convex File Storage (PDF uploads) (012-stripe-invoice-ux)
- TypeScript 5.9.3 / Node.js 20.x + Next.js 15.5.7, @langchain/langgraph 0.4.5, Convex 1.31.3, Clerk 6.30.0, SSE streaming (010-copilotkit-migration)
- Convex (conversations, messages), Qdrant Cloud (RAG embeddings), Mem0 (conversation memory) (010-copilotkit-migration)
- TypeScript 5.9.3 / Node.js 20.x + Next.js 15.5.7, @langchain/langgraph 0.4.5, Convex 1.31.3, React 19.1.2, Clerk 6.30.0 (011-chat-streaming-actions)
- Convex (conversations, messages with metadata), Qdrant Cloud (RAG), Mem0 (memory) (011-chat-streaming-actions)
- TypeScript 5.9.3, Node.js 20.x + Next.js 15.5.7, Convex 1.31.3, Stripe SDK 20.1.0 (already installed), React 19.1.2, Clerk 6.30.0 (014-stripe-catalog-sync)
- TypeScript 5.9.3 / Node.js 20.x + Next.js 15.5.7, Convex 1.31.3, React 19.1.2, Clerk 6.30.0, Zod 3.23.8, TanStack Query 5.90.7 (013-ap-vendor-management)
- TypeScript 5.9.3 + Next.js 15.5.7, React 19.1.2, Convex 1.31.3 (013-chat-action-cards)
- Convex (existing tables: invoices, accounting_entries, conversations, messages) (013-chat-action-cards)
- TypeScript 5.9.3 / Node.js 20.x + Next.js 15.5.7, React 19.1.2, Convex 1.31.3, Radix UI Tabs, Clerk 6.30.0, lucide-react (015-ar-ap-tab-restructure)
- TypeScript 5.9.3, Node.js 20.x + Next.js 15.5.7, Convex 1.31.3, Stripe SDK 20.1.0, Clerk 6.30.0 (001-usage-tracking)
- TypeScript 5.9.3 + Next.js 15.5.7, Convex 1.31.3, React 19.1.2, Zod 3.23.8 (016-e-invoice-schema-change)
- TypeScript 5.9.3, Node.js 20.x + Next.js 15.5.7, React 19.1.2, Convex 1.31.3, lucide-react (icons) (001-peppol-submission-ui)
- Convex (document database with real-time subscriptions) — schema already deployed (001-peppol-submission-ui)
- TypeScript 5.9.3 + Next.js 15.5.7, React 19.1.2, Convex 1.31.3, Radix UI, Zod 3.23.8 (e-inv-ui-forms)
- TypeScript 5.9.3, Node.js 20.x (Lambda runtime) + `node:crypto` (built-in), `@aws-sdk/client-ssm`, `aws-cdk-lib` (CDK v2.175.0) (001-digital-signature-infra)
- AWS SSM Parameter Store SecureString (free standard tier) for private key and certificate (001-digital-signature-infra)
- TypeScript 5.9.3, Node.js 20.x + Next.js 15.5.7, Convex 1.31.3, React 19.1.2, Clerk 6.30.0, AWS SES, lucide-react (icons), Radix UI (Sheet, Badge) (018-app-email-notif)
- Convex (new `notifications` + `notification_digests` tables), AWS SES (email delivery) (018-app-email-notif)
- TypeScript 5.9.3 + Next.js 15.5.7, Convex 1.31.3, React 19.1.2, Clerk 6.30.0, Zod 3.23.8 (018-timesheet-attendance)
- TypeScript 5.9.3, Node.js 20.x + Next.js 15.5.7, Convex 1.31.3, React 19.1.2, Clerk 6.30.0, Zod 3.23.8, lucide-react (001-accounting-records-export)
- Convex (document database with real-time sync), Convex File Storage (export file storage) (001-accounting-records-export)
- TypeScript 5.9.3 (web app), Swift (Capacitor iOS shell — auto-generated) + @capacitor/core, @capacitor/ios, @capacitor/camera, @capacitor/push-notifications, @capacitor/app, @capacitor/browser, @capacitor/status-bar, @capacitor/splash-screen, @sentry/capacitor@^2.4.1 (001-capacitor-mobile-app)
- Convex (existing, no new tables except `push_subscriptions` and `app_versions`), AWS SSM Parameter Store (APNs key) (001-capacitor-mobile-app)
- TypeScript 5.9.3 + Next.js 15.5.7, Convex 1.31.3, Stripe SDK, Clerk 6.30.0, React 19.1.2 (019-country-pricing-lock)
- Convex (document database with real-time sync), Stripe (billing source of truth) (019-country-pricing-lock)
- TypeScript 5.9.3 / Node.js 20.x + Next.js 15.5.7, Convex 1.31.3, AWS SDK (Lambda invocation), Clerk 6.30.0, Zod 3.23.8, qrcode (npm) (001-lhdn-einvoice-submission)
- Convex (document database), AWS SSM Parameter Store (credentials) (001-lhdn-einvoice-submission)
- TypeScript 5.9.3 (Next.js + Convex), Python 3.11 (Lambda) + Next.js 15.5.7, Convex 1.31.3, @browserbasehq/stagehand, pyzbar (Python), AWS SES (019-lhdn-einv-flow-2)
- Convex (document database), AWS S3 (file storage), SES S3 (email storage) (019-lhdn-einv-flow-2)
- Convex (new `export_code_mappings` table), Convex File Storage (export files) (001-master-accounting-export)
- TypeScript 5.9.3, Node.js 20.x + Convex 1.31.3 (crons, internalMutation, storage API) (001-pdpa-data-retention-cleanup)
- Convex document database (existing tables), Convex File Storage (export files) (001-pdpa-data-retention-cleanup)
- Markdown (GitHub-flavored) — no code to compile or deploy + None — pure documentation deliverable (001-pdpa-sec-measures-doc)
- Git repository at `docs/compliance/security-measures.md` (001-pdpa-sec-measures-doc)
- TypeScript 5.9.3 + Next.js 15.5.7, Convex 1.31.3, React 19.1.2, Clerk 6.30.0, Radix UI, lucide-react (001-pdpa-consent-collect)
- Convex (new `consent_records` table, real-time subscriptions) (001-pdpa-consent-collect)
- TypeScript 5.9.3 / Node.js 20.x + Next.js 15.5.7, Convex 1.31.3, Clerk 6.30.0, React 19.1.2, JSZip (new — for client-side ZIP generation) (001-pdpa-data-rights)
- Markdown (documentation deliverable) + None (documentation only; references existing infrastructure) (001-pdpa-breach-notif-sop)
- Git repository (`grootdev-ai/groot-finance`) (001-pdpa-breach-notif-sop)
- TypeScript 5.9.3, Node.js 20.x + Next.js 15.5.7, Convex 1.31.3, Clerk 6.30.0, Stripe SDK 20.1.0, React 19.1.2 (001-account-deletion)
- Convex (existing `referral_codes` and `referrals` tables — no schema changes) (001-reseller-code-system)
- TypeScript 5.9.3, Node.js 20.x + Next.js 15.5.7, React 19.1.2, Convex 1.31.3, papaparse (CSV), xlsx/SheetJS (Excel), Clerk 6.30.0 (001-csv-parser)
- Convex (csv_import_templates table). No file storage — files parsed in browser memory. (001-csv-parser)
- Convex (new `sales_orders` table, real-time subscriptions) (001-ar-reconciliation)
- TypeScript 5.9.3, Node.js 20.x + Next.js 15.5.7, React 19.1.2, Convex 1.31.3, Clerk 6.30.0, lucide-react, Radix UI (021-ap-3-way)
- TypeScript 5.9.3 / Node.js 20.x + Next.js 15.5.7, Convex 1.31.3, React 19.1.2, Clerk 6.30.0, Radix UI Tabs, TanStack Query 5.90.7, Zod 3.23.8 (021-bank-statement-import-recon)
- Convex (new `bank_accounts`, `bank_transactions`, `bank_import_sessions`, `reconciliation_matches` tables) (021-bank-statement-import-recon)
- TypeScript 5.9.3 / Node.js 20.x + Next.js 15.5.7, React 19.1.2 + Convex 1.31.3 (real-time database), React Query 5.90.7, Zod 3.23.8, Clerk 6.30.0 (auth), Radix UI (components), lucide-react (icons) (001-accounting-double-entry)
- Convex document database with real-time subscriptions. New tables: `chart_of_accounts`, `journal_entries`, `journal_entry_lines`, `accounting_periods`, `manual_exchange_rates`. Migration from existing `accounting_entries` table (001-accounting-double-entry)
- TypeScript 5.9.3 + Convex 1.31.3, Next.js 15.5.7, React 19.1.2, Qwen3-8B (Modal) (001-improve-action-center)
- Convex document database (actionCenterInsights table, accounting_entries, vendors, expense_claims, business_expense_categories) (001-improve-action-center)

## Recent Changes
- 001-category-3-mcp: Added MCP Server with API key management
- 001-manager-approval: Added TypeScript 5.9.3, Next.js 15.5.7 + Convex 1.31.3, React 19.1.2, Clerk 6.30.0, Zod 3.23.8
