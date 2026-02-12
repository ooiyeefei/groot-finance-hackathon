# Research: Sales Invoice Generation

**Feature**: 009-sales-invoice-generation
**Date**: 2026-02-09

## Decision Log

### D1: Invoice Data Storage Approach

**Decision**: Embed line items as arrays within the `sales_invoices` Convex table (not a separate table).

**Rationale**: The existing codebase consistently embeds line items directly in parent records (`accounting_entries.lineItems`, expense claims line items). Convex optimizes for document-based patterns with embedded arrays. Separate tables would require joins (expensive in Convex) and break the established pattern.

**Alternatives considered**:
- Separate `sales_invoice_line_items` table — rejected because Convex doesn't support joins natively, would require multiple queries and manual assembly.
- JSONB/`v.any()` field — rejected because we lose type safety. Using `v.array(v.object({...}))` provides schema validation.

---

### D2: Invoice Number Generation Strategy

**Decision**: Add a `nextSalesInvoiceNumber` counter field to the `businesses` table. Increment atomically in the `createSalesInvoice` mutation using Convex's transactional guarantees.

**Rationale**: Convex mutations are serialized per document, so incrementing a counter on the business document is atomic. The format follows `{prefix}-{YYYY}-{NNN}` (e.g., "INV-2026-001"). This guarantees uniqueness within a business without race conditions.

**Alternatives considered**:
- Timestamp-based numbering — rejected because it doesn't produce sequential, human-readable numbers.
- Separate counter table — unnecessary complexity when the business document can hold the counter.
- Client-generated numbers — rejected due to race condition risk with concurrent users.

---

### D3: PDF Generation Approach

**Decision**: Use existing `html2pdf.js` (client-side) for v1. Render the invoice template as a React component into a hidden DOM element, then convert to PDF.

**Rationale**: `html2pdf.js` is already a dependency (used in expense-claims). Client-side generation avoids new infrastructure. For SEA SME scale (<1000 invoices/business), client-side is sufficient.

**Alternatives considered**:
- Server-side PDF via Puppeteer/Playwright — requires headless browser on server, significant infrastructure change. Deferred to v2 if needed.
- `@react-pdf/renderer` — would require rewriting templates in a different component model. Adds a new dependency.
- Pre-built PDF service (e.g., DocRaptor) — external dependency, cost per document, vendor lock-in.

---

### D4: Email Delivery for Invoices

**Decision**: Extend the existing `email-service.ts` with a new `sendInvoiceEmail()` method. Use AWS SES (production) with Resend fallback (development/sandbox).

**Rationale**: The email infrastructure already exists with SES + Resend dual-provider pattern, credential management, and HTML/text template generation. Adding a new email type is a straightforward extension.

**Alternatives considered**:
- New email service — unnecessary duplication of existing infrastructure.
- Third-party invoice delivery (e.g., Stripe Invoice) — adds external dependency and cost for a feature we can build in-house.

---

### D5: Accrual-Basis Accounting Integration

**Decision**: Create two accounting entries per invoice lifecycle:
1. **On Send**: Create an Accounts Receivable entry with `transactionType: "Income"`, `status: "pending"`, linking back via `sourceDocumentType: "sales_invoice"`.
2. **On Payment**: Update the AR entry status to `"paid"` and record payment details.

**Rationale**: Accrual-basis accounting (per clarification) requires revenue recognition at issuance. The existing `accounting_entries` table already supports `sourceDocumentType` for traceability and has all needed fields (amount, currency, line items, status).

**Alternatives considered**:
- Single entry on payment (cash-basis) — rejected per user clarification.
- Separate "accounts_receivable" table — unnecessary; the existing accounting_entries table with status tracking serves the same purpose.

---

### D6: Customer Entity vs. Existing Vendor Entity

**Decision**: Create a separate `customers` table rather than extending the `vendors` table with a direction/type field.

**Rationale**: Vendors and customers serve fundamentally opposite roles (suppliers vs. buyers). The existing vendor pipeline includes OCR extraction, price history tracking, and supplier code management that doesn't apply to customers. Merging would create a confusing dual-purpose entity. The customer entity has different fields (contact person, billing address format) and different workflows.

**Alternatives considered**:
- Add `type: "vendor" | "customer"` to vendors table — rejected because it would complicate all existing vendor queries with type filters, and the two entities have divergent field sets and behaviors.
- Generic `contacts` table — over-abstraction for v1. Can consolidate later if a CRM feature is added.

---

### D7: Invoice Template Approach

**Decision**: Implement 2 invoice templates as React components that render both on-screen (preview) and for PDF generation. Templates use the semantic design system for on-screen display and inline styles for PDF output.

**Rationale**: React components can serve dual purpose (preview + PDF source). The html2pdf.js library converts rendered DOM to PDF, so using React components ensures visual consistency between preview and downloaded PDF.

**Templates**:
1. **Modern** — Clean, minimal layout with accent color bar, sans-serif typography, generous whitespace.
2. **Classic** — Traditional bordered layout with structured header/footer, professional serif typography accents.

**Alternatives considered**:
- HTML string templates — harder to maintain, no type safety, no component reuse.
- External template engine (Handlebars, EJS) — adds dependency for something React can handle natively.

---

### D8: Recurring Invoice Mechanism

**Decision**: Use Convex scheduled functions (cron jobs) to check for due recurring invoices daily. When a recurring invoice is due, auto-generate a new draft invoice by cloning the source invoice's data.

**Rationale**: Convex supports scheduled functions natively via `crons.ts`. A daily check at a fixed time (e.g., midnight UTC) is sufficient for invoice generation. The generated invoice is always a draft, requiring manual review before sending.

**Alternatives considered**:
- Trigger.dev scheduled task — the project uses Trigger.dev for OCR processing, but Convex crons are simpler for this use case since all data is in Convex.
- Client-triggered generation — unreliable; depends on user visiting the app.

---

### D9: Role-Based Access Control Implementation

**Decision**: Check `finance_admin` permission in both Convex functions (mutations/queries) and Next.js page-level auth. Use the existing `business_memberships` table role check pattern.

**Rationale**: Follows the existing pattern where the invoices page checks `roleData?.permissions?.finance_admin` server-side and redirects non-admin users. Convex mutations additionally validate the role to prevent API-level bypass.

**Alternatives considered**:
- Client-side only permission check — insufficient; mutations must also validate.
- New permission field — unnecessary; the existing role system already has finance admin concept.

---

### D10: Payment Terms Implementation

**Decision**: Store payment terms as a string enum field (`paymentTerms`) on the invoice plus a computed `dueDate`. Provide presets: "due_on_receipt", "net_15", "net_30", "net_60", "custom". For "custom", the user sets the due date directly.

**Rationale**: Presets handle 95% of use cases. The `dueDate` is auto-calculated from `invoiceDate + term days` but can be overridden for custom terms. Storing both the term label and computed date allows display of "Net 30" on the invoice while using the date for overdue calculations.

**Alternatives considered**:
- Free-text payment terms only — ambiguous, can't auto-calculate due dates.
- Days-only integer field — loses the semantic label ("Net 30" vs just "30").
