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
- Transactions → Line Items (1:many via `line_items.transaction_id`)
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