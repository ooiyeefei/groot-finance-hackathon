## Project Overview

FinanSEAL is a multimodal financial co-pilot web application designed for Southeast Asian SMEs. It's a Next.js-based platform that integrates AI models for intelligent document processing and conversational financial guidance.

## Architecture

- **Frontend**: Next.js 15.4.6 with App Router, TypeScript, Tailwind CSS
- **Backend**: Next.js API routes with serverless functions
- **Database**: Supabase PostgreSQL with Row Level Security (RLS)
- **Authentication**: Clerk for user management
- **Vector Database**: Qdrant Cloud for embedding storage
- **AI Models**: Hugging Face Inference API (ColNomic Embed Multimodal 3B for OCR)
- **Document Processing**: PDF-to-image conversion with multimodal OCR extraction
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

- **Hugging Face API**: ColNomic Embed Multimodal 3B for document OCR
- **Exchange Rate APIs**: Real-time currency conversion with caching
- **Supabase Storage**: Secure file upload and document storage
- **Clerk**: Authentication and user session management

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
1. File upload (PDF/images) → Supabase Storage
2. PDF conversion to image for multimodal processing
3. ColNomic Embed Multimodal 3B OCR extraction
4. Structured data mapping with bounding box coordinates
5. Transaction creation with document linking (`source_document_id`)

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

### Key Technical Patterns
- Database schema field mapping (`description` → `item_description`)
- CSS scale transform handling for bounding box positioning
- State management with automatic UI refresh after operations
- Error handling with detailed logging for debugging

### Build Requirements
- Mandatory `npm run build` validation before completion
- TypeScript strict mode with comprehensive error checking
- Component reusability and existing pattern following