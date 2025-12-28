# Product Inventory - FinanSEAL MVP

**Last Updated:** 2025-12-27
**Version:** 0.1.0 (Pre-launch MVP)

---

## Core Value Proposition

**All-in-one AI-powered finance platform for Southeast Asian SMEs** - combining intelligent document processing (invoices, receipts), multi-currency accounting, expense management with approval workflows, and vendor intelligence to automate financial operations.

---

## Target Users (Multi-Persona)

| Persona | Primary Use Cases | Key Needs |
|---------|-------------------|-----------|
| **SME Owners/Founders** | Dashboard overview, financial insights, approval decisions | Quick visibility, mobile-friendly, low friction |
| **Finance Teams** | Invoice processing, accounting entries, reporting | Accuracy, audit trail, IFRS compliance |
| **Employees** | Expense submission, reimbursement tracking | Mobile camera capture, fast processing, status visibility |
| **Managers** | Expense approvals, team oversight, category management | Batch approval, delegation, custom categories |

---

## Feature Inventory

### 1. Document Processing & OCR

| Feature | Route/Component | Technical Moat | Debt Level | Status |
|---------|-----------------|----------------|------------|--------|
| Invoice OCR Extraction | `/invoices`, `extract-invoice-data.ts` | Gemini 2.5 Flash + custom SEA receipt training | Low | Active |
| Receipt OCR (Expense Claims) | `/expense-claims`, `extract-receipt-data.ts` | DSPy pipeline with confidence scoring | Low | Active |
| PDF to Image Conversion | `convert-pdf-to-image.ts` | Trigger.dev background processing | Low | Active |
| Document Classification | `classify-document.ts` | Multi-model classification pipeline | Medium | Active |
| Multi-page Document Support | `multi-page-document-preview.tsx` | Client-side rendering with annotations | Low | Active |
| Confidence Score Display | `confidence-score-meter.tsx` | Visual quality indicator | Low | Active |

### 2. Expense Claims Module

| Feature | Route/Component | Technical Moat | Debt Level | Status |
|---------|-----------------|----------------|------------|--------|
| Mobile Camera Capture | `mobile-camera-capture.tsx` | PWA camera integration for field submission | Medium | Active |
| 3-Step Submission Flow | `expense-submission-flow.tsx` | Upload → Process → Review wizard | Low | Active |
| Manager Approval Dashboard | `/manager/approvals` | Batch approval with status transitions | Low | Active |
| Custom Expense Categories | `category-management.tsx`, `categories-management-client.tsx` | Business-defined AI categorization | High | Active |
| Monthly Expense Reports | `monthly-report-generator.tsx` | Date-range aggregation with export | Low | Active |
| Google Sheets Export | `google-sheets-export.tsx` | Direct integration for accounting teams | Medium | Active |
| Expense Analytics | `expense-analytics.tsx` | Spend tracking by category/employee | Low | Active |

### 3. Invoice & COGS Management

| Feature | Route/Component | Technical Moat | Debt Level | Status |
|---------|-----------------|----------------|------------|--------|
| Invoice Processing | `/invoices`, `documents-container.tsx` | End-to-end upload → extract → accounting | Low | Active |
| COGS Category Management | `cogs-category-management.tsx` | Business-specific cost categorization | Medium | Active |
| Line Items Extraction | `line-items-table.tsx` | Itemized invoice parsing with unit codes | Low | Active |
| Document Annotations | `document-preview-with-annotations.tsx` | Visual bounding boxes showing extraction areas | High | Active |

### 4. Accounting & Transactions

| Feature | Route/Component | Technical Moat | Debt Level | Status |
|---------|-----------------|----------------|------------|--------|
| Accounting Entries (General Ledger) | `/accounting`, `accounting-entries-client.tsx` | P&L structure: Income, COGS, Expense | Low | Active |
| Transaction Status Workflow | `status-update-button.tsx` | Draft → Paid → Overdue lifecycle | Low | Active |
| Entry Edit Modal | `accounting-entry-edit-modal.tsx` | Full CRUD with line items | Low | Active |
| View Modal with Details | `accounting-entry-view-modal.tsx` | Read-only transaction inspection | Low | Active |
| Category Assignment | `CategorySelector.tsx` | Business-specific category dropdown | Low | Active |

### 5. Multi-Currency Support

| Feature | Route/Component | Technical Moat | Debt Level | Status |
|---------|-----------------|----------------|------------|--------|
| Currency Converter | `currency-converter.tsx`, `/api/v1/utils/currency/*` | Real-time exchange rates with caching | Medium | Active |
| 9-Currency Support | Database + API | THB, IDR, MYR, SGD, USD, EUR, CNY, VND, PHP | Low | Active |
| Home Currency Conversion | Accounting entries | Automatic conversion at transaction time | Low | Active |
| Historical Rate Preservation | `exchange_rate_date` column | Audit trail for rate at transaction | Low | Active |

### 6. Business & Team Management

| Feature | Route/Component | Technical Moat | Debt Level | Status |
|---------|-----------------|----------------|------------|--------|
| Multi-Business Switching | `business-switcher.tsx` | Context-aware multi-tenancy | Low | Active |
| Team Invitations | `invitation-dialog.tsx`, `/api/v1/account-management/invitations/*` | Email-based invite flow | Low | Active |
| Role-Based Access | `business_memberships` table | Admin/Manager/Employee hierarchy | Low | Active |
| Manager Assignment | `teams-management-client.tsx` | Employee → Manager reporting structure | Low | Active |
| Business Profile Settings | `business-profile-settings.tsx` | Logo, currency, country configuration | Low | Active |

### 7. AI Assistant (Chat)

| Feature | Route/Component | Technical Moat | Debt Level | Status |
|---------|-----------------|----------------|------------|--------|
| Financial Chat Interface | `/ai-assistant`, `chat-interface.tsx` | LangGraph agent with tool calling | High | Active |
| Conversation History | `conversation-sidebar.tsx` | Persistent chat sessions | Low | Active |
| Citation Overlay | `citation-overlay.tsx` | Source attribution for AI responses | Medium | Active |
| Multi-language Support | `next-intl` integration | English, Thai, Indonesian | Low | Active |

### 8. Analytics & Dashboards

| Feature | Route/Component | Technical Moat | Debt Level | Status |
|---------|-----------------|----------------|------------|--------|
| Financial Dashboard | `FinancialDashboard.tsx` | Real-time metrics overview | Low | Active |
| Category Analysis | `CategoryAnalysis.tsx` | Spend breakdown by category | Low | Active |
| Currency Breakdown | `CurrencyBreakdown.tsx` | Multi-currency exposure view | Low | Active |
| Cash Flow Monitoring | `/api/v1/analytics/monitoring/cash-flow` | Working capital insights | Medium | Active |
| Aged Receivables/Payables | `AgedReceivablesWidget.tsx`, `AgedPayablesWidget.tsx` | Days outstanding tracking | Medium | Active |

### 9. Vendor Management (Emerging)

| Feature | Route/Component | Technical Moat | Debt Level | Status |
|---------|-----------------|----------------|------------|--------|
| Vendor Registry | `vendors` table | Centralized vendor database | Low | Schema Ready |
| VendorGuard Negotiations | `vendorguard_negotiations` table | AI-powered vendor negotiation | High | Schema Only |
| Price History Tracking | `vendor_price_history` table | Line item pricing trends | Medium | Schema Only |
| Conversation Logs | `vendorguard_conversation_logs` table | SSE streaming for negotiations | High | Schema Only |

### 10. System & Infrastructure

| Feature | Route/Component | Technical Moat | Debt Level | Status |
|---------|-----------------|----------------|------------|--------|
| Audit Events | `audit_events` table, `/api/v1/system/audit-events` | Compliance tracking | Low | Active |
| Task Status Monitoring | `/api/v1/tasks/[id]/status` | Trigger.dev job visibility | Low | Active |
| Knowledge Base Search | `/api/v1/system/knowledge-base/*` | Regulatory document RAG | Medium | Active |
| Clerk Webhooks | `/api/v1/system/webhooks/clerk` | User sync automation | Low | Active |
| Health Check | `/api/v1/utils/security/health` | System status endpoint | Low | Active |

---

## Technical Moats (Hard to Replicate)

| Moat | Description | Defensibility |
|------|-------------|---------------|
| **SEA Receipt OCR Accuracy** | Fine-tuned models for Thai, Indonesian, Malaysian receipts with local formats, tax structures, and languages | **High** - requires significant labeled data and regional expertise |
| **DSPy Extraction Pipeline** | Multi-stage extraction with confidence scoring and auto-categorization | **Medium** - proprietary prompt engineering but pattern is replicable |
| **Business-Specific Categorization** | Custom category taxonomies with AI auto-assignment using business-defined keywords | **Medium** - unique UX but technically straightforward |
| **LangGraph Financial Agent** | Domain-specific tool calling for financial queries with citation support | **Medium** - requires domain knowledge integration |
| **Multi-Currency IFRS Compliance** | Historical rate preservation and proper accounting entry structure | **Low** - standard accounting practice but well-implemented |

---

## Technical Debt Areas

| Area | Severity | Description | Impact |
|------|----------|-------------|--------|
| **Processing Performance** | High | Backend OCR and app loading times reported as slow | User experience, competitive disadvantage |
| **Stripe Integration Missing** | High | No payment/subscription system for monetization | Cannot launch paid plans |
| **VendorGuard Incomplete** | Medium | Tables created but features not implemented | Feature advertised but not usable |
| **Frontend Bundle Size** | Medium | Next.js app may have optimization opportunities | Mobile performance on slow networks |
| **Test Coverage** | Medium | Limited E2E tests for critical workflows | Regression risk on changes |

---

## API Surface

### Domain APIs (v1)

| Domain | Endpoints | CRUD Coverage |
|--------|-----------|---------------|
| `account-management` | 10 | Full |
| `accounting-entries` | 5 | Full |
| `analytics` | 3 | Read-only |
| `chat` | 5 | Full |
| `expense-claims` | 10 | Full |
| `invoices` | 4 | Full |
| `system` | 5 | Mixed |
| `tasks` | 1 | Read-only |
| `users` | 4 | Full |
| `utils` | 5 | Read-only |

---

## Database Schema (15 Tables)

| Table | RLS | Rows | Purpose |
|-------|-----|------|---------|
| `users` | Yes | 3 | User profiles |
| `businesses` | Yes | 1 | Multi-tenant businesses |
| `business_memberships` | Yes | 0 | Team roles/membership |
| `invoices` | Yes | 2 | Uploaded invoice documents |
| `expense_claims` | Yes | 24 | Employee expense submissions |
| `accounting_entries` | Yes | 3 | General ledger transactions |
| `line_items` | Yes | 24 | Transaction line items |
| `conversations` | Yes | 1 | AI chat sessions |
| `messages` | Yes | 2 | Chat message history |
| `audit_events` | Yes | 13 | Compliance audit trail |
| `vendors` | Yes | 0 | Vendor registry |
| `vendor_price_history` | Yes | 0 | Pricing intelligence |
| `vendorguard_negotiations` | Yes | 0 | AI negotiation state |
| `vendorguard_conversation_logs` | Yes | 0 | Negotiation transcripts |

---

## Current Status

- **Stage:** Pre-launch MVP (Free/Beta)
- **Primary Strength:** OCR accuracy for SEA receipts, mobile submission UX, approval workflows
- **Primary Weakness:** Processing speed, missing Stripe integration
- **Competitive Position:** vs Xero/QuickBooks (more AI-native), vs SQL System MY (better UX), vs Ramp/Brex (SEA-focused)

---

## Key Metrics to Track (Post-Launch)

- Documents processed per day/week
- OCR accuracy rate (manual corrections needed)
- Time to process (upload → accounting entry)
- Expense claim approval cycle time
- User retention by persona
- Multi-currency usage patterns
