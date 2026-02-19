# Coding Rules & Guidelines

Instructions for AI coding agents working on FinanSEAL.

## Workflow Rules

1. **Plan First**: Think through the problem, read relevant files, write plan to `tasks/todo.md`
2. **Get Approval**: Check in before implementing
3. **Track Progress**: Mark todo items complete as you go
4. **Explain Changes**: Give high-level explanation of each change
5. **Keep It Simple**: Minimal changes, avoid complexity
6. **Document Results**: Add review section to `tasks/todo.md` when done

## Project Context

**FinanSEAL**: Financial co-pilot for Southeast Asian SMEs
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
```

## Mandatory Rules

### Git Author (CRITICAL)
```bash
git config user.name "grootdev-ai"
git config user.email "dev@hellogroot.com"
```
**All commits must use this identity** - Vercel deployments require it.

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

### AWS CDK
```bash
cd infra
npx cdk deploy --profile groot-finanseal --region us-west-2
```
**Never make ad-hoc CLI changes** - all infrastructure via CDK.

### No Screenshots or Binary Files in Git
- **Never commit** `.png`, `.jpg`, `.gif`, or other screenshot/image files to the repo
- UAT evidence, test screenshots, and debug images belong in external tools (e.g., GitHub issues, Notion), not in source control

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
- **Action buttons** (Save, Submit, Confirm, etc.): `bg-primary hover:bg-primary/90 text-primary-foreground` (blue bg, white text)
- **Destructive buttons** (Delete, Remove, etc.): `bg-destructive hover:bg-destructive/90 text-destructive-foreground` (red bg, white text)
- **Cancel buttons**: `bg-secondary hover:bg-secondary/80 text-secondary-foreground` (gray bg, white text)
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

## Quick References

| Resource | Location |
|----------|----------|
| Full Documentation | `docs/README.md` |
| UI Components | `src/components/ui/CLAUDE.md` |
| API Reference | `src/app/api/v1/CLAUDE.md` |
| Expense Claims | `src/domains/expense-claims/CLAUDE.md` |
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

## Recent Changes
- 001-category-3-mcp: Added MCP Server with API key management
- 001-manager-approval: Added TypeScript 5.9.3, Next.js 15.5.7 + Convex 1.31.3, React 19.1.2, Clerk 6.30.0, Zod 3.23.8
