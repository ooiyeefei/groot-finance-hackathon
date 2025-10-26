# Rules
1. First think through the problem, read the codebase for relevant files, and write a plan to tasks/todo.md.
2. The plan should have a list of todo items that you can check off as you complete them
3. Before you begin working, check in with me and I will verify the plan.
4. Then, begin working on the todo items, marking them as complete as you go.
5. Please every step of the way just give me a high level explanation of what changes you made
6. Make every task and code change you do as simple as possible. We want to avoid making any massive or complex changes. Every change should impact as little code as possible. Everything is about simplicity.
7. Finally, add a review section to the [todo.md](http://todo.md/) file with a summary of the changes you made and any other relevant information.
8. You have access to Supabase mcp. if you encountered error access issue. Please list all the projects available to you through the MCP and ensure you are working with the correct one. Supabase project should be 'ohxwghdgsuyabgsndfzc'

## Project Overview

FinanSEAL is a multimodal financial co-pilot web application designed for Southeast Asian SMEs. It's a Next.js-based platform that integrates AI models for intelligent document processing and conversational financial guidance.

## Architecture

- **Frontend**: Next.js 15.4.6 with App Router, TypeScript, Tailwind CSS
- **Backend**: Next.js API routes with serverless functions (API v1 versioned)
- **Database**: Supabase PostgreSQL with Row Level Security (RLS)
- **Authentication**: Clerk for user management
- **Vector Database**: Qdrant Cloud for embedding storage
- **AI Models**: Hugging Face Inference API (ColNomic Embed Multimodal 3B for OCR)
- **Background Jobs**: Trigger.dev v3 with Python runtime for long-running tasks
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

- **Trigger.dev v3**: Background job processing with Python runtime support
- **Hugging Face API**: ColNomic Embed Multimodal 3B for document OCR
- **Exchange Rate APIs**: Real-time currency conversion with caching
- **Supabase Storage**: Secure file upload and document storage
- **Clerk**: Authentication and user session management

### Trigger.dev Configuration
- **Runtime**: Node.js with Python extension for computer vision tasks
- **Task Definitions**: Located in `src/trigger/` directory
- **Python Scripts**: `src/python/` with OpenCV dependencies in `requirements.txt`
- **Max Duration**: 3600 seconds for long-running OCR processing
- **Auto Retry**: 3 attempts with exponential backoff

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
    *   *Example:* Setting up the Supabase database schema and building the frontend Clerk authentication UI are non-dependent tasks and can be executed in parallel.

### **Design System Rules**

FinanSEAL implements a **Layer 1-2-3 Semantic Design System** for consistent theming across light and dark modes. These rules are **MANDATORY** for all UI component work.

4.  **Rule: Always Check Existing Components First**
    *   Before creating ANY new UI component, you MUST check existing implementations in the correct order:
        1. **Check `src/components/ui/`** - UI component library (Button, Card, Badge, etc.)
        2. **Check `src/app/globals.css`** - Available semantic tokens (--background, --foreground, --primary, etc.)
        3. **Check `tailwind.config.js`** - Custom utilities and theme extensions
        4. **Search domain components** - Look for similar patterns in `src/domains/*/components/`
    *   **Documentation**: Detailed component standards in `src/components/ui/CLAUDE.md`

5.  **Rule: Mandatory Semantic Token Usage**
    *   **NEVER use hardcoded colors**: No `bg-gray-700`, `text-white`, `border-gray-600`, `bg-blue-600`, etc.
    *   **ALWAYS use semantic tokens**: `bg-card`, `text-foreground`, `border-border`, `bg-primary`, etc.
    *   **Follow Layer Hierarchy**: `bg-background` → `bg-surface` → `bg-card` → `bg-muted` for proper elevation
    *   **Light/Dark Mode Pattern for Badges**: `bg-{color}-500/10 text-{color}-600 dark:text-{color}-400 border border-{color}-500/30`

6.  **Rule: Design Standards Compliance**
    *   **Design Language**: Material Design 3 inspired with Google-style clean aesthetics
    *   **Accessibility**: WCAG AA compliant contrast ratios (4.5:1 minimum)
    *   **Color System**: HSL-based semantic tokens with automatic light/dark adaptation
    *   **Typography**: Optimized scale with `text-foreground` → `text-muted-foreground` hierarchy
    *   **Border Radius**: Material Design rounded corners (`rounded-md` standard)
    *   **Focus States**: `ring-ring` for keyboard navigation accessibility

7.  **Rule: Component Integration Pattern**
    *   **Import from UI library**: `import { Button, Card, Badge } from '@/components/ui'`
    *   **Use CVA variants**: Prefer `<Button variant="default">` over custom styling
    *   **Test both themes**: Verify light and dark mode rendering before completion
    *   **App-level patterns**: Reference `src/app/CLAUDE.md` for modals, forms, navigation
    *   **Build validation**: Components must pass `npm run build` without errors

8.  **Rule: Modal and Overlay Standards**
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
1. **File Upload**: Client uploads PDF/images → Supabase Storage
2. **API Trigger**: Client calls `/api/documents/[documentId]/process` 
3. **Non-blocking Response**: API returns 202 Accepted immediately (no timeout)
4. **Background Job Trigger**: API uses `tasks.trigger<typeof processDocumentOCR>()` to start Trigger.dev job

#### Trigger.dev Background Processing
5. **PDF Conversion**: Two-stage hybrid architecture converts PDF to images
6. **OCR Processing**: ColNomic Embed Multimodal 3B extracts structured data with bounding boxes
7. **Downstream Annotation**: If bounding boxes exist, triggers `annotate-document-image` task
8. **Python + OpenCV Annotation**: Professional computer vision processing draws bounding boxes on images
9. **Storage & Database Update**: Stores annotated images to Supabase with `annotated_${documentId}_` prefix

#### Key Technical Patterns
- **Fire-and-forget**: Client receives immediate response, no blocking
- **Task Orchestration**: OCR task automatically triggers annotation task
- **Industry Standards**: Python + OpenCV for professional image processing
- **Decoupled Architecture**: Python runtime independent of Next.js app

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
   └─→ Stored in Supabase Storage

2. DSPy extraction runs (Trigger.dev background job)
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

**Location**: `src/trigger/dspy-receipt-extraction.ts`

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

**Location**: `supabase/migrations/20250106100000_create_accounting_entry_on_approval.sql`

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

**Critical Code Path** (lines 170-194):
```typescript
case 'approved':
  // Set approval metadata
  updateData.approval_date = now
  updateData.approved_by_ids = [...existing, userProfile.user_id]

  // ✅ ACCOUNTING PRINCIPLE: Create accounting entry ONLY when approved
  const { data: transactionId, error: rpcError } = await supabase
    .rpc('create_accounting_entry_from_approved_claim', {
      p_claim_id: claimId,
      p_approver_id: userProfile.user_id
    })

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 })
  }

  console.log(`✅ Accounting entry created: ${transactionId}`)
  break
```

**Reimbursement Handling** (lines 280-286):
```typescript
// Update accounting entry status when expense is reimbursed
if (targetStatus === 'reimbursed' && expenseClaim.transaction_id) {
  await supabase
    .from('accounting_entries')
    .update({ status: 'paid', payment_date: now })
    .eq('id', expenseClaim.transaction_id)
}
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
- Submitted → Approved: Manager approves, creates accounting entry via RPC
- Approved → Reimbursed: Updates accounting_entries.status to 'paid'
- Any → Rejected: No accounting entry created

#### Key Files

**Backend**:
- `src/trigger/dspy-receipt-extraction.ts`: DSPy extraction pipeline (lines 1695-1806 for metadata storage)
- `src/app/api/expense-claims/[id]/status/route.ts`: Status transition API with RPC calls
- `supabase/migrations/20250106100000_create_accounting_entry_on_approval.sql`: RPC function definition

**Frontend**:
- `src/components/expense-claims/category-form-modal.tsx`: Expense category management
- `src/components/expense-claims/dspy-expense-submission-flow.tsx`: 3-step submission flow
- `src/components/expense-claims/mobile-camera-capture.tsx`: PWA camera capture

#### Testing & Validation

**End-to-End Workflow Test**:
1. Upload receipt → Verify DSPy extraction stores metadata
2. Check expense_claims.transaction_id is NULL
3. Check NO accounting_entries created
4. Approve claim → Verify RPC creates accounting entry
5. Check expense_claims.transaction_id now populated
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

### Background Job Architecture Files
- `src/trigger/process-document-ocr.ts`: Main OCR processing task definition
- `src/trigger/annotate-document-image.ts`: Python + OpenCV annotation task
- `src/python/annotate_image.py`: Professional image annotation script
- `trigger.config.ts`: Python extension configuration
- `requirements.txt`: OpenCV and computer vision dependencies

### Build Requirements
- Mandatory `npm run build` validation before completion
- TypeScript strict mode with comprehensive error checking
- Component reusability and existing pattern following

<!-- TRIGGER.DEV basic START -->
# Trigger.dev Basic Tasks (v4)

**MUST use `@trigger.dev/sdk` (v4), NEVER `client.defineJob`**

## Basic Task

```ts
import { task } from "@trigger.dev/sdk";

export const processData = task({
  id: "process-data",
  retry: {
    maxAttempts: 10,
    factor: 1.8,
    minTimeoutInMs: 500,
    maxTimeoutInMs: 30_000,
    randomize: false,
  },
  run: async (payload: { userId: string; data: any[] }) => {
    // Task logic - runs for long time, no timeouts
    console.log(`Processing ${payload.data.length} items for user ${payload.userId}`);
    return { processed: payload.data.length };
  },
});
```

## Schema Task (with validation)

```ts
import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

export const validatedTask = schemaTask({
  id: "validated-task",
  schema: z.object({
    name: z.string(),
    age: z.number(),
    email: z.string().email(),
  }),
  run: async (payload) => {
    // Payload is automatically validated and typed
    return { message: `Hello ${payload.name}, age ${payload.age}` };
  },
});
```

## Scheduled Task

```ts
import { schedules } from "@trigger.dev/sdk";

const dailyReport = schedules.task({
  id: "daily-report",
  cron: "0 9 * * *", // Daily at 9:00 AM UTC
  // or with timezone: cron: { pattern: "0 9 * * *", timezone: "America/New_York" },
  run: async (payload) => {
    console.log("Scheduled run at:", payload.timestamp);
    console.log("Last run was:", payload.lastTimestamp);
    console.log("Next 5 runs:", payload.upcoming);

    // Generate daily report logic
    return { reportGenerated: true, date: payload.timestamp };
  },
});
```

## Triggering Tasks

### From Backend Code

```ts
import { tasks } from "@trigger.dev/sdk";
import type { processData } from "./trigger/tasks";

// Single trigger
const handle = await tasks.trigger<typeof processData>("process-data", {
  userId: "123",
  data: [{ id: 1 }, { id: 2 }],
});

// Batch trigger
const batchHandle = await tasks.batchTrigger<typeof processData>("process-data", [
  { payload: { userId: "123", data: [{ id: 1 }] } },
  { payload: { userId: "456", data: [{ id: 2 }] } },
]);
```

### From Inside Tasks (with Result handling)

```ts
export const parentTask = task({
  id: "parent-task",
  run: async (payload) => {
    // Trigger and continue
    const handle = await childTask.trigger({ data: "value" });

    // Trigger and wait - returns Result object, NOT task output
    const result = await childTask.triggerAndWait({ data: "value" });
    if (result.ok) {
      console.log("Task output:", result.output); // Actual task return value
    } else {
      console.error("Task failed:", result.error);
    }

    // Quick unwrap (throws on error)
    const output = await childTask.triggerAndWait({ data: "value" }).unwrap();

    // Batch trigger and wait
    const results = await childTask.batchTriggerAndWait([
      { payload: { data: "item1" } },
      { payload: { data: "item2" } },
    ]);

    for (const run of results) {
      if (run.ok) {
        console.log("Success:", run.output);
      } else {
        console.log("Failed:", run.error);
      }
    }
  },
});

export const childTask = task({
  id: "child-task",
  run: async (payload: { data: string }) => {
    return { processed: payload.data };
  },
});
```

> Never wrap triggerAndWait or batchTriggerAndWait calls in a Promise.all or Promise.allSettled as this is not supported in Trigger.dev tasks.

## Waits

```ts
import { task, wait } from "@trigger.dev/sdk";

export const taskWithWaits = task({
  id: "task-with-waits",
  run: async (payload) => {
    console.log("Starting task");

    // Wait for specific duration
    await wait.for({ seconds: 30 });
    await wait.for({ minutes: 5 });
    await wait.for({ hours: 1 });
    await wait.for({ days: 1 });

    // Wait until specific date
    await wait.until({ date: new Date("2024-12-25") });

    // Wait for token (from external system)
    await wait.forToken({
      token: "user-approval-token",
      timeoutInSeconds: 3600, // 1 hour timeout
    });

    console.log("All waits completed");
    return { status: "completed" };
  },
});
```

> Never wrap wait calls in a Promise.all or Promise.allSettled as this is not supported in Trigger.dev tasks.

## Key Points

- **Result vs Output**: `triggerAndWait()` returns a `Result` object with `ok`, `output`, `error` properties - NOT the direct task output
- **Type safety**: Use `import type` for task references when triggering from backend
- **Waits > 5 seconds**: Automatically checkpointed, don't count toward compute usage

## NEVER Use (v2 deprecated)

```ts
// BREAKS APPLICATION
client.defineJob({
  id: "job-id",
  run: async (payload, io) => {
    /* ... */
  },
});
```

Use v4 SDK (`@trigger.dev/sdk`), check `result.ok` before accessing `result.output`

<!-- TRIGGER.DEV basic END -->

<!-- TRIGGER.DEV config START -->
# Trigger.dev Configuration (v4)

**Complete guide to configuring `trigger.config.ts` with build extensions**

## Basic Configuration

```ts
import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "<project-ref>", // Required: Your project reference
  dirs: ["./trigger"], // Task directories
  runtime: "node", // "node", "node-22", or "bun"
  logLevel: "info", // "debug", "info", "warn", "error"

  // Default retry settings
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },

  // Build configuration
  build: {
    autoDetectExternal: true,
    keepNames: true,
    minify: false,
    extensions: [], // Build extensions go here
  },

  // Global lifecycle hooks
  onStart: async ({ payload, ctx }) => {
    console.log("Global task start");
  },
  onSuccess: async ({ payload, output, ctx }) => {
    console.log("Global task success");
  },
  onFailure: async ({ payload, error, ctx }) => {
    console.log("Global task failure");
  },
});
```

## Build Extensions

### Database & ORM

#### Prisma

```ts
import { prismaExtension } from "@trigger.dev/build/extensions/prisma";

extensions: [
  prismaExtension({
    schema: "prisma/schema.prisma",
    version: "5.19.0", // Optional: specify version
    migrate: true, // Run migrations during build
    directUrlEnvVarName: "DIRECT_DATABASE_URL",
    typedSql: true, // Enable TypedSQL support
  }),
];
```

#### TypeScript Decorators (for TypeORM)

```ts
import { emitDecoratorMetadata } from "@trigger.dev/build/extensions/typescript";

extensions: [
  emitDecoratorMetadata(), // Enables decorator metadata
];
```

### Scripting Languages

#### Python

```ts
import { pythonExtension } from "@trigger.dev/build/extensions/python";

extensions: [
  pythonExtension({
    scripts: ["./python/**/*.py"], // Copy Python files
    requirementsFile: "./requirements.txt", // Install packages
    devPythonBinaryPath: ".venv/bin/python", // Dev mode binary
  }),
];

// Usage in tasks
const result = await python.runInline(`print("Hello, world!")`);
const output = await python.runScript("./python/script.py", ["arg1"]);
```

### Browser Automation

#### Playwright

```ts
import { playwright } from "@trigger.dev/build/extensions/playwright";

extensions: [
  playwright({
    browsers: ["chromium", "firefox", "webkit"], // Default: ["chromium"]
    headless: true, // Default: true
  }),
];
```

#### Puppeteer

```ts
import { puppeteer } from "@trigger.dev/build/extensions/puppeteer";

extensions: [puppeteer()];

// Environment variable needed:
// PUPPETEER_EXECUTABLE_PATH: "/usr/bin/google-chrome-stable"
```

#### Lightpanda

```ts
import { lightpanda } from "@trigger.dev/build/extensions/lightpanda";

extensions: [
  lightpanda({
    version: "latest", // or "nightly"
    disableTelemetry: false,
  }),
];
```

### Media Processing

#### FFmpeg

```ts
import { ffmpeg } from "@trigger.dev/build/extensions/core";

extensions: [
  ffmpeg({ version: "7" }), // Static build, or omit for Debian version
];

// Automatically sets FFMPEG_PATH and FFPROBE_PATH
// Add fluent-ffmpeg to external packages if using
```

#### Audio Waveform

```ts
import { audioWaveform } from "@trigger.dev/build/extensions/audioWaveform";

extensions: [
  audioWaveform(), // Installs Audio Waveform 1.1.0
];
```

### System & Package Management

#### System Packages (apt-get)

```ts
import { aptGet } from "@trigger.dev/build/extensions/core";

extensions: [
  aptGet({
    packages: ["ffmpeg", "imagemagick", "curl=7.68.0-1"], // Can specify versions
  }),
];
```

#### Additional NPM Packages

Only use this for installing CLI tools, NOT packages you import in your code.

```ts
import { additionalPackages } from "@trigger.dev/build/extensions/core";

extensions: [
  additionalPackages({
    packages: ["wrangler"], // CLI tools and specific versions
  }),
];
```

#### Additional Files

```ts
import { additionalFiles } from "@trigger.dev/build/extensions/core";

extensions: [
  additionalFiles({
    files: ["wrangler.toml", "./assets/**", "./fonts/**"], // Glob patterns supported
  }),
];
```

### Environment & Build Tools

#### Environment Variable Sync

```ts
import { syncEnvVars } from "@trigger.dev/build/extensions/core";

extensions: [
  syncEnvVars(async (ctx) => {
    // ctx contains: environment, projectRef, env
    return [
      { name: "SECRET_KEY", value: await getSecret(ctx.environment) },
      { name: "API_URL", value: ctx.environment === "prod" ? "api.prod.com" : "api.dev.com" },
    ];
  }),
];
```

#### ESBuild Plugins

```ts
import { esbuildPlugin } from "@trigger.dev/build/extensions";
import { sentryEsbuildPlugin } from "@sentry/esbuild-plugin";

extensions: [
  esbuildPlugin(
    sentryEsbuildPlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
    }),
    { placement: "last", target: "deploy" } // Optional config
  ),
];
```

## Custom Build Extensions

```ts
import { defineConfig } from "@trigger.dev/sdk";

const customExtension = {
  name: "my-custom-extension",

  externalsForTarget: (target) => {
    return ["some-native-module"]; // Add external dependencies
  },

  onBuildStart: async (context) => {
    console.log(`Build starting for ${context.target}`);
    // Register esbuild plugins, modify build context
  },

  onBuildComplete: async (context, manifest) => {
    console.log("Build complete, adding layers");
    // Add build layers, modify deployment
    context.addLayer({
      id: "my-layer",
      files: [{ source: "./custom-file", destination: "/app/custom" }],
      commands: ["chmod +x /app/custom"],
    });
  },
};

export default defineConfig({
  project: "my-project",
  build: {
    extensions: [customExtension],
  },
});
```

## Advanced Configuration

### Telemetry

```ts
import { PrismaInstrumentation } from "@prisma/instrumentation";
import { OpenAIInstrumentation } from "@langfuse/openai";

export default defineConfig({
  // ... other config
  telemetry: {
    instrumentations: [new PrismaInstrumentation(), new OpenAIInstrumentation()],
    exporters: [customExporter], // Optional custom exporters
  },
});
```

### Machine & Performance

```ts
export default defineConfig({
  // ... other config
  defaultMachine: "large-1x", // Default machine for all tasks
  maxDuration: 300, // Default max duration (seconds)
  enableConsoleLogging: true, // Console logging in development
});
```

## Common Extension Combinations

### Full-Stack Web App

```ts
extensions: [
  prismaExtension({ schema: "prisma/schema.prisma", migrate: true }),
  additionalFiles({ files: ["./public/**", "./assets/**"] }),
  syncEnvVars(async (ctx) => [...envVars]),
];
```

### AI/ML Processing

```ts
extensions: [
  pythonExtension({
    scripts: ["./ai/**/*.py"],
    requirementsFile: "./requirements.txt",
  }),
  ffmpeg({ version: "7" }),
  additionalPackages({ packages: ["wrangler"] }),
];
```

### Web Scraping

```ts
extensions: [
  playwright({ browsers: ["chromium"] }),
  puppeteer(),
  additionalFiles({ files: ["./selectors.json", "./proxies.txt"] }),
];
```

## Best Practices

- **Use specific versions**: Pin extension versions for reproducible builds
- **External packages**: Add modules with native addons to the `build.external` array
- **Environment sync**: Use `syncEnvVars` for dynamic secrets
- **File paths**: Use glob patterns for flexible file inclusion
- **Debug builds**: Use `--log-level debug --dry-run` for troubleshooting

Extensions only affect deployment, not local development. Use `external` array for packages that shouldn't be bundled.

<!-- TRIGGER.DEV config END -->