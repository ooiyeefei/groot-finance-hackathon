# Architecture Overview - FinanSEAL MVP

**Last Updated:** 2025-12-27

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  Next.js 15 App Router (React 19)                                          │
│  ├── [locale]/ (i18n routes: en, th, id)                                   │
│  ├── Tailwind CSS + Radix UI (Layer 1-2-3 Design System)                   │
│  └── TanStack Query (Server State Management)                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API LAYER                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  Next.js API Routes (/api/v1/)                                             │
│  ├── account-management/  (businesses, invitations, memberships)           │
│  ├── accounting-entries/  (transactions, line items, categories)           │
│  ├── analytics/           (dashboards, cash-flow monitoring)               │
│  ├── chat/                (conversations, messages, citations)             │
│  ├── expense-claims/      (CRUD, status, reports, categories)              │
│  ├── invoices/            (document processing, image URLs)                │
│  ├── system/              (audit, knowledge-base, webhooks)                │
│  ├── tasks/               (Trigger.dev job status)                         │
│  ├── users/               (profiles, roles, teams)                         │
│  └── utils/               (currency, security, translate)                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
┌──────────────────────┐ ┌──────────────────┐ ┌──────────────────────┐
│   BACKGROUND JOBS    │ │   AI SERVICES    │ │   EXTERNAL APIs      │
├──────────────────────┤ ├──────────────────┤ ├──────────────────────┤
│ Trigger.dev v4       │ │ LangGraph Agent  │ │ Clerk (Auth)         │
│ ├── extract-invoice  │ │ ├── Tool Factory │ │ Supabase Storage     │
│ ├── extract-receipt  │ │ ├── Doc Search   │ │ Exchange Rate APIs   │
│ ├── convert-pdf      │ │ └── Tx Lookup    │ │ Hugging Face (OCR)   │
│ └── classify-doc     │ │                  │ │ Google Gemini (AI)   │
│                      │ │ DSPy Extraction  │ │ Qdrant (Vectors)     │
│ Python Runtime       │ │ ├── Gemini 2.5   │ │ Upstash Redis        │
│ └── OpenCV annotate  │ │ └── vLLM Skywork │ │                      │
└──────────────────────┘ └──────────────────┘ └──────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA LAYER                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  Supabase PostgreSQL (RLS-enabled)                                         │
│  ├── users, businesses, business_memberships                               │
│  ├── invoices, expense_claims, accounting_entries, line_items              │
│  ├── conversations, messages                                               │
│  ├── vendors, vendor_price_history, vendorguard_*                          │
│  └── audit_events                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Domain-Driven Design Structure

```
src/
├── app/                          # Next.js App Router
│   ├── [locale]/                 # i18n-prefixed routes
│   │   ├── accounting/           # Accounting entries page
│   │   ├── ai-assistant/         # Chat interface page
│   │   ├── expense-claims/       # Expense submission page
│   │   ├── invoices/             # Invoice processing page
│   │   ├── manager/              # Manager dashboard (approvals, teams, categories)
│   │   ├── settings/             # User/business settings
│   │   └── onboarding/           # New user/business setup
│   └── api/v1/                   # Versioned API routes
│
├── domains/                      # Domain-driven modules
│   ├── account-management/       # Multi-tenancy, teams, invitations
│   ├── accounting-entries/       # General ledger operations
│   ├── analytics/                # Dashboards, metrics
│   ├── audit/                    # Compliance tracking
│   ├── chat/                     # AI assistant interface
│   ├── expense-claims/           # Expense workflow
│   ├── invoices/                 # Invoice OCR processing
│   ├── security/                 # Auth utilities
│   ├── system/                   # System config, webhooks
│   ├── tasks/                    # Job monitoring
│   ├── users/                    # User profiles
│   └── utilities/                # Shared utilities
│
├── lib/                          # Shared libraries
│   ├── langgraph-agent.ts        # AI agent engine
│   ├── tools/                    # LangGraph tool definitions
│   ├── supabase/                 # Database clients
│   └── utils/                    # Common utilities
│
├── trigger/                      # Trigger.dev task definitions
│   ├── extract-receipt-data.ts   # DSPy receipt extraction
│   ├── extract-invoice-data.ts   # Invoice OCR
│   ├── convert-pdf-to-image.ts   # PDF conversion
│   └── classify-document.ts      # Document classification
│
├── python/                       # Python scripts (OpenCV)
│   └── annotate_image.py         # Bounding box annotation
│
└── components/                   # Shared UI components
    └── ui/                       # Design system (CVA + Radix)
```

---

## Data Flow Patterns

### Document Processing Pipeline

```
┌─────────┐     ┌─────────┐     ┌────────────────┐     ┌─────────────────┐
│ Upload  │────▶│ Storage │────▶│ Trigger.dev    │────▶│ AI Extraction   │
│ (Client)│     │ (Supabase)    │ (Background)   │     │ (Gemini/DSPy)   │
└─────────┘     └─────────┘     └────────────────┘     └─────────────────┘
                                        │                       │
                                        ▼                       ▼
                               ┌────────────────┐     ┌─────────────────┐
                               │ Status Update  │◀────│ Extracted Data  │
                               │ (WebSocket/Poll)     │ (JSONB stored)  │
                               └────────────────┘     └─────────────────┘
                                        │
                                        ▼
                               ┌────────────────┐
                               │ Accounting Entry│
                               │ (On Approval)   │
                               └────────────────┘
```

### Expense Claim Workflow

```
draft ──▶ uploading ──▶ analyzing ──▶ submitted ──▶ approved ──▶ reimbursed
                              │                         │
                              ▼                         ▼
                          failed                   rejected
                                                       │
                              ▲                        ▼
                              └────── resubmit ◀──────┘
```

---

## Key Integrations

| Service | Purpose | Integration Point |
|---------|---------|-------------------|
| **Clerk** | Authentication, user management | Webhook sync, session middleware |
| **Supabase** | Database, storage, RLS | Server + client SDK |
| **Trigger.dev** | Background job processing | API trigger, Python runtime |
| **Google Gemini** | Document AI, chat agent | Vision API, Generative AI |
| **Hugging Face** | Secondary OCR models | Inference API |
| **Qdrant** | Vector search for RAG | Knowledge base queries |
| **Upstash Redis** | Caching, rate limiting | Exchange rates, session |
| **Exchange APIs** | Currency conversion | Cached real-time rates |

---

## Security Architecture

| Layer | Mechanism | Implementation |
|-------|-----------|----------------|
| **Authentication** | Clerk JWT | Middleware validation |
| **Authorization** | Role-based (Admin/Manager/Employee) | `business_memberships.role` |
| **Data Isolation** | Row Level Security | Supabase RLS policies |
| **Multi-Tenancy** | Business context | `business_id` on all tables |
| **API Security** | CSRF tokens, rate limiting | `/api/v1/utils/security/*` |
| **Audit Trail** | Event logging | `audit_events` table |

---

## Performance Considerations

### Current Bottlenecks

1. **OCR Processing Time** - Background job latency (5-30s per document)
2. **Initial Page Load** - Large JavaScript bundle size
3. **Mobile Performance** - PWA camera capture on low-end devices
4. **Database Queries** - Missing indexes on some joined queries

### Optimization Opportunities

1. Implement CDN caching for static assets
2. Add Redis caching layer for frequently accessed data
3. Optimize Trigger.dev task warm-up time
4. Implement progressive image loading
5. Add database query result caching

---

## Architectural Constraints

| Constraint | Impact | Mitigation |
|------------|--------|------------|
| Supabase RLS | Complex policy management | Standardized RLS patterns |
| Clerk Auth | Limited to Clerk ecosystem | Webhook-based sync |
| Trigger.dev Cold Starts | Initial job latency | Warm task pools |
| Next.js ISR | Not used (dynamic data) | React Query caching |
| Vercel Deployment | Serverless function limits | Trigger.dev for long tasks |

---

## Future Architecture Needs

1. **Stripe Integration** - Payment processing, subscription management
2. **Real-time Updates** - WebSocket or SSE for document status
3. **Mobile Native** - React Native or Flutter for better performance
4. **Analytics Pipeline** - Dedicated data warehouse for reporting
5. **Vendor API** - External system integrations (accounting software)
