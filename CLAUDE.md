# Rules
1. First think through the problem, read the codebase for relevant files, and write a plan to tasks/todo.md.
2. The plan should have a list of todo items that you can check off as you complete them
3. Before you begin working, check in with me and I will verify the plan.
4. Then, begin working on the todo items, marking them as complete as you go.
5. Please every step of the way just give me a high level explanation of what changes you made
6. Make every task and code change you do as simple as possible. We want to avoid making any massive or complex changes. Every change should impact as little code as possible. Everything is about simplicity.
7. Finally, add a review section to the [todo.md](http://todo.md/) file with a summary of the changes you made and any other relevant information.
8. Database is Convex (real-time). File storage is AWS S3 (finanseal-bucket). AWS profile is `groot-finanseal`, region `us-west-2`.

## Project Overview

FinanSEAL is a multimodal financial co-pilot web application designed for Southeast Asian SMEs. It's a Next.js-based platform that integrates AI models for intelligent document processing and conversational financial guidance.

## Architecture

- **Frontend**: Next.js 15.4.6 with App Router, TypeScript, Tailwind CSS
- **Backend**: Next.js API routes with serverless functions (API v1 versioned)
- **Database**: Convex (real-time database with automatic indexing)
- **Authentication**: Clerk for user management
- **Vector Database**: Qdrant Cloud for embedding storage
- **AI Models**: Hugging Face Inference API (ColNomic Embed Multimodal 3B for OCR)
- **Background Jobs**: AWS Lambda with Python 3.11 for document processing
- **Document Processing**: PDF-to-image conversion with multimodal OCR extraction
- **Image Annotation**: Python + OpenCV for professional computer vision processing
- **Currency APIs**: Real-time exchange rate conversion with caching

### Domain-Driven Architecture (2025)

The codebase follows a domain-driven design with strict separation of concerns:

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
- **Component Reuse**: Controlled sharing through well-defined interfaces

## Key Features

1. **Multi-Modal Document Processing**: Upload invoices/receipts (PDF/images) and extract structured financial data
2. **Transaction Management**: Create transactions from OCR data with line items, categorization, and multi-currency support
3. **Document-Transaction Linking**: Track which documents generated which transactions to prevent duplicates
4. **Interactive Document Annotations**: Visual bounding boxes showing OCR extraction areas
5. **Cross-Border Cash Flow**: Multi-currency transaction tracking with real-time conversion

## Database Schema

### Core Tables
- `users`: User profiles with home currency preferences
- `transactions`: Financial transactions with document linking (`document_id`)
- `line_items`: Itemized transaction details with proper schema mapping
- `documents`: Uploaded files with processing status and extracted data
- `conversations`: Chat history (planned)

### Key Relationships
- Documents → Transactions (1:1 via `transactions.document_id`)
- Transactions → Line Items (1:many via `line_items.accounting_entry_id`)
- Users → All entities via `user_id`

## External Services Integration

- **Convex**: Real-time database with automatic indexing and reactivity
- **AWS Lambda**: Document processing with Python 3.11, DSPy, and Gemini
- **AWS S3**: Secure file upload and document storage (finanseal-bucket)
- **AWS SES**: Transactional email sending (notifications.hellogroot.com)
- **Clerk**: Authentication and user session management
- **Hugging Face API**: ColNomic Embed Multimodal 3B for document OCR
- **Exchange Rate APIs**: Real-time currency conversion with caching

### AWS Lambda Document Processing

**Architecture**: AWS Lambda provides cost control, native AWS integration, and direct Gemini AI integration via DSPy.

**Note**: Standard Lambda with 15-minute timeout for document processing.

#### Architecture Overview
```
Vercel API → AWS OIDC Auth → Lambda Function (Python 3.11)
                                    │
                                    ├── Step 1: convert-pdf (Poppler in Layer)
                                    ├── Step 2: validate-document (Gemini)
                                    ├── Step 3: extract-data (DSPy + Gemini)
                                    └── Step 4: update-convex (HTTP API)
```

#### Key Files
- `src/lambda/document-processor-python/`: Python Lambda handler and step implementations
- `infra/`: AWS CDK infrastructure (Lambda, Layer, IAM, CloudWatch)
- `src/lambda/layers/python-document-processor/`: Docker-based Python Layer (DSPy, pdf2image, Poppler)

#### CDK Deployment
Deploy with AWS profile and region:
```bash
cd infra
npx cdk deploy --profile groot-finanseal --region us-west-2
```

**Important**: Always use `--profile groot-finanseal` for AWS credentials.

#### Lambda Environment Variables
| Variable | Description |
|----------|-------------|
| `SENTRY_DSN` | Sentry error tracking DSN |
| `SENTRY_ENVIRONMENT` | Environment name (production) |
| `NEXT_PUBLIC_CONVEX_URL` | Convex deployment URL (uses `PROD_CONVEX_URL` in CDK) |
| `GEMINI_API_KEY` | Google Gemini API key for DSPy |
| `S3_BUCKET_NAME` | S3 bucket for document storage (finanseal-bucket) |
| `POPPLER_PATH` | Path to Poppler binaries in Layer (/opt/bin) |
| `PYTHONPATH` | Python packages path in Layer (/opt/python) |

#### Lambda Resources
- **Function ARN**: `arn:aws:lambda:us-west-2:837224017779:function:finanseal-document-processor`
- **Alias ARN**: `arn:aws:lambda:us-west-2:837224017779:function:finanseal-document-processor:prod`
- **Memory**: 1024 MB
- **Timeout**: 15 minutes
- **Runtime**: Python 3.11 (x86_64)

#### Invocation Pattern
- **API Routes**: Use `@aws-sdk/client-lambda` with OIDC authentication
- **Auth**: Vercel OIDC provider → AWS IAM Role assumption
- **Response**: Fire-and-forget async invocation (202 Accepted)

## Development Guidelines

### **Core Workflow Rules**

These are the fundamental rules that govern all development work in this repository.

1.  **Rule: Prefer Modification Over Creation**
    *  Do not create new files or alternative files unless necessary. Before creating any new file, get my approval and justify yourself with proof to show none in the codebase has similar purpose. To maintain a clean and predictable project structure, you must ALWAYS seek to update existing files before creating new ones.
    *   Before creating a new file, analyze the current file tree to see if an existing file can be modified to meet the request.
    *   *Example:* Update the existing `app/page.tsx` for the main dashboard UI instead of creating a new `app/dashboard/page.tsx`, unless a new route is explicitly required.

2.  **Rule: The "Build-Fix Loop" is Mandatory**
    *   You are responsible for ensuring your code changes do not break the project. You must validate your work before reporting completion.
    *   The workflow is:
        1.  After applying code changes, ALWAYS run the `npm run build` command.
        2.  If the build fails, analyze the error message.
        3.  Apply a code change to fix the identified error.
        4.  Repeat steps 1-3 until `npm run build` completes successfully without any errors.
        5.  You may only report that your task is complete AFTER the build succeeds.

3.  **Rule: Embrace Parallel Execution**
    *   To maximize development speed, you must run tasks in parallel whenever they have no direct dependencies on each other.
    *   If a prompt contains multiple, independent workstreams (e.g., one backend task, one frontend task), you should address them simultaneously.
    *   *Example:* Setting up the Convex schema and building the frontend Clerk authentication UI are non-dependent tasks and can be executed in parallel.

4.  **Rule: Git Author for Vercel Deployments**
    *   **ALWAYS set git author before pushing or merging to main branch**:
        ```bash
        git config user.name "grootdev-ai"
        git config user.email "dev@hellogroot.com"
        ```
    *   **Why**: Vercel requires the git author to have project access. Commits from unauthorized authors will fail deployment.
    *   This applies to all commits that will be deployed to production (main branch).
    *   If a deployment fails with "Git author must have access to the project on Vercel", push an empty commit with the correct author to trigger deployment.

### **Design System Rules**

FinanSEAL implements a **Layer 1-2-3 Semantic Design System** for consistent theming across light and dark modes. These rules are **MANDATORY** for all UI component work.

5.  **Rule: Always Check Existing Components First**
    *   Before creating ANY new UI component, you MUST check existing implementations in the correct order:
        1. **Check `src/components/ui/`** - UI component library (Button, Card, Badge, etc.)
        2. **Check `src/app/globals.css`** - Available semantic tokens (--background, --foreground, --primary, etc.)
        3. **Check `tailwind.config.js`** - Custom utilities and theme extensions
        4. **Search domain components** - Look for similar patterns in `src/domains/*/components/`
    *   **Documentation**: Detailed component standards in `src/components/ui/CLAUDE.md`

6.  **Rule: Mandatory Semantic Token Usage**
    *   **NEVER use hardcoded colors**: No `bg-gray-700`, `text-white`, `border-gray-600`, `bg-blue-600`, etc.
    *   **ALWAYS use semantic tokens**: `bg-card`, `text-foreground`, `border-border`, `bg-primary`, etc.
    *   **Follow Layer Hierarchy**: `bg-background` → `bg-surface` → `bg-card` → `bg-muted` for proper elevation
    *   **Light/Dark Mode Pattern for Badges**: `bg-{color}-500/10 text-{color}-600 dark:text-{color}-400 border border-{color}-500/30`

7.  **Rule: Design Standards Compliance**
    *   **Design Language**: Material Design 3 inspired with Google-style clean aesthetics
    *   **Accessibility**: WCAG AA compliant contrast ratios (4.5:1 minimum)
    *   **Color System**: HSL-based semantic tokens with automatic light/dark adaptation
    *   **Typography**: Optimized scale with `text-foreground` → `text-muted-foreground` hierarchy
    *   **Border Radius**: Material Design rounded corners (`rounded-md` standard)
    *   **Focus States**: `ring-ring` for keyboard navigation accessibility

8.  **Rule: Component Integration Pattern**
    *   **Import from UI library**: `import { Button, Card, Badge } from '@/components/ui'`
    *   **Use CVA variants**: Prefer `<Button variant="default">` over custom styling
    *   **Test both themes**: Verify light and dark mode rendering before completion
    *   **App-level patterns**: Reference `src/app/CLAUDE.md` for modals, forms, navigation
    *   **Build validation**: Components must pass `npm run build` without errors

9.  **Rule: Modal and Overlay Standards**
    *   **Full coverage**: Backdrop must cover entire viewport with no gaps
    *   **Proper layering**: Modal content uses `m-4` for spacing, not backdrop `p-4`
    *   **Close patterns**: Use `<Button variant="ghost" size="sm">` with semantic hover states
    *   **Z-index**: Use `z-50` for modal overlays to ensure proper layering

**Quick Reference:**
- **Component docs**: `src/components/ui/CLAUDE.md` (Layer 1-2-3 system, CVA patterns)
- **App patterns**: `src/app/CLAUDE.md` (pages, modals, forms, navigation)
- **Semantic tokens**: `src/app/globals.css` (all available CSS variables)

---

### Document Processing Workflow

#### Client-to-Server Flow
1. **File Upload**: Client uploads PDF/images → AWS S3
2. **API Trigger**: Client calls `/api/documents/[documentId]/process`
3. **Non-blocking Response**: API returns 202 Accepted immediately (no timeout)
4. **Lambda Invocation**: API uses `invokeDocumentProcessor()` to start AWS Lambda

#### AWS Lambda Processing
5. **PDF Conversion**: Poppler converts PDF to images
6. **Document Validation**: Gemini validates document type
7. **Data Extraction**: DSPy + Gemini extracts structured data
8. **Convex Update**: Results stored via HTTP API

#### Key Technical Patterns
- **Fire-and-forget**: Client receives immediate response, no blocking
- **Step-based Processing**: Lambda executes sequential processing steps
- **Industry Standards**: Python + DSPy for AI extraction
- **Decoupled Architecture**: Lambda independent of Next.js app

### Currency Handling
- Store original currency/amount alongside home currency conversion
- Real-time exchange rate fetching with caching
- Support for 9 currencies: THB, IDR, MYR, SGD, USD, EUR, CNY, VND, PHP
- Historical rate preservation for audit trails

### Transaction System
- IFRS-compliant categorization with 6 transaction types
- Line items with proper database schema mapping
- Document-transaction linking to prevent duplicates
- Conditional UI states based on document status

### Expense Claims Module Architecture

The expense claims module implements a proper accounting workflow that separates pending expense requests from posted general ledger transactions, ensuring IFRS/GAAP compliance.

**Note on Naming**: The expense_claims table uses `accounting_entry_id` (not `transaction_id`) as the foreign key to the accounting_entries table. This naming convention reflects the accounting industry standard where the table is called `accounting_entries` (general ledger).

#### Accounting Principles

**Key Principle**: Only **approved** expense claims create accounting entries. Pending claims do NOT appear in the general ledger.

```
expense_claims table = "Pending Expense Requests" (workflow/approval system)
accounting_entries table = "Posted Transactions" (general ledger)
```

**Why This Matters**:
- **Accrual Basis Accounting**: Expenses recognized only when obligation is created (approval)
- **IFRS/GAAP Compliance**: Only approved expenses hit the books
- **Financial Reporting**: Prevents unapproved expenses from inflating financial statements
- **Audit Trail**: Clear separation between requests and posted transactions

#### Expense Claims Workflow

```
1. User uploads receipt
   └─→ Stored in AWS S3

2. DSPy extraction runs (AWS Lambda background job)
   └─→ Extracts: vendor, amount, currency, date, line items
   └─→ Stores in expense_claims.processing_metadata (JSONB)
   └─→ Does NOT create accounting_entries
   └─→ accounting_entry_id remains NULL

3. Manager reviews and approves
   └─→ Status changes to 'approved'
   └─→ Triggers RPC: create_accounting_entry_from_approved_claim()

4. RPC function atomically:
   └─→ Creates accounting_entries record from metadata
   └─→ Creates line_items if present
   └─→ Links expense_claims.accounting_entry_id to new accounting entry

5. Finance team processes reimbursement
   └─→ Status changes to 'reimbursed'
   └─→ Updates accounting_entries.status to 'paid'
```

#### DSPy Receipt Extraction Pipeline

**Location**: `src/lambda/document-processor-python/steps/extract_receipt.py`

**Key Components**:
1. **Multi-stage Processing**: Gemini 2.5 Flash (primary) + vLLM Skywork (fallback)
2. **Adaptive Complexity**: Simple/Medium/Complex routing based on receipt quality
3. **Business Category Integration**: Uses company-specific expense categories for auto-categorization
4. **Metadata Storage**: All extracted data stored in JSONB field

**Processing Metadata Structure**:
```typescript
processing_metadata: {
  extraction_method: 'dspy',
  extraction_timestamp: ISO8601,
  confidence_score: 0.0-1.0,
  processing_time_ms: number,

  financial_data: {
    description: string,
    vendor_name: string,
    total_amount: number,
    original_currency: string,
    home_currency: string,
    home_currency_amount: number,
    exchange_rate: number,
    transaction_date: date,
    reference_number: string | null,
    subtotal_amount: number | null,
    tax_amount: number | null
  },

  line_items: [{
    item_description: string,
    quantity: number,
    unit_price: number,
    total_amount: number,
    currency: string,
    tax_amount: number,
    tax_rate: number,
    item_category: string | null,
    line_order: number
  }],

  raw_extraction: DSPyExtractionResult
}
```

**Important**: DSPy extraction does NOT create accounting_entries. It only stores metadata.

#### Atomic RPC Functions

**1. create_accounting_entry_from_approved_claim**

**Location**: `convex/functions/expenseClaims.ts` (Convex mutation)

**Purpose**: Atomically creates accounting entries and line items when expense claim is approved

**Parameters**:
- `p_claim_id`: uuid - Expense claim ID
- `p_approver_id`: uuid - User who approved

**Returns**: `uuid` - New accounting_entries.id (transaction_id)

**Operations** (atomic transaction):
1. Reads expense_claims.processing_metadata
2. Creates accounting_entries record from financial_data
3. Creates line_items records if present
4. Updates expense_claims.transaction_id with new accounting entry ID

**Error Handling**: Raises exception if metadata missing or invalid

#### Approval Routes

**Primary Route**: `src/app/api/expense-claims/[id]/status/route.ts`

**Key Status Transitions** (Unified Direct Approval):

```typescript
'submitted' → 'approved' → 'reimbursed'
            ↓
       'rejected'
```

**Critical Code Path** (Convex mutation):
```typescript
case 'approved':
  // Set approval metadata via Convex mutation
  await convexClient.mutation(api.functions.expenseClaims.updateStatus, {
    id: claimId,
    status: 'approved',
    reviewerNotes: request.comment
  })
  // Note: Accounting entry creation handled by Convex mutation
  // The updateStatus mutation records approval metadata (approvedBy, approvedAt)
  console.log(`✅ Expense claim approved: ${claimId}`)
  break
```

**Reimbursement Handling** (Convex mutation):
```typescript
// Update expense claim status to reimbursed via Convex
await convexClient.mutation(api.functions.expenseClaims.updateStatus, {
  id: claimId,
  status: 'reimbursed',
  reviewerNotes: request.comment
})
// The Convex mutation handles updating accounting entry status to 'paid'
```

#### Database Schema

**expense_claims table**:
- `transaction_id`: uuid | NULL - Links to accounting_entries (NULL until approved)
- `processing_metadata`: JSONB - Stores extracted financial data until approval
- `vendor_name`, `total_amount`, `currency`: Duplicated for UI convenience
- `status`: Workflow state (draft/submitted/approved/rejected/reimbursed)

**accounting_entries table**:
- `id`: uuid - Primary key (linked from expense_claims.transaction_id)
- `status`: Transaction status (draft/paid/void)
- `payment_date`: Date expense was reimbursed

**Key Constraint**: `expense_claims.transaction_id` is nullable to allow pending claims without accounting entries

#### State Machine (Unified Direct Approval)

```
draft → submitted → approved → reimbursed
                  ↓
             rejected
```

**State Validation**:
- Draft → Submitted: Requires receipt attachment
- Submitted → Approved: Manager approves, creates accounting entry via Convex mutation
- Approved → Reimbursed: Updates accounting_entries.status to 'paid' via Convex
- Any → Rejected: No accounting entry created

#### Key Files

**Backend**:
- `src/lambda/document-processor-python/steps/extract_receipt.py`: DSPy extraction pipeline
- `src/app/api/expense-claims/[id]/status/route.ts`: Status transition API with Convex mutations
- `convex/functions/expenseClaims.ts`: Expense claim Convex mutations
- `src/domains/expense-claims/lib/data-access.ts`: Business logic layer

**Frontend**:
- `src/components/expense-claims/category-form-modal.tsx`: Expense category management
- `src/components/expense-claims/dspy-expense-submission-flow.tsx`: 3-step submission flow
- `src/components/expense-claims/mobile-camera-capture.tsx`: PWA camera capture

#### Testing & Validation

**End-to-End Workflow Test**:
1. Upload receipt → Verify DSPy extraction stores metadata
2. Check expense_claims.accountingEntryId is NULL
3. Check NO accounting_entries created
4. Approve claim → Verify Convex mutation creates accounting entry
5. Check expense_claims.accountingEntryId now populated
6. Verify accounting_entries record exists with correct financial data
7. Verify line_items created if present in metadata
8. Mark reimbursed → Verify accounting_entries.status = 'paid'

### AI Agent System Architecture

#### LangGraph Financial Agent
- **Agent Engine**: LangGraph-based conversational AI for financial queries
- **Security-First**: Mandatory user context validation and RLS enforcement
- **Tool Integration**: Dynamic OpenAI function calling with automatic schema generation
- **Multi-language**: English, Thai, Indonesian support

#### Agent Tool System (Single Source of Truth)
```
src/lib/tools/
├── base-tool.ts              # Abstract base class with security patterns
├── tool-factory.ts           # Registry and dynamic schema generation
├── document-search-tool.ts   # Self-describing document search tool
├── transaction-lookup-tool.ts # Self-describing transaction tool
└── index.ts                  # Module exports
```

#### Tool Architecture Flow
1. **BaseTool** - Security foundation with mandatory `getToolSchema()` 
2. **Concrete Tools** - Self-describing with OpenAI schemas
3. **ToolFactory** - Central registry with `getToolSchemas()` static method
4. **LangGraph Agent** - Uses `ToolFactory.getToolSchemas()` for function calling

#### Agent Components
- `src/lib/langgraph-agent.ts`: Main agent implementation with security validation
- `src/app/api/chat/route.ts`: Chat API endpoint with conversation management
- `src/lib/tools/`: Self-describing tool system with dynamic schema generation

#### Key Agent Patterns
- **Self-Describing Tools**: Each tool defines its own OpenAI function schema
- **Dynamic Schema Generation**: `ToolFactory.getToolSchemas()` auto-generates from registry
- **Security Enforcement**: Mandatory user context validation and RLS queries
- **Single Source of Truth**: Tool definitions in classes, no hardcoded schemas

### Key Technical Patterns
- **Trigger.dev v3 Syntax**: `tasks.trigger<typeof taskName>("task-id", payload)` 
- **Batch Processing**: `tasks.batchTrigger()` for multiple documents
- **Python Integration**: `python.runScript()` with OpenCV for image processing
- **Task Orchestration**: Downstream task triggers (`OCR → Annotation`)
- **Database schema field mapping** (`description` → `item_description`)
- **CSS scale transform handling** for bounding box positioning
- **State management** with automatic UI refresh after operations
- **Error handling** with detailed logging for debugging
- **Dynamic Tool Registration**: `ToolFactory` registry with automatic schema sync

### Lambda Document Processing Files
- `src/lambda/document-processor-python/handler.py`: Main Lambda handler
- `src/lambda/document-processor-python/steps/`: Processing step implementations
- `infra/`: AWS CDK infrastructure definitions
- `src/lib/lambda-invoker.ts`: Lambda invocation utility

### AWS System Email Lambda (CDK Stack)

**Stack**: `infra/lib/system-email-stack.ts`

**Purpose**: Transactional email sending with delivery tracking and monitoring.

**Components**:
- **SES Domain**: `notifications.hellogroot.com` (verified)
- **SES Configuration Set**: `finanseal-transactional` (delivery tracking)
- **SNS Topic**: `finanseal-email-delivery-events` (bounces, complaints, opens)
- **Welcome Workflow Lambda**: Durable workflow for user onboarding emails

**Resources**:
| Resource | ARN/Name |
|----------|----------|
| Welcome Workflow Alias | `arn:aws:lambda:us-west-2:837224017779:function:SystemEmailStack-WelcomeWorkflow:prod` |
| Email Events Topic | `finanseal-email-delivery-events` |
| Configuration Set | `finanseal-transactional` |
| Alarm Topic | `finanseal-email-alarms` |

**CloudWatch Alarms**:
- **WelcomeWorkflow-Errors**: Alert on Lambda errors
- **WelcomeWorkflow-Duration**: Alert if workflow > 4 min (timeout is 5 min)
- **SES-BounceRate**: Alert at 3% (SES suspends at 5%)
- **SES-ComplaintRate**: Alert at 0.05% (SES suspends at 0.1%)

**CDK Deployment**:
```bash
cd infra
npx cdk deploy SystemEmailStack --profile groot-finanseal --region us-west-2
```

### Build Requirements
- Mandatory `npm run build` validation before completion
- TypeScript strict mode with comprehensive error checking
- Component reusability and existing pattern following

## Active Technologies (Current Stack)

**Frontend & Backend:**
- TypeScript 5.9+ with Next.js 15.4.6 App Router
- Convex (real-time database with automatic indexing)
- Clerk (authentication and user management)
- Stripe (billing and subscriptions)

**Infrastructure:**
- AWS Lambda (Python 3.11) for document processing
- AWS S3 (finanseal-bucket) for file storage
- AWS SES (notifications.hellogroot.com) for transactional emails
- AWS CDK 2.x for infrastructure-as-code

**AWS Configuration:**
- Account: 837224017779
- Profile: `groot-finanseal`
- Region: `us-west-2`

## Recent Changes
- 004-lambda-durable-migration: Migrated document processing from Trigger.dev to AWS Lambda
- 002-convex-migration: Migrated database from Supabase PostgreSQL to Convex
- 001-stripe-subscription: Stripe billing integration
