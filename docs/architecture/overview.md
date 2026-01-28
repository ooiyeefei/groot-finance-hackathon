# System Architecture Overview

FinanSEAL is a multimodal financial co-pilot web application designed for Southeast Asian SMEs.

## Technology Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 15.4.6, App Router, TypeScript, Tailwind CSS |
| **Backend** | Next.js API routes, serverless functions (API v1) |
| **Database** | Convex (real-time, reactive) |
| **File Storage** | AWS S3 (finanseal-bucket) |
| **Authentication** | Clerk |
| **Vector Database** | Qdrant Cloud |
| **Background Jobs** | AWS Lambda (Python 3.11, DSPy) |
| **Document Processing** | Gemini AI extraction |
| **Currency APIs** | Real-time exchange rates with caching |

## Domain-Driven Architecture

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

**Principles:**
- **Self-contained**: Each domain manages its own components, hooks, services
- **API Isolation**: Domain-specific API routes under `/api/v1/{domain}/`
- **Shared Dependencies**: Common utilities in `/src/lib/`
- **Type Safety**: Domain-specific types and interfaces

## External Services

| Service | Purpose |
|---------|---------|
| **Convex** | Real-time database with automatic sync |
| **AWS S3** | Document storage (finanseal-bucket) |
| **AWS Lambda** | Document processing (Python 3.11 + DSPy + Gemini) |
| **Clerk** | Authentication and user session management |
| **Qdrant Cloud** | Vector embeddings for semantic search |
| **Stripe** | Subscription billing and plan management |

## Key Features

1. **Multi-Modal Document Processing**: Upload invoices/receipts (PDF/images) and extract structured financial data
2. **Transaction Management**: Create transactions from OCR data with line items, categorization, and multi-currency support
3. **Document-Transaction Linking**: Track which documents generated which transactions
4. **Interactive Document Annotations**: Visual bounding boxes showing OCR extraction areas
5. **Cross-Border Cash Flow**: Multi-currency transaction tracking with real-time conversion

## AI Model Usage

**Always use Gemini 3 Flash Preview** for document processing and AI extraction:

| Context | Model ID |
|---------|----------|
| Python (DSPy) | `gemini/gemini-3-flash-preview` |
| TypeScript | `gemini-3-flash-preview` |

**Configuration:**
- Timeout: 60+ seconds for complex documents
- Temperature: 0.1 for consistent extraction
- Environment: `GEMINI_API_KEY` required

## Related Documentation

- [AWS Lambda Processing](./aws-lambda.md)
- [Two-Phase Extraction](./two-phase-extraction.md)
- [Domain Architecture](../domain-architecture.md)
