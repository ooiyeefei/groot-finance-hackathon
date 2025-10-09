# Rules
1. First think through the problem, read the codebase for relevant files, and write a plan to tasks/todo.md.
2. The plan should have a list of todo items that you can check off as you complete them
3. Before you begin working, check in with me and I will verify the plan.
4. Then, begin working on the todo items, marking them as complete as you go.
5. Please every step of the way just give me a high level explanation of what changes you made
6. Make every task and code change you do as simple as possible. We want to avoid making any massive or complex changes. Every change should impact as little code as possible. Everything is about simplicity.
7. Finally, add a review section to the [todo.md](http://todo.md/) file with a summary of the changes you made and any other relevant information.

## Project Overview

FinanSEAL is a multimodal financial co-pilot web application designed for Southeast Asian SMEs. It's a Next.js-based platform that integrates AI models for intelligent document processing and conversational financial guidance.

## Architecture

- **Frontend**: Next.js 15.4.6 with App Router, TypeScript, Tailwind CSS
- **Backend**: Next.js API routes with serverless functions
- **Database**: Supabase PostgreSQL with Row Level Security (RLS)
- **Authentication**: Clerk for user management
- **Vector Database**: Qdrant Cloud for embedding storage
- **AI Models**: Hugging Face Inference API (ColNomic Embed Multimodal 3B for OCR)
- **Background Jobs**: Trigger.dev v3 with Python runtime for long-running tasks
- **Document Processing**: PDF-to-image conversion with multimodal OCR extraction
- **Image Annotation**: Python + OpenCV for professional computer vision processing  
- **Currency APIs**: Real-time exchange rate conversion with caching

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
    *   To maintain a clean and predictable project structure, you must ALWAYS seek to update existing files before creating new ones.
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

**Key Status Transitions**:

```typescript
'submitted' → 'under_review' → 'approved' → 'reimbursed'
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
- `status`: Workflow state (draft/submitted/under_review/approved/rejected/reimbursed)

**accounting_entries table**:
- `id`: uuid - Primary key (linked from expense_claims.transaction_id)
- `status`: Transaction status (draft/paid/void)
- `payment_date`: Date expense was reimbursed

**Key Constraint**: `expense_claims.transaction_id` is nullable to allow pending claims without accounting entries

#### State Machine

```
draft → submitted → under_review → approved → reimbursed
                                  ↓
                             rejected
```

**State Validation**:
- Draft → Submitted: Requires receipt attachment
- Submitted → Under Review: Manager starts review
- Under Review → Approved: Creates accounting entry via RPC
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