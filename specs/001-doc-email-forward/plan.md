# Implementation Plan: Email Forwarding for Documents (Receipts & AP Invoices)

**Branch**: `001-doc-email-forward` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-doc-email-forward/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Enable users to forward expense receipts and AP invoices via email to a dedicated business inbox (`docs@{business-slug}.hellogroot.com`). AI automatically classifies document type (receipt vs invoice), extracts data using existing Gemini Vision pipeline, and routes high-confidence documents (≥85%) directly to their destination workflow (expense claims batch submission or AP invoices table). Low-confidence documents (<85%) route to a "Needs Review" inbox for manual classification. This eliminates the "download from phone → upload to web" friction and integrates seamlessly with existing document processing infrastructure.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (Next.js 15.5.7 + Convex 1.31.3), Node.js 20.x (AWS Lambda runtime), Python 3.11 (existing document processor Lambda)
**Primary Dependencies**:
- **Frontend**: Next.js 15.5.7, React 19.1.2, Convex 1.31.3 (real-time DB), Clerk 6.30.0 (auth), Radix UI, lucide-react
- **Backend**: AWS SES (email receiving), AWS Lambda (email processing), Trigger.dev (background jobs), Gemini 3.1 Flash-Lite (AI classification/extraction)
- **Existing**: `finanseal-einvoice-email-processor` Lambda (extend for all document types), `classify-document` Trigger.dev task (extend for multi-domain routing)

**Storage**:
- **Documents**: AWS S3 (`finanseal-bucket`) with CloudFront signed URLs
- **Metadata**: Convex tables (`document_inbox_entries`, `expense_claims`, `invoices`, `expense_submissions`)
- **Email forwarding config**: Convex `businesses` table (add `docInboxEmail`, `authorizedDomains`)

**Testing**:
- **Unit**: Vitest (email parser, classification logic, routing rules)
- **Integration**: Email forwarding E2E (send test email → verify document appears in destination)
- **Contract**: Verify existing `expense_claims` and `invoices` table schemas not broken

**Target Platform**:
- **Web**: Next.js 15 (app router) running on Vercel
- **Email**: AWS SES (inbound email → S3 → Lambda trigger)
- **Background Jobs**: Trigger.dev v3 (document classification and extraction)

**Project Type**: Web application (Next.js frontend + Convex backend + AWS Lambda email processor)

**Performance Goals**:
- Email processing: <30 seconds from email received → document appears in UI
- Classification: <5 seconds per document (Gemini Vision API latency)
- Batch email: Process 15 attachments in <5 minutes (parallel processing)
- Real-time UI updates: <1 second latency (Convex subscriptions)

**Constraints**:
- **Email size**: 10MB per attachment limit (AWS SES constraint)
- **Email provider limits**: Gmail/Outlook limit ~25 attachments per email
- **Confidence threshold**: 85% minimum for auto-routing (user-configurable in future)
- **Security**: Sender domain validation to prevent unauthorized submissions
- **No breaking changes**: Must not modify existing `expense_claims` or `invoices` schemas

**Scale/Scope**:
- **Users**: 100+ businesses, 1000+ users forwarding documents
- **Volume**: 50-100 documents/day per business during peak (month-end)
- **Storage**: 7-year retention = ~2.5M documents total (@ 50 docs/day/business × 100 businesses)
- **New tables**: 1 (document_inbox_entries for "Needs Review" queue)
- **Extended tables**: 2 (businesses: email config, users: notification preferences)
- **New Lambda**: None (extend existing `finanseal-einvoice-email-processor`)
- **New UI pages**: 1 ("Needs Review" inbox page)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Constitution Status**: No project-specific constitution defined (`.specify/memory/constitution.md` is template). Standard Groot Finance rules from `CLAUDE.md` apply:

### Critical Rules Compliance

✅ **Least Privilege Security**:
- SES email processing uses IAM role with scoped S3 access
- Domain validation prevents unauthorized submissions
- Convex mutations scoped to business-level access (no cross-tenant leaks)

✅ **No Breaking Changes**:
- Extends existing tables (`businesses`) with optional fields
- Does NOT modify `expense_claims` or `invoices` schemas
- Reuses existing classification pipeline (backward compatible extension)

✅ **AWS-First for AWS Operations**:
- Email processing in Lambda (not Convex actions)
- IAM-native S3 access (no exported credentials)
- SES → S3 → Lambda trigger pattern (existing infrastructure)

✅ **Documentation Update**:
- Will update `CLAUDE.md` with email forwarding architecture
- Will create `src/domains/documents-inbox/CLAUDE.md` for new domain

⚠️ **Potential Violations** (to justify in Complexity Tracking):
- **New domain**: Creates `src/domains/documents-inbox/` alongside existing domains
- **Multi-domain routing**: Classification logic spans expense-claims + invoices domains

**Re-check after Phase 1**: Verify data model doesn't introduce unexpected coupling between domains.

## Project Structure

### Documentation (this feature)

```text
specs/001-doc-email-forward/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (email parsing, SES routing, domain validation decisions)
├── data-model.md        # Phase 1 output (document_inbox_entries schema, email_forwarding_config)
├── quickstart.md        # Phase 1 output (how to test email forwarding locally)
├── contracts/           # Phase 1 output (Lambda event schemas, Convex mutation contracts)
│   ├── ses-email-event.json      # AWS SES S3 event schema
│   ├── convex-mutations.ts        # Document inbox Convex API contracts
│   └── classification-result.json # Trigger.dev classification output schema
├── checklists/
│   └── requirements.md  # Spec quality validation (already exists)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
# Groot Finance is a Next.js monorepo with domain-driven structure
src/
├── domains/
│   ├── expense-claims/          # Existing - integrate email-forwarded receipts
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── CLAUDE.md            # UPDATE: document email forwarding integration
│   ├── invoices/                # Existing - integrate email-forwarded AP invoices
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── CLAUDE.md            # UPDATE: document email forwarding integration
│   └── documents-inbox/         # NEW DOMAIN - "Needs Review" inbox for low-confidence docs
│       ├── components/
│       │   ├── needs-review-list.tsx       # Main inbox table
│       │   ├── classify-document-dialog.tsx # Manual classification modal
│       │   ├── confidence-badge.tsx        # AI confidence indicator
│       │   └── document-preview.tsx        # Thumbnail preview
│       ├── hooks/
│       │   ├── use-inbox-documents.tsx     # Convex subscription
│       │   └── use-classify-document.tsx   # Manual classification mutation
│       ├── lib/
│       │   └── data-access.ts             # Convex queries
│       ├── types/
│       │   └── inbox.ts                   # DocumentInboxEntry types
│       ├── page.tsx                       # /documents-inbox route
│       └── CLAUDE.md                      # NEW: architecture docs
├── app/
│   └── [locale]/
│       └── documents-inbox/
│           └── page.tsx                   # NEW: Server component wrapper
├── lib/
│   └── email/                             # NEW: Email parsing utilities
│       ├── parser.ts                      # RFC 5322 email parsing
│       └── attachment-extractor.ts        # Extract PDF/JPG/PNG attachments
└── components/
    └── ui/
        └── needs-review-badge.tsx         # NEW: Low-confidence indicator

convex/
├── functions/
│   ├── documentInbox.ts           # NEW: Mutations/queries for inbox
│   ├── businesses.ts              # EXTEND: Add email config fields
│   └── expenseClaims.ts           # EXTEND: Accept sourceType='email_forward'
├── schema.ts                      # EXTEND: Add document_inbox_entries table
└── lib/
    └── email-routing.ts           # NEW: Route documents to correct domain

infra/lib/
├── document-processing-stack.ts   # EXTEND: Add SES email receiving rule
└── system-email-stack.ts          # EXTEND: Configure docs@ subdomain

src/trigger/
├── classify-document.ts           # EXTEND: Multi-domain routing (receipt vs invoice)
└── email-processor.ts             # NEW: Process SES email events

tests/
├── integration/
│   ├── email-forwarding.test.ts   # E2E: Send email → verify routing
│   └── needs-review-inbox.test.ts # UI test: classify document manually
└── unit/
    ├── email-parser.test.ts       # Parse RFC 5322 emails
    └── document-router.test.ts    # Route based on confidence + type
```

**Structure Decision**: Domain-driven architecture with new `documents-inbox` domain for "Needs Review" UI. Email processing extends existing Lambda (`finanseal-einvoice-email-processor`) to avoid infrastructure duplication. Classification logic extends existing Trigger.dev task (`classify-document`) to support multi-domain routing. This structure minimizes new code and maximizes reuse of existing infrastructure.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| New `documents-inbox` domain | "Needs Review" inbox is a distinct user workflow (manual document classification) separate from expense claims and AP invoices. It serves both domains and doesn't belong in either. | Putting inbox in `expense-claims` or `invoices` domain would create tight coupling and violate single responsibility principle. Shared UI component in `src/components` was considered but "Needs Review" has its own data access layer (Convex queries) and business logic (classification, routing), making it a full domain. |
| Multi-domain classification routing | Classification logic must route documents to 2 different tables (`expense_claims` vs `invoices`) based on detected type. This requires knowledge of both domains' data models. | Creating separate classification tasks per domain would duplicate AI classification logic and waste API costs (2 Gemini calls instead of 1). Shared service layer was considered but Trigger.dev task already acts as shared service — extending it is simpler. |

**Justification**: Both violations are necessary for feature correctness and avoid worse alternatives (code duplication, tight coupling, wasted API costs). The "Needs Review" inbox is intentionally a mediating domain between email ingestion and domain-specific workflows.

---

## Phase 0: Outline & Research

**Status**: Research tasks generated below. To be completed by research agents.

### Research Tasks

1. **Email Parsing Strategy**
   - **Question**: How to parse RFC 5322 emails from AWS SES S3 stored messages?
   - **Options**: (a) `mailparser` npm library, (b) `aws-sdk/client-ses` native parser, (c) custom regex parser
   - **Research Goal**: Find best practices for Node.js Lambda email parsing with performance benchmarks

2. **Sender Domain Validation**
   - **Question**: How to validate sender email domain to prevent spoofing/unauthorized submissions?
   - **Options**: (a) SPF/DKIM verification (AWS SES provides), (b) Allowlist of authorized domains per business, (c) Both
   - **Research Goal**: Security best practices for email-based document ingestion

3. **Multi-Attachment Processing**
   - **Question**: Should Lambda process all attachments sequentially or trigger parallel Trigger.dev tasks?
   - **Options**: (a) Sequential in Lambda (simple), (b) Parallel Trigger.dev tasks (faster), (c) Batch size threshold (sequential <5, parallel ≥5)
   - **Research Goal**: Performance vs complexity tradeoff for 1-20 attachments per email

4. **Classification Extension Strategy**
   - **Question**: How to extend existing `classify-document` task for multi-domain routing without breaking expense claims?
   - **Options**: (a) Add `targetDomain` parameter, (b) Infer domain from document type, (c) Dual classification (type + domain)
   - **Research Goal**: Backward compatibility patterns for Trigger.dev task evolution

5. **Duplicate Detection**
   - **Question**: Should duplicate detection happen in Lambda (before classification) or in Convex mutation (after classification)?
   - **Options**: (a) Lambda (early rejection saves API costs), (b) Convex (centralized dedup logic), (c) Both (hash check in Lambda, metadata check in Convex)
   - **Research Goal**: Determine optimal dedup layer for 90-day window + file hash + metadata comparison

**Output Target**: `research.md` with decisions, rationale, and alternatives for each question

---

## Phase 1: Design & Contracts

**Prerequisites**: `research.md` complete (all Phase 0 questions resolved)

### Deliverables

1. **Data Model** (`data-model.md`):
   - `document_inbox_entries` table schema (Convex)
   - `businesses` table extensions (email config fields)
   - State transitions: received → classifying → extracted → routed/needs_review

2. **API Contracts** (`contracts/` directory):
   - `ses-email-event.json`: AWS SES S3 event schema (Lambda input)
   - `convex-mutations.ts`: Document inbox Convex API contracts
   - `classification-result.json`: Trigger.dev classification output schema

3. **Integration Guide** (`quickstart.md`):
   - How to test email forwarding locally (ngrok + SES simulator)
   - How to trigger classification manually (Trigger.dev dev mode)
   - How to verify document routing (check Convex tables)

4. **Agent Context Update**:
   - Run `.specify/scripts/bash/update-agent-context.sh claude`
   - Add technologies: AWS SES inbound, mailparser, email domain validation
   - Preserve existing Trigger.dev, Gemini Vision, Convex patterns

**Output Target**: Complete design artifacts ready for `/speckit.tasks` decomposition

---

## Phase 2: Task Breakdown (separate command)

**Note**: Phase 2 is executed by `/speckit.tasks` command (NOT part of `/speckit.plan`).

This plan provides the foundation for task generation:
- Technical Context → Determines implementation language/tools
- Project Structure → Defines file creation tasks
- Phase 1 Contracts → Defines API implementation tasks
- Constitution Check → Ensures compliance gates in task checklist

**Next Command**: `/speckit.tasks` to generate dependency-ordered task breakdown in `tasks.md`

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Email delivery delays** (SES → S3 → Lambda latency) | Users wait >30s for documents to appear | Add SES CloudWatch metrics + alerts. Display "Processing email..." state in UI. Convex real-time subscription shows instant updates once Lambda completes. |
| **Classification accuracy regression** (extending task breaks existing receipt validation) | Expense claims receive non-receipts | Comprehensive integration tests for existing expense claims flow. Feature flag for new multi-domain routing. Rollback plan: revert to single-domain classification. |
| **Sender domain validation too strict** (users can't forward from personal email) | Feature unusable for sole proprietors with personal email | Document authorized domains configuration in business settings. Provide "Request Access" flow for users to add new domains. Admin can override domain validation per business. |
| **"Needs Review" inbox becomes cluttered** (users ignore low-confidence docs) | 30-day auto-archive fails to clean up | Add email digest: "You have 5 documents needing review" weekly. Add bulk classify action (select multiple, assign type). Analytics dashboard for inbox usage. |
| **Duplicate detection false positives** (same amount + date flagged as duplicate) | Users can't submit legitimate duplicate expenses | Show "Possible Duplicate" badge with link to original. Allow user to confirm "Not a duplicate" action. Tune hash + metadata matching threshold based on feedback. |

**Critical Path Dependencies**:
1. SES email receiving rule → Lambda trigger (must deploy infrastructure first)
2. Classification extension → Routing logic (must resolve research Q4 before implementation)
3. Convex schema migration → UI development (schema must be deployed to prod before frontend uses it)

---

## Success Metrics (Post-Launch)

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Email forwarding adoption rate** | 85% of users try email forwarding within 30 days | Convex analytics: count users with ≥1 document where `sourceType='email_forward'` |
| **Straight-through processing rate** | 70% of documents auto-route (confidence ≥85%) | Convex analytics: `(count routed directly) / (count total documents) * 100` |
| **Classification accuracy** | ≥90% correct type detection | Manual review of 100 random samples per week for first month |
| **"Needs Review" inbox clearance time** | Average <24h from arrival to manual classification | Convex analytics: `avg(classifiedAt - createdAt)` for low-confidence docs |
| **Email processing latency** | <30s p95 from SES receipt to Convex record creation | CloudWatch Lambda metrics + Trigger.dev task duration |
| **Zero unauthorized submissions** | 100% sender domain validation success rate | CloudWatch alarms on quarantine events, weekly audit of rejected emails |

**Launch Criteria**:
- ✅ All integration tests pass (email forwarding E2E, classification accuracy, routing correctness)
- ✅ UAT completed with 3 pilot businesses (expense-heavy user, AP accountant, finance manager)
- ✅ Infrastructure deployed to production (SES email receiving, Lambda permissions, Convex schema)
- ✅ Documentation updated (CLAUDE.md architecture, quickstart guide, user help docs)
- ✅ Rollback plan tested (revert CDK stack, feature flag disable, fallback to manual upload)
