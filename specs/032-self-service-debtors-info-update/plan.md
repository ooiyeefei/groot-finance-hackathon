# Implementation Plan: Debtor Self-Service Information Update

**Branch**: `032-self-service-debtors-info-update` | **Date**: 2026-03-22 | **Spec**: [spec.md](spec.md)

## Summary

Add a self-service flow for debtors to update their business details (TIN, BRN, address, etc.) via a public form accessed through QR codes on invoice PDFs or email links. Changes auto-apply to the customer record with a change log for admin visibility and revert capability. Action Center alerts notify admins of updates.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Next.js 15.5.7
**Primary Dependencies**: Convex 1.31.3, @react-pdf/renderer, qrcode (existing), Clerk 6.30.0 (auth bypass for public form), SES (email)
**Storage**: Convex (2 new tables: `debtor_update_tokens`, `debtor_change_log`)
**Testing**: Manual UAT (existing pattern) + `npm run build` gate
**Target Platform**: Web (mobile-responsive — debtors scan QR codes with phones)
**Project Type**: Web application (Next.js + Convex)
**Performance Goals**: Form loads in <3 seconds on mobile, submission auto-applies in <2 seconds
**Constraints**: Convex free plan bandwidth limits (keep queries minimal), Clerk 6.30.0 locked, public form no-auth
**Scale/Scope**: ~100-1000 debtors per business, <100 concurrent form sessions

## Constitution Check

*No project constitution configured. Proceeding with CLAUDE.md rules as governing document.*

Key CLAUDE.md rules verified:
- ✅ Domain-driven design: Feature lives in `src/domains/sales-invoices/` (existing debtor domain)
- ✅ Shared capabilities: QR code generation is domain-specific (not shared lib)
- ✅ Page layout: Public page is an exception — no sidebar/header (it's for external debtors)
- ✅ Convex bandwidth: Using targeted queries with indexes, no `.collect()` on large tables
- ✅ Security: Public form has rate limiting, input sanitization, token expiry
- ✅ EventBridge-first: Not applicable (no crons added)
- ✅ MCP-first: Not applicable (no new agent tools)

## Project Structure

### Documentation (this feature)

```text
specs/032-self-service-debtors-info-update/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Research decisions
├── data-model.md        # Schema design
├── quickstart.md        # Implementation guide
├── contracts/           # API contracts
│   └── convex-functions.md
├── checklists/
│   └── requirements.md  # Quality checklist
└── tasks.md             # Task breakdown (next step)
```

### Source Code (repository root)

```text
convex/
├── schema.ts                          # +2 tables, +1 field in invoiceSettings
└── functions/
    └── debtorSelfService.ts           # All token, form, change log functions

src/
├── middleware.ts                       # +1 public route
├── app/[locale]/
│   └── debtor-update/[token]/
│       └── page.tsx                   # Public form page (server component)
├── domains/sales-invoices/
│   └── components/
│       ├── public-debtor-form.tsx     # Public form (client component)
│       ├── debtor-change-log.tsx      # Change history UI
│       ├── debtor-qr-code.tsx         # QR code generator utility
│       ├── debtor-detail.tsx          # MODIFY: add change log, email button, token mgmt
│       ├── debtor-list.tsx            # MODIFY: add bulk selection + action
│       └── invoice-templates/
│           ├── pdf-document.tsx       # MODIFY: add QR code section
│           ├── template-modern.tsx    # MODIFY: add QR code section
│           └── template-classic.tsx   # MODIFY: add QR code section
│       └── invoice-settings-form.tsx  # MODIFY: add QR toggle
└── app/api/v1/
    └── debtor-info-request/
        └── route.ts                   # Email send API (single + bulk)
```

**Structure Decision**: All new code lives within the existing `sales-invoices` domain (debtors are already part of this domain). Public page follows Next.js app router conventions. Convex functions in a single file to keep the feature self-contained.
