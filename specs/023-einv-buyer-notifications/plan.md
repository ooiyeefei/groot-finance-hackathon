# Implementation Plan: E-Invoice Buyer Notifications

**Branch**: `023-einv-buyer-notifications` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: GitHub Issue #312 — P1 competitive parity with Remicle for buyer notification coverage

## Summary

Implement email notifications to external buyers (customers) when e-invoice lifecycle events occur: validation by LHDN, cancellation by issuer, and rejection confirmation. Notifications are transactional (PDPA-exempt), fire via existing SES infrastructure (`notifications.hellogroot.com`), and include a notification audit log on the sales invoice record for idempotency and debugging. Business-level toggles control validation and cancellation notifications; rejection confirmations always send (buyer-initiated action).

**Technical Approach**: Extend the existing LHDN polling mechanism (`convex/functions/lhdnJobs.ts:updateSourceRecord`) and cancellation API route to trigger buyer email notifications. Create a reusable email service that validates, deduplicates (via audit log), and sends transactional emails with invoice details + MyInvois link. Log each attempt to `sales_invoices.buyerNotificationLog[]` for audit and idempotency. Add business settings toggles for notification preferences.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, React 19.1.2, AWS SES (via existing infrastructure), Zod 3.23.8
**Storage**: Convex (document database — `sales_invoices`, `businesses` extended), AWS SES (email delivery)
**Testing**: Convex dev mode + manual UAT with test account from `.env.local`
**Target Platform**: Web application (Next.js) + Convex backend + Lambda (Node.js 20, if email service needs AWS SDK)
**Project Type**: Web application with existing domain structure (`src/domains/sales-invoices/`, `convex/functions/`)
**Performance Goals**: Email delivery within 5 minutes of status detection (SC-001), zero blocking of parent workflow (SC-004)
**Constraints**: Idempotent (no duplicate emails), graceful handling of missing buyer email (skip silently), English-only v1
**Scale/Scope**: Transactional emails (not bulk marketing), 3 event types × ~100s of invoices/day per business

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Constitution File Status**: Empty template (no project-specific rules defined). No violations to check.

**General Best Practices Applied**:
- ✅ Least privilege: Email sending via existing SES domain (no new IAM permissions needed)
- ✅ Accounting standards: N/A (notification feature, not financial)
- ✅ Domain-driven design: Email service is shared capability in `src/lib/email/`, consumed by sales-invoices domain
- ✅ No screenshots/binaries in git: Documentation only
- ✅ Git author: `grootdev-ai` / `dev@hellogroot.com` (will be configured in git config)

## Project Structure

### Documentation (this feature)

```text
specs/023-einv-buyer-notifications/
├── plan.md              # This file
├── spec.md              # Feature specification (completed via /speckit.specify + /speckit.clarify)
├── research.md          # Phase 0 output (decision records for email service approach)
├── data-model.md        # Phase 1 output (sales_invoices extension, business settings)
├── quickstart.md        # Phase 1 output (dev setup, email testing guide)
├── contracts/           # Phase 1 output (email service API contract)
│   └── buyer-notification-email.schema.json
├── checklists/          # Quality validation checklists
│   └── requirements.md  # Spec validation checklist (completed)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

**Structure Decision**: This is a Next.js + Convex web application following domain-driven design. New code will extend existing `sales-invoices` domain and create a shared email service in `src/lib/email/`.

```text
src/
├── domains/
│   └── sales-invoices/
│       ├── lib/
│       │   └── buyer-notification-service.ts   # NEW: Buyer email notification orchestration
│       └── components/
│           └── (UI for business settings toggles - extending existing settings page)
├── lib/
│   └── email/
│       ├── buyer-notification-templates.ts     # NEW: Email HTML templates (validation, cancellation, rejection)
│       └── send-email.ts                       # NEW: SES email sending utility (or extend existing if found)
├── app/
│   └── api/
│       └── v1/
│           └── sales-invoices/
│               └── [invoiceId]/
│                   └── lhdn/
│                       └── cancel/
│                           └── route.ts         # EXTEND: Add buyer notification trigger on success
└── lambda/
    └── (optional: dedicated email Lambda if SES needs IAM-native access)

convex/
├── schema.ts                                    # EXTEND: sales_invoices + buyerNotificationLog[], businesses + einvoiceNotifyBuyerOnValidation/Cancellation
├── functions/
│   ├── lhdnJobs.ts                              # EXTEND: Add buyer notification trigger in updateSourceRecord (line 288-313)
│   ├── businesses.ts                            # EXTEND: Add mutations for notification settings
│   └── salesInvoices.ts                         # EXTEND: Add helper for notification log queries
└── lib/
    └── buyer-notification-helper.ts             # NEW: Shared notification log logic (idempotency check)

tests/
├── integration/
│   └── buyer-notifications.test.ts              # NEW: End-to-end notification flow tests
└── unit/
    ├── buyer-notification-service.test.ts       # NEW: Service layer unit tests
    └── email-templates.test.ts                  # NEW: Template rendering tests
```

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations detected. Standard feature implementation within existing architecture.

---

# Phase 0: Outline & Research

## Research Questions

1. **Email Sending Approach**: Should we use existing SES infrastructure directly from Convex actions (via `fetch`), create a Next.js API route, or use Lambda with IAM?
   - **Decision needed**: Assess existing `/deliver` route pattern (line 343 in lhdnJobs.ts triggers delivery route)
   - **Evaluate**: Convex action calling Next.js API route vs Lambda vs direct SES SDK

2. **Notification Log Schema**: What fields should `buyerNotificationLog[]` include for audit and idempotency?
   - **Required**: event type, recipient email, timestamp, send status
   - **Optional**: SES message ID, error message, retry count

3. **Email Templates**: Should we use HTML templates, plain text, or both?
   - **Decision**: Assess existing email templates (if any) or use simple transactional HTML

4. **Business Settings Location**: Where do business settings currently live?
   - **Find**: Existing settings page/component for e-invoice configuration
   - **Extend**: Add notification toggle fields

5. **Rejection Detection**: How does the polling detect buyer rejections?
   - **Review**: LHDN polling response codes for "rejected" vs "cancelled_by_buyer"
   - **Verify**: Issue #310 implementation (buyer rejection flow)

## Research Output Format

For each question above, document in `research.md`:
- **Decision**: [what was chosen]
- **Rationale**: [why chosen — performance, security, maintainability, existing patterns]
- **Alternatives considered**: [what else evaluated]
- **Code references**: [file paths and line numbers for existing patterns]

---

# Phase 1: Design & Contracts

**Prerequisites**: `research.md` complete with all decisions documented

## 1. Data Model (`data-model.md`)

### Schema Extensions

**Table**: `sales_invoices` (existing, extended)
- **New field**: `buyerNotificationLog: v.optional(v.array(v.object({ ... })))`
  - `eventType`: `"validation" | "cancellation" | "rejection"`
  - `recipientEmail`: `v.string()`
  - `timestamp`: `v.number()`
  - `sendStatus`: `"sent" | "skipped" | "failed"`
  - `skipReason`: `v.optional(v.string())` (e.g., "no_email", "invalid_format", "business_settings_disabled")
  - `errorMessage`: `v.optional(v.string())` (for debugging send failures)
  - `sesMessageId`: `v.optional(v.string())` (SES tracking)

**Table**: `businesses` (existing, extended)
- **New field**: `einvoiceNotifyBuyerOnValidation: v.optional(v.boolean())` (default: true if undefined)
- **New field**: `einvoiceNotifyBuyerOnCancellation: v.optional(v.boolean())` (default: true if undefined)
- Note: Rejection confirmation notifications are NOT configurable (always send per spec assumptions)

### Validation Rules

- `buyerNotificationLog[]` entries are **append-only** (never modify existing entries)
- `eventType` must be one of: `"validation"`, `"cancellation"`, `"rejection"`
- `sendStatus` transitions: initial insert = `"sent"` | `"skipped"` | `"failed"` (no state machine, just log)
- Email format validation: RFC 5322 compliant (use Zod email validator)

### Idempotency Logic

Before sending:
1. Query `buyerNotificationLog` for entries matching `{ eventType, sendStatus: "sent" }`
2. If found → skip send, log with `sendStatus: "skipped"`, `skipReason: "already_sent"`
3. If not found → proceed with send

## 2. API Contracts (`contracts/buyer-notification-email.schema.json`)

### Buyer Notification Email Service Contract

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "BuyerNotificationEmailRequest",
  "type": "object",
  "required": ["invoiceId", "businessId", "eventType"],
  "properties": {
    "invoiceId": {
      "type": "string",
      "description": "Sales invoice ID (Convex ID)"
    },
    "businessId": {
      "type": "string",
      "description": "Business ID (Convex ID)"
    },
    "eventType": {
      "type": "string",
      "enum": ["validation", "cancellation", "rejection"],
      "description": "Lifecycle event type"
    },
    "cancellationReason": {
      "type": "string",
      "description": "Required if eventType=cancellation"
    }
  }
}
```

**Response** (success):
```json
{
  "success": true,
  "data": {
    "sentTo": "buyer@example.com",
    "sesMessageId": "0000014a3e4e...",
    "loggedAt": 1710597600000
  }
}
```

**Response** (skipped):
```json
{
  "success": true,
  "skipped": true,
  "reason": "no_buyer_email" | "business_settings_disabled" | "already_sent" | "invalid_email"
}
```

**Response** (error):
```json
{
  "success": false,
  "error": "SES rate limit exceeded",
  "code": "SES_THROTTLED"
}
```

## 3. Component Integration Points

### Trigger Points

1. **Validation** (LHDN polling):
   - File: `convex/functions/lhdnJobs.ts`
   - Function: `updateSourceRecord`
   - Line: After line 300 (after issuer notification created)
   - Action: Call buyer notification service if `args.status === "valid"`

2. **Cancellation** (user-initiated):
   - File: `src/app/api/v1/sales-invoices/[invoiceId]/lhdn/cancel/route.ts`
   - Location: After successful LHDN cancellation API call response
   - Action: Call buyer notification service with `eventType: "cancellation"`, pass cancellation reason

3. **Rejection** (detected by polling):
   - File: `convex/functions/lhdnJobs.ts` (or new rejection handler if separate)
   - Function: TBD based on Issue #310 implementation review
   - Action: Call buyer notification service if rejection detected

### UI Extension (Business Settings)

- **Existing page**: (TBD — find current business/e-invoice settings page)
- **New section**: "Buyer Notifications" with two toggle switches
  - ✅ "Notify buyer when e-invoice is validated by LHDN" (default: ON)
  - ✅ "Notify buyer when I cancel an e-invoice" (default: ON)
- **Note**: "Rejection confirmation" is not configurable (per spec clarification)

## 4. Agent Context Update

Run: `.specify/scripts/bash/update-agent-context.sh claude`

**New technologies to add**:
- AWS SES (transactional email sending)
- Email validation (Zod email schema)
- Idempotency via audit log pattern

## 5. Quickstart Guide (`quickstart.md`)

### Developer Setup

1. **Environment variables** (add to `.env.local`):
   ```
   # AWS SES (already configured, verify domain)
   AWS_REGION=us-west-2
   AWS_SES_FROM_EMAIL=notifications@notifications.hellogroot.com

   # Internal service key (for API route auth)
   MCP_INTERNAL_SERVICE_KEY=<existing-value>
   ```

2. **Convex schema migration**:
   ```bash
   npx convex dev  # Auto-applies schema changes
   ```

3. **Test email sending**:
   ```bash
   # Use test account from .env.local
   TEST_USER_ADMIN=<email>
   TEST_USER_ADMIN_PW=<password>

   # Create test e-invoice → Submit to LHDN sandbox → Verify buyer email
   ```

### Testing Workflow

1. **Unit tests**: Run `npm test` (validate email templates, idempotency logic)
2. **Integration tests**: Use Convex dev mode + LHDN sandbox environment
3. **UAT**: Use test account from `.env.local`, verify emails in inbox (or SES sandbox catch-all)

---

# Phase 2: Task Breakdown

**Note**: This phase is executed by `/speckit.tasks` command, NOT by `/speckit.plan`.

The task breakdown will be generated after Phase 0 and Phase 1 are complete, using the research decisions and data model design as inputs.

---

# Next Steps

1. ✅ **Phase 0**: Generate `research.md` by answering all 5 research questions — **COMPLETE**
2. ✅ **Phase 1**: Generate `data-model.md`, `contracts/`, and `quickstart.md` based on research decisions — **COMPLETE**
3. ✅ **Phase 1**: Run agent context update script — **COMPLETE**
4. 🔄 **Phase 2**: Run `/speckit.tasks` to generate `tasks.md` with implementation tasks — **IN PROGRESS**
5. ⏸️ **Implementation**: Run `/speckit.implement` to execute tasks end-to-end

**Current Status**: Phase 0 & 1 complete. Proceeding to Phase 2 (task breakdown) and implementation.
