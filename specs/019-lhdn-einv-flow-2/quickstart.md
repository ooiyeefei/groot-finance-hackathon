# Quickstart: LHDN e-Invoice Flow 2 — Expense Claim E-Invoice Retrieval

**Branch**: `019-lhdn-einv-flow-2` | **Date**: 2026-02-25

## Overview

This feature adds buyer-side e-invoice retrieval to expense claims. When employees upload receipts, the system detects merchant QR codes, auto-fills buyer-info forms via an AI agent, and matches received LHDN e-invoices back to expense claims through dual channels (email + LHDN polling).

## Architecture at a Glance

```
┌──────────────────────────────────────────────────────────────────────┐
│ PHASE 1: Receipt Upload + QR Detection                              │
│                                                                      │
│  Employee uploads receipt → Python Lambda (existing pipeline)        │
│  → New step: pyzbar QR detection → extract merchant form URL        │
│  → Store merchantFormUrl on expense_claims                           │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│ PHASE 2: AI Agent Form Fill                                          │
│                                                                      │
│  Employee clicks "Request E-Invoice"                                 │
│  → POST /api/v1/expense-claims/[id]/request-einvoice                │
│  → Convex action: Stagehand REST API → Browserbase cloud browser    │
│  → Navigate to merchant URL → fill company details → submit         │
│  → Email field: einvoice+{claimRef}@hellogroot.com                  │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│ PHASE 3: Dual-Channel Retrieval                                      │
│                                                                      │
│  Channel A (fast): Merchant emails → einvoice+{ref}@hellogroot.com  │
│    → SES receiving → S3 → Lambda → Convex action                    │
│    → Parse + suffix → deterministic match → attach to claim         │
│                                                                      │
│  Channel B (authoritative): Convex cron (every 15 min)              │
│    → LHDN GET /documents/recent?InvoiceDirection=Received           │
│    → GET /documents/{uuid}/raw → extract buyer email                │
│    → 3-tier matching → attach LHDN reference to claim               │
└──────────────────────────────────────────────────────────────────────┘
```

## Key Files to Create/Modify

### Convex (Schema + Functions)

| File | Action | Purpose |
|------|--------|---------|
| `convex/schema.ts` | Modify | Add e-invoice fields to `expense_claims`, add `einvoice_received_documents` and `einvoice_request_logs` tables |
| `convex/functions/einvoiceJobs.ts` | Create | LHDN polling action, email processing action, form-fill execution action |
| `convex/functions/einvoiceReceivedDocuments.ts` | Create | CRUD for received documents table |
| `convex/functions/expenseClaims.ts` | Modify | Add `updateEinvoiceStatus` mutation, `getEinvoiceStatus` query |
| `convex/crons.ts` | Modify | Add 15-minute cron for LHDN polling |

### Python Lambda (QR Detection)

| File | Action | Purpose |
|------|--------|---------|
| `src/lambda/document-processor-python/steps/detect_qr.py` | Create | QR code detection step using pyzbar |
| `src/lambda/document-processor-python/handler.py` | Modify | Add QR detection step to pipeline |
| `src/lambda/document-processor-python/requirements.txt` | Modify | Add `pyzbar` dependency |
| `src/lambda/document-processor-python/Dockerfile` | Modify | Add `libzbar0` system dependency |

### Next.js API Routes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/v1/expense-claims/[id]/request-einvoice/route.ts` | Create | Trigger AI agent form fill |
| `src/app/api/v1/expense-claims/[id]/upload-einvoice/route.ts` | Create | Manual e-invoice upload |
| `src/app/api/v1/expense-claims/[id]/resolve-match/route.ts` | Create | Resolve ambiguous matches |

### UI Components

| File | Action | Purpose |
|------|--------|---------|
| `src/domains/expense-claims/components/einvoice-status-badge.tsx` | Create | E-invoice status badge for list view |
| `src/domains/expense-claims/components/einvoice-section.tsx` | Create | E-invoice detail section for claim detail page |
| `src/domains/expense-claims/components/einvoice-match-review.tsx` | Create | Ambiguous match review UI |
| `src/domains/expense-claims/components/submission-detail-page.tsx` | Modify | Add e-invoice section and badge |
| `src/domains/expense-claims/components/personal-expense-dashboard.tsx` | Modify | Add e-invoice badge to claim cards |

### AWS Infrastructure (CDK)

| File | Action | Purpose |
|------|--------|---------|
| `infra/lib/email-receiving-stack.ts` | Create | SES receiving rule, S3 bucket, Lambda trigger |
| `infra/lib/document-processing-stack.ts` | Modify | Add `libzbar0` to Docker image |

## Environment Variables Needed

```bash
# Browserbase (AI browser agent)
BROWSERBASE_API_KEY=bb_...
BROWSERBASE_PROJECT_ID=...

# System email (already have GOOGLE_API_KEY for Gemini)
# MX record for hellogroot.com (or subdomain) → SES

# LHDN API (shared with Flow 1)
# Already configured via Flow 1
```

## Dependencies to Install

```bash
# npm (Next.js)
npm install @browserbasehq/stagehand  # AI browser SDK (REST API mode only)

# Python (Lambda)
# Add to requirements.txt:
# pyzbar==0.1.9
```

## Implementation Order

1. **Schema changes** → Deploy to Convex (`npx convex deploy --yes`)
2. **QR detection** → Add to Python Lambda → deploy Lambda
3. **AI agent API route** → `request-einvoice` endpoint + Stagehand integration
4. **Manual upload** → `upload-einvoice` endpoint
5. **LHDN polling** → Convex cron + matching algorithm
6. **Email receiving** → SES infrastructure + processing Lambda
7. **UI components** → Badges, detail section, match review
8. **Notifications** → E-invoice status change notifications

## Testing Strategy

- **QR detection**: Test with sample receipt images (with/without QR codes)
- **AI agent**: Test against known merchant form URLs (Shell, Grab, etc.)
- **LHDN matching**: Use LHDN sandbox environment for received document polling
- **Email channel**: Send test emails to SES endpoint
- **UI**: Manual testing + screenshot evidence
