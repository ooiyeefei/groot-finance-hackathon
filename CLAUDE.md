# Rules

1. First think through the problem, read the codebase for relevant files, and write a plan to tasks/todo.md.
2. The plan should have a list of todo items that you can check off as you complete them.
3. Before you begin working, check in with me and I will verify the plan.
4. Then, begin working on the todo items, marking them as complete as you go.
5. Please every step of the way just give me a high level explanation of what changes you made.
6. Make every task and code change you do as simple as possible. We want to avoid making any massive or complex changes. Every change should impact as little code as possible. Everything is about simplicity.
7. Finally, add a review section to the todo.md file with a summary of the changes you made and any other relevant information.

## Project Overview

FinanSEAL is a multimodal financial co-pilot web application designed for Southeast Asian SMEs. It's a Next.js-based platform that integrates AI models for intelligent document processing and conversational financial guidance.

## Architecture

- **Frontend**: Next.js 15.4.6 with App Router, TypeScript, Tailwind CSS
- **Backend**: Next.js API routes with serverless functions (API v1 versioned)
- **Database**: Convex (real-time, reactive database)
- **File Storage**: AWS S3 (finanseal-bucket)
- **Authentication**: Clerk for user management
- **Vector Database**: Qdrant Cloud for embedding storage
- **Background Jobs**: AWS Lambda with Python 3.11 and DSPy
- **Document Processing**: PDF-to-image conversion with Gemini AI extraction
- **Currency APIs**: Real-time exchange rate conversion with caching

### Domain-Driven Architecture

```
src/domains/
├── account-management/     # Multi-tenancy, business management, team invitations
├── analytics/              # Financial dashboards, real-time metrics, forecasting
├── applications/           # Business application workflows, document processing
├── audit/                  # System audit logs, compliance tracking
├── chat/                   # AI assistant, conversation management, citations
├── expense-claims/         # Employee expense submission, manager approval workflows
├── invoices/              # Document processing, OCR extraction, transaction creation
├── system/                # System configuration, knowledge base, webhooks
├── tasks/                 # Background job monitoring, task status tracking
├── users/                 # User profiles, team management, role assignment
└── utilities/             # Shared utilities, currency conversion, translation
```

**Domain Principles:**
- **Self-contained**: Each domain manages its own components, hooks, services
- **API Isolation**: Domain-specific API routes under `/api/v1/{domain}/`
- **Shared Dependencies**: Common utilities in `/src/lib/` for cross-domain needs
- **Type Safety**: Domain-specific types and interfaces

## Key Features

1. **Multi-Modal Document Processing**: Upload invoices/receipts (PDF/images) and extract structured financial data
2. **Transaction Management**: Create transactions from OCR data with line items, categorization, and multi-currency support
3. **Document-Transaction Linking**: Track which documents generated which transactions to prevent duplicates
4. **Interactive Document Annotations**: Visual bounding boxes showing OCR extraction areas
5. **Cross-Border Cash Flow**: Multi-currency transaction tracking with real-time conversion

## External Services

- **Convex**: Real-time database with automatic sync
- **AWS S3**: Document storage (finanseal-bucket)
- **AWS Lambda**: Document processing with Python 3.11 + DSPy + Gemini
- **Clerk**: Authentication and user session management
- **Qdrant Cloud**: Vector embeddings for semantic search
- **Exchange Rate APIs**: Real-time currency conversion

## AI Model Usage (Gemini 3 Flash)

**CRITICAL: Always use Gemini 3 Flash Preview for all document processing and AI extraction tasks.**

### Model IDs

| Context | Model ID | Notes |
|---------|----------|-------|
| **Python (DSPy)** | `gemini/gemini-3-flash-preview` | Used in Lambda document processing |
| **TypeScript (Direct API)** | `gemini-3-flash-preview` | Used in gemini-ocr-service.ts |

### Why Gemini 3 Flash?
- **67% faster inference** compared to previous Gemini models
- **Better multimodal understanding** for receipt/invoice extraction
- **Cost-effective** for high-volume document processing

### Key Files Using Gemini 3

**Lambda Python (Production Document Processing):**
- `src/lambda/document-processor-python/steps/extract_invoice.py` - Invoice extraction
- `src/lambda/document-processor-python/steps/extract_receipt.py` - Receipt extraction
- `src/lambda/document-processor-python/steps/validate.py` - Document validation

**TypeScript Services:**
- `src/lib/services/gemini-ocr-service.ts` - Direct Gemini API integration
- `src/lib/ai/config/ai-config.ts` - AI configuration constants

### Model Configuration Examples

**Python (DSPy):**
```python
import dspy

lm = dspy.LM(model="gemini/gemini-3-flash-preview", api_key=api_key)
dspy.configure(lm=lm)
```

**TypeScript:**
```typescript
this.config = {
  model: 'gemini-3-flash-preview',
  timeoutMs: 60000,
  temperature: 0.1,
  // ...
}
```

### Important Notes
- **Never downgrade** to older Gemini models (e.g., gemini-1.5-flash-latest)
- **Environment variable**: `GEMINI_API_KEY` must be set in all environments
- **Timeout**: Use 60+ seconds for complex documents
- **Temperature**: Use 0.1 for consistent extraction results

## AWS Lambda Document Processing

### Architecture
```
Vercel API → AWS OIDC Auth → Lambda Function (Python 3.11)
                                    │
                                    ├── Step 1: convert-pdf (Poppler in Layer)
                                    ├── Step 2: validate-document (Gemini)
                                    ├── Step 3: extract-data (DSPy + Gemini)
                                    └── Step 4: update-convex (HTTP API)
```

### Key Files
- `src/lambda/document-processor-python/`: Python Lambda handler and step implementations
- `infra/`: AWS CDK infrastructure (Lambda, Layer, IAM, CloudWatch)
- `src/lambda/layers/python-document-processor/`: Docker-based Python Layer

### Lambda Resources
- **Function ARN**: `arn:aws:lambda:us-west-2:837224017779:function:finanseal-document-processor`
- **Memory**: 1024 MB | **Timeout**: 15 minutes | **Runtime**: Python 3.11

### Environment Variables
| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_CONVEX_URL` | Convex deployment URL |
| `GEMINI_API_KEY` | Google Gemini API key for DSPy |
| `S3_BUCKET_NAME` | S3 bucket (finanseal-bucket) |
| `SENTRY_DSN` | Sentry error tracking |

### Invocation Pattern
- **API Routes**: Use `@aws-sdk/client-lambda` with OIDC authentication
- **Auth**: Vercel OIDC provider → AWS IAM Role assumption
- **Response**: Fire-and-forget async invocation (202 Accepted)

## Development Guidelines

### Core Workflow Rules

1. **Rule: Prefer Modification Over Creation**
   - Do not create new files unless necessary. Get approval first.
   - Before creating a new file, analyze the current file tree to see if an existing file can be modified.

2. **Rule: The "Build-Fix Loop" is Mandatory**
   - After applying code changes, ALWAYS run `npm run build`.
   - If the build fails, fix the error and repeat until successful.
   - Only report task complete AFTER the build succeeds.

3. **Rule: Embrace Parallel Execution**
   - Run independent tasks in parallel whenever possible.

4. **Rule: Git Author for Deployments**
   - **ALWAYS set git author before any push**:
     ```bash
     git config user.name "grootdev-ai"
     git config user.email "dev@hellogroot.com"
     ```
   - Vercel requires the git author to have project access.

5. **Rule: AWS CDK as Single Source of Truth**
   - **NEVER make ad-hoc CLI changes** to AWS resources.
   - **ALWAYS update the CDK stack** in `infra/` for any infrastructure changes.
   - Deploy via CDK only:
     ```bash
     cd infra
     npx cdk deploy --profile groot-finanseal --region us-west-2
     ```
   - This ensures reproducible, version-controlled infrastructure.

6. **Rule: Always Push to GitHub**
   - All changes must be committed and pushed to GitHub.
   - Use git author `grootdev-ai <dev@hellogroot.com>` for all commits.

7. **Rule: Convex Deployment (CRITICAL)**
   - **Two environments exist**: Dev (`harmless-panther-50`) and Prod (`kindhearted-lynx-129`)
   - **Local `npx convex dev`** syncs to dev environment ONLY
   - **Production deployment** happens automatically during Vercel build via `convex:deploy:ci`
   - **Manual prod deploy**: Run `npx convex deploy --yes` after ANY Convex schema/function changes
   - **ALWAYS verify prod is synced** before testing in production:
     ```bash
     npx convex deploy --yes
     ```
   - Common failure: Changing `convex/` files locally, pushing to GitHub, but forgetting to deploy to Convex prod

### Design System Rules

FinanSEAL implements a **Layer 1-2-3 Semantic Design System** for consistent theming.

- **Rule: Always Check Existing Components First**
  1. Check `src/components/ui/` - UI component library
  2. Check `src/app/globals.css` - Available semantic tokens
  3. Check `tailwind.config.js` - Custom utilities
  4. Search domain components in `src/domains/*/components/`

- **Rule: Mandatory Semantic Token Usage**
  - **NEVER use hardcoded colors**: No `bg-gray-700`, `text-white`, etc.
  - **ALWAYS use semantic tokens**: `bg-card`, `text-foreground`, `bg-primary`, etc.
  - **Follow Layer Hierarchy**: `bg-background` → `bg-surface` → `bg-card` → `bg-muted`

- **Rule: Component Integration Pattern**
  - Import from UI library: `import { Button, Card, Badge } from '@/components/ui'`
  - Use CVA variants: Prefer `<Button variant="default">` over custom styling
  - Test both light and dark mode rendering

**Quick Reference:**
- Component docs: `src/components/ui/CLAUDE.md`
- App patterns: `src/app/CLAUDE.md`
- Semantic tokens: `src/app/globals.css`

### Number Formatting Rules

**Rule: Always Format Large Numbers with Comma Separators**

All financial amounts and large numbers displayed in the UI must use comma separators for readability:
- `101596428` → `101,596,428`
- `1234.56` → `1,234.56`

**Implementation:**
- Use `formatNumber()` utility from `@/lib/utils/format-number` for all numeric displays
- Apply to: invoices, expense claims, accounting records, analytics dashboards
- Preserve decimal places as needed (e.g., currency amounts: 2 decimals)

**Usage:**
```typescript
import { formatNumber, formatCurrency } from '@/lib/utils/format-number'

// Basic number formatting
formatNumber(101596428)  // "101,596,428"

// Currency formatting
formatCurrency(1234.56, 'USD')  // "$1,234.56"
formatCurrency(1234.56, 'THB')  // "฿1,234.56"
```

### Document Processing Workflow

1. **File Upload**: Client uploads PDF/images → AWS S3
2. **API Trigger**: Client calls `/api/documents/[documentId]/process`
3. **Non-blocking Response**: API returns 202 Accepted immediately
4. **Lambda Processing**: AWS Lambda processes document with Gemini AI
5. **Database Update**: Lambda updates Convex via HTTP API

### Currency Handling
- Store original currency/amount alongside home currency conversion
- Support for 9 currencies: THB, IDR, MYR, SGD, USD, EUR, CNY, VND, PHP
- Historical rate preservation for audit trails

### Expense Claims Workflow

**Key Principle**: Only **approved** expense claims create accounting entries.

```
1. User uploads receipt → Stored in S3
2. Lambda extraction runs → Stores metadata in Convex
3. Manager approves → Creates accounting entry
4. Finance reimburses → Updates entry status to 'paid'
```

**State Machine:**
```
draft → submitted → approved → reimbursed
                  ↓
             rejected
```

### AI Agent System

- **Agent Engine**: LangGraph-based conversational AI for financial queries
- **Security-First**: Mandatory user context validation
- **Tool Integration**: Dynamic OpenAI function calling
- **Multi-language**: English, Thai, Indonesian support

**Key Files:**
- `src/lib/langgraph-agent.ts`: Main agent implementation
- `src/app/api/chat/route.ts`: Chat API endpoint
- `src/lib/tools/`: Self-describing tool system

### Build Requirements
- Mandatory `npm run build` validation before completion
- TypeScript strict mode with comprehensive error checking
- Component reusability and existing pattern following

## AWS Deployment Commands

```bash
# CDK deployment (always use this for infrastructure changes)
cd infra
npx cdk deploy --profile groot-finanseal --region us-west-2

# Git commits (always use this author)
git config user.name "grootdev-ai"
git config user.email "dev@hellogroot.com"
```
